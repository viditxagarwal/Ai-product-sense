"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  GitCompare,
  CheckCircle2,
  FilePlus,
  FileOutput,
  FileEdit,
  Loader2,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiGet, apiPatch } from "@/lib/api";
import { createClient } from "@/lib/supabase";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { cn } from "@/lib/utils";
import ChangeCard from "./ChangeCard";
import type { FileChange, FileVersion, ThreadFile } from "@/types";

export default function ChangesTab() {
  const { activeThreadId, selectedFileId } = useWorkspaceStore();

  const [file, setFile] = useState<ThreadFile | null>(null);
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [changes, setChanges] = useState<FileChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [bulkAction, setBulkAction] = useState<"accept" | "reject" | null>(null);

  // ── Fetch file, versions, and changes ────────────────────
  useEffect(() => {
    if (!activeThreadId || !selectedFileId) {
      setFile(null);
      setVersions([]);
      setChanges([]);
      return;
    }

    setLoading(true);

    Promise.all([
      apiGet<ThreadFile[]>(`/threads/${activeThreadId}/files`).then(
        (files) => files.find((f) => f.id === selectedFileId) ?? null
      ),
      apiGet<FileVersion[]>(`/files/${selectedFileId}/versions`),
      apiGet<FileChange[]>(`/files/${selectedFileId}/changes`),
    ])
      .then(([f, v, c]) => {
        setFile(f);
        setVersions(v);
        setChanges(c);
      })
      .catch(() => {
        setFile(null);
        setVersions([]);
        setChanges([]);
      })
      .finally(() => setLoading(false));
  }, [activeThreadId, selectedFileId]);

  // ── Supabase Realtime subscription for new changes ───────
  useEffect(() => {
    if (!versions.length) return;

    const latestVersion = versions[versions.length - 1];
    if (latestVersion.operation_type !== "targeted_edit") return;

    const supabase = createClient();
    const channel = supabase
      .channel(`changes-${latestVersion.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "file_changes",
          filter: `file_version_id=eq.${latestVersion.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setChanges((prev) => {
              const exists = prev.some((c) => c.id === (payload.new as FileChange).id);
              if (exists) return prev;
              return [...prev, payload.new as FileChange];
            });
          } else if (payload.eventType === "UPDATE") {
            setChanges((prev) =>
              prev.map((c) =>
                c.id === (payload.new as FileChange).id
                  ? (payload.new as FileChange)
                  : c
              )
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [versions]);

  // ── Derived state ────────────────────────────────────────
  const latestVersion = versions.length > 0 ? versions[versions.length - 1] : null;
  const pendingChanges = useMemo(
    () => changes.filter((c) => c.status === "pending"),
    [changes]
  );

  // ── Handlers ─────────────────────────────────────────────
  const handleChangeUpdate = useCallback(
    (id: string, status: FileChange["status"]) => {
      setChanges((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status } : c))
      );
    },
    []
  );

  async function handleBulkAction(status: "accepted" | "rejected") {
    if (!latestVersion) return;
    setBulkAction(status === "accepted" ? "accept" : "reject");
    try {
      await apiPatch<{ updated: number }>("/changes/bulk", {
        file_version_id: latestVersion.id,
        status,
      });
      setChanges((prev) =>
        prev.map((c) =>
          c.status === "pending" ? { ...c, status } : c
        )
      );
    } catch {
      // Toast handled by api client
    } finally {
      setBulkAction(null);
    }
  }

  // ── No file selected ────────────────────────────────────
  if (!selectedFileId) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <GitCompare className="size-8 text-slate-200" />
        <p className="mt-2 text-sm text-slate-400">
          Open a file to see its changes.
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

  // ── Operation type routing ──────────────────────────────
  if (!latestVersion) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <GitCompare className="size-8 text-slate-200" />
        <p className="mt-2 text-sm text-slate-400">No versions found.</p>
      </div>
    );
  }

  if (latestVersion.operation_type === "creation") {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <FilePlus className="size-8 text-blue-200" />
        <p className="mt-2 text-sm text-slate-400">
          This file was created in this thread.
        </p>
        <p className="text-xs text-slate-300">No changes to review.</p>
      </div>
    );
  }

  if (latestVersion.operation_type === "append") {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <FileOutput className="size-8 text-emerald-200" />
        <p className="mt-2 text-sm text-slate-400">
          Content was added to this file.
        </p>
        <p className="text-xs text-slate-300">
          View the full file in the Artifacts tab.
        </p>
      </div>
    );
  }

  if (latestVersion.operation_type === "bulk_rewrite") {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <FileEdit className="size-8 text-purple-200" />
        <p className="mt-2 text-sm text-slate-400">
          This file was substantially rewritten.
        </p>
        <p className="text-xs text-slate-300">
          Review the new version in the Artifacts tab.
        </p>
      </div>
    );
  }

  // ── targeted_edit with no pending changes ────────────────
  if (pendingChanges.length === 0 && changes.every((c) => c.status !== "pending")) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
          <CheckCircle2 className="size-8 text-emerald-300" />
          <p className="mt-2 text-sm text-slate-400">No pending changes.</p>
          <p className="text-xs text-slate-300">
            All changes have been reviewed.
          </p>
        </div>
        {/* Still show version timeline */}
        <VersionTimeline versions={versions} changes={changes} />
      </div>
    );
  }

  // ── Active: targeted_edit with pending changes ───────────
  return (
    <div className="flex h-full flex-col">
      {/* File header */}
      <div className="flex items-center gap-2 border-b bg-slate-50 px-3 py-2">
        <GitCompare className="size-3.5 text-slate-400" />
        <span className="truncate text-xs font-medium text-slate-700">
          {file?.file_name ?? "File"}
        </span>
        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
          {pendingChanges.length} change{pendingChanges.length !== 1 ? "s" : ""}
        </span>
        <div className="flex-1" />
        {/* Bulk actions */}
        <Button
          size="sm"
          onClick={() => handleBulkAction("accepted")}
          disabled={bulkAction !== null || pendingChanges.length === 0}
          className="h-6 gap-1 bg-emerald-600 px-2 text-[10px] hover:bg-emerald-700"
        >
          {bulkAction === "accept" ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Check className="size-3" />
          )}
          Accept All
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleBulkAction("rejected")}
          disabled={bulkAction !== null || pendingChanges.length === 0}
          className="h-6 gap-1 border-red-200 px-2 text-[10px] text-red-600 hover:bg-red-50"
        >
          {bulkAction === "reject" ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <X className="size-3" />
          )}
          Reject All
        </Button>
      </div>

      {/* Change cards */}
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {changes.map((change) => (
          <ChangeCard
            key={change.id}
            change={change}
            onUpdate={handleChangeUpdate}
          />
        ))}
      </div>

      {/* Version timeline */}
      <VersionTimeline versions={versions} changes={changes} />
    </div>
  );
}

