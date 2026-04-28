"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import {
  Upload,
  FileText,
  Trash2,
  GripVertical,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiPost, apiDelete } from "@/lib/api";
import { createClient } from "@/lib/supabase";
import type { EnterpriseDocumentResponse } from "@/types";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  processing: "bg-blue-100 text-blue-800",
  indexed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

interface EnterpriseDocListProps {
  domainId: string;
  documents: EnterpriseDocumentResponse[];
  onRefresh: () => void;
}

export default function EnterpriseDocList({
  domainId,
  documents,
  onRefresh,
}: EnterpriseDocListProps) {
  const [uploading, setUploading] = useState(false);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      setUploading(true);
      const supabase = createClient();

      for (const file of acceptedFiles) {
        const filePath = `${domainId}/${Date.now()}-${file.name}`;

        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
          .from("documents")
          .upload(filePath, file);

        if (error) {
          console.error("Upload error:", error.message);
          continue;
        }

        // Get public URL
        const {
          data: { publicUrl },
        } = supabase.storage.from("documents").getPublicUrl(data.path);

        // Create document metadata record via API
        await apiPost("/knowledge", {
          domain_id: domainId,
          file_name: file.name,
          file_url: publicUrl,
          file_type: file.type || file.name.split(".").pop() || "unknown",
          file_size_bytes: file.size,
          priority_order: documents.length,
        });
      }

      setUploading(false);
      onRefresh();
    },
    [domainId, documents.length, onRefresh]
  );

  const handleRemove = async (docId: string) => {
    await apiDelete(`/knowledge/${docId}`);
    onRefresh();
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        [".docx"],
      "text/plain": [".txt"],
      "text/csv": [".csv"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
        ".xlsx",
      ],
    },
  });

  function formatBytes(bytes: number | null) {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${
          isDragActive
            ? "border-slate-400 bg-slate-50"
            : "border-slate-200 hover:border-slate-300"
        }`}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <Loader2 className="size-6 animate-spin text-slate-400" />
        ) : (
          <Upload className="size-6 text-slate-400" />
        )}
        <p className="mt-2 text-sm text-slate-500">
          {isDragActive
            ? "Drop files here"
            : "Drag & drop files, or click to browse"}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          PDF, DOCX, TXT, CSV, XLSX
        </p>
      </div>

      {/* Document list */}
      {documents.length > 0 && (
        <div className="divide-y rounded-lg border">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-3 px-4 py-3"
            >
              <GripVertical className="size-4 shrink-0 cursor-grab text-slate-300" />
              <FileText className="size-4 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{doc.file_name}</p>
                <p className="text-xs text-muted-foreground">
                  {doc.file_type} · {formatBytes(doc.file_size_bytes)}
                  {doc.collection !== "default" && ` · ${doc.collection}`}
                </p>
              </div>
              <Badge
                variant="secondary"
                className={STATUS_COLORS[doc.processing_status]}
              >
                {doc.processing_status}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleRemove(doc.id)}
              >
                <Trash2 className="size-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
