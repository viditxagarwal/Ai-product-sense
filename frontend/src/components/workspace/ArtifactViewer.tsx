"use client";

import { useEffect, useState } from "react";
import {
  FileText,
  FileSpreadsheet,
  FileCode,
  Image as ImageIcon,
  File as FileIcon,
  Loader2,
  Eye,
  GitCompare,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { apiAssetUrl, apiGet } from "@/lib/api";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { ThreadFile, FileChange } from "@/types";
import ExcelViewer from "./ExcelViewer";
import MarkdownViewer from "./MarkdownViewer";
import CsvViewer from "./CsvViewer";
import PdfViewer from "./PdfViewer";
import ImageViewer from "./ImageViewer";
import CodeViewer, { guessLanguage } from "./CodeViewer";

// ── File type → icon mapping ─────────────────────────────────
const TYPE_ICONS: Record<string, typeof FileText> = {
  "text/markdown": FileText,
  "text/csv": FileSpreadsheet,
  "text/plain": FileText,
  "application/json": FileCode,
  "application/pdf": FileText,
  "image/png": ImageIcon,
  "image/jpeg": ImageIcon,
  "image/jpg": ImageIcon,
};

function getIcon(type: string) {
  return TYPE_ICONS[type] || FileIcon;
}

// ── Viewer type classification ───────────────────────────────
type ViewerType = "excel" | "markdown" | "csv" | "pdf" | "image" | "code" | "unknown";

function classifyFile(file: ThreadFile): ViewerType {
  const t = file.file_type.toLowerCase();
  const name = file.file_name.toLowerCase();

  if (
    t.includes("spreadsheetml") ||
    t.includes("excel") ||
    name.endsWith(".xlsx") ||
    name.endsWith(".xls")
  )
    return "excel";
  if (t === "text/markdown" || name.endsWith(".md")) return "markdown";
  if (t === "text/csv" || name.endsWith(".csv")) return "csv";
  if (t === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (t.startsWith("image/")) return "image";
  if (
    t === "text/plain" ||
    t === "application/json" ||
    name.endsWith(".json") ||
    name.endsWith(".txt") ||
    name.endsWith(".js") ||
    name.endsWith(".ts") ||
    name.endsWith(".py") ||
    name.endsWith(".sql") ||
    name.endsWith(".html") ||
    name.endsWith(".css") ||
    name.endsWith(".yaml") ||
    name.endsWith(".yml")
  )
    return "code";

  return "unknown";
}

export default function ArtifactViewer() {
  const { activeThreadId, selectedFileId, setActiveRightTab } = useWorkspaceStore();
  const [file, setFile] = useState<ThreadFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [binaryContent, setBinaryContent] = useState<ArrayBuffer | null>(null);
  const [pendingChanges, setPendingChanges] = useState(false);

  // Fetch file metadata
  useEffect(() => {
    if (!activeThreadId || !selectedFileId) {
      setFile(null);
      return;
    }

    setLoading(true);
    apiGet<ThreadFile[]>(`/threads/${activeThreadId}/files`)
      .then((files) => {
        const found = files.find((f) => f.id === selectedFileId) ?? null;
        setFile(found);
      })
      .catch(() => setFile(null))
      .finally(() => setLoading(false));
  }, [activeThreadId, selectedFileId]);

  // Fetch file content when file is set
  useEffect(() => {
    if (!file) {
      setTextContent(null);
      setBinaryContent(null);
      return;
    }

    const viewerType = classifyFile(file);

    // For legacy simulated files, show a placeholder.
    if (file.file_url.startsWith("/simulated/")) {
      if (viewerType === "markdown") {
        setTextContent(
          `# ${file.file_name}\n\n` +
          `*This is a simulated file generated during execution.*\n\n` +
          `File type: \`${file.file_type}\`\n` +
          `Version: ${file.current_version}\n` +
          `Source: ${file.source === "ai_generated" ? "AI Generated" : "User Upload"}`
        );
      } else if (viewerType === "code" || viewerType === "csv") {
        setTextContent(
          `// Simulated content for ${file.file_name}\n// Real content will be available with Supabase Storage integration`
        );
      } else {
        setTextContent(null);
      }
      setBinaryContent(null);
      return;
    }

    // Fetch real content
    const fileUrl = apiAssetUrl(file.file_url);
    if (viewerType === "excel") {
      fetch(fileUrl)
        .then((r) => r.arrayBuffer())
        .then(setBinaryContent)
        .catch(() => setBinaryContent(null));
    } else if (viewerType === "pdf" || viewerType === "image") {
      // These use the URL directly, no content fetch needed
      setTextContent(null);
      setBinaryContent(null);
    } else {
      fetch(fileUrl)
        .then((r) => r.text())
        .then(setTextContent)
        .catch(() => setTextContent(null));
    }
  }, [file]);

  // Check for pending changes
  useEffect(() => {
    if (!selectedFileId) {
      setPendingChanges(false);
      return;
    }
    apiGet<FileChange[]>(`/files/${selectedFileId}/changes`)
      .then((changes) => {
        setPendingChanges(changes.some((c) => c.status === "pending"));
      })
      .catch(() => setPendingChanges(false));
  }, [selectedFileId]);

  // ── Empty state ────────────────────────────────────────────
  if (!selectedFileId) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <Eye className="size-8 text-slate-200" />
        <p className="mt-2 text-sm text-slate-400">
          Select a file from the left panel or click a file attachment in the
          chat to view it here.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-slate-300" />
      </div>
    );
  }

  if (!file) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-sm text-slate-400">File not found</p>
      </div>
    );
  }

  const viewerType = classifyFile(file);
  const Icon = getIcon(file.file_type);
  const fileUrl = apiAssetUrl(file.file_url);

  return (
    <div className="flex h-full flex-col">
      {/* ── File header bar ─────────────────────────────── */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Icon className="size-4 shrink-0 text-slate-400" />
        <span className="truncate text-sm font-medium text-slate-700">
          {file.file_name}
        </span>
        <Badge variant="secondary" className="shrink-0 text-[10px]">
          v{file.current_version}
        </Badge>
        <span
          className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-medium ${
            file.source === "ai_generated"
              ? "bg-purple-50 text-purple-600"
              : "bg-slate-100 text-slate-500"
          }`}
        >
          {file.source === "ai_generated" ? "AI" : "Uploaded"}
        </span>
        <div className="flex-1" />
        {pendingChanges && (
          <button
            onClick={() => setActiveRightTab("changes")}
            className="flex items-center gap-1 text-[10px] font-medium text-amber-600 hover:text-amber-700"
          >
            <GitCompare className="size-3" />
            View Changes
          </button>
        )}
      </div>

      {/* ── Viewer ──────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden">
        {viewerType === "excel" && binaryContent ? (
          <ExcelViewer content={binaryContent} />
        ) : viewerType === "markdown" && textContent ? (
          <MarkdownViewer content={textContent} />
        ) : viewerType === "csv" && textContent ? (
          <CsvViewer content={textContent} />
        ) : viewerType === "pdf" ? (
          <PdfViewer fileUrl={fileUrl} />
        ) : viewerType === "image" ? (
          <ImageViewer fileUrl={fileUrl} fileName={file.file_name} />
        ) : viewerType === "code" && textContent ? (
          <CodeViewer
            content={textContent}
            language={guessLanguage(file.file_name)}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center">
            <FileIcon className="size-8 text-slate-200" />
            <p className="mt-2 text-sm text-slate-400">
              Preview not available for this file type
            </p>
            <p className="text-xs text-slate-300">{file.file_type}</p>
          </div>
        )}
      </div>
    </div>
  );
}