// ── Version Timeline ────────────────────────────────────────
function VersionTimeline({
  versions,
  changes,
}: {
  versions: FileVersion[];
  changes: FileChange[];
}) {
  if (versions.length <= 1) return null;

  return (
    <div className="border-t bg-slate-50 px-3 py-2">
      <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        Version History
      </h4>
      <div className="space-y-1">
        {versions.map((v) => {
          const versionChanges = changes.filter(
            (c) => c.file_version_id === v.id
          );
          const opLabel = OP_LABELS[v.operation_type];

          return (
            <div key={v.id} className="flex items-center gap-2">
              {/* Version dot */}
              <div
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  v.operation_type === "targeted_edit"
                    ? "bg-amber-400"
                    : v.operation_type === "creation"
                      ? "bg-blue-400"
                      : v.operation_type === "append"
                        ? "bg-emerald-400"
                        : "bg-purple-400"
                )}
              />
              <span className="text-[10px] font-medium text-slate-600">
                v{v.version_number}
              </span>
              <span className="text-[10px] text-slate-400">{opLabel}</span>
              {v.operation_type === "targeted_edit" && versionChanges.length > 0 && (
                <span className="text-[10px] text-slate-400">
                  · {versionChanges.length} change
                  {versionChanges.length !== 1 ? "s" : ""}
                </span>
              )}
              <div className="flex-1" />
              <span className="text-[10px] text-slate-300">
                {new Date(v.created_at).toLocaleDateString()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const OP_LABELS: Record<FileVersion["operation_type"], string> = {
  creation: "Initial creation",
  targeted_edit: "Targeted changes",
  append: "Content appended",
  bulk_rewrite: "Bulk rewrite",
};
