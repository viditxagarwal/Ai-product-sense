"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Globe,
  GitBranch,
  Settings,
  FileUp,
  X,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useDomainStore } from "@/stores/domain-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useThreadStore } from "@/stores/thread-store";
import { apiGet, apiPost } from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  WorkflowResponse,
  ConfigurationResponse,
  PaginatedResponse,
  ThreadFile,
} from "@/types";

const ACCEPTED_TYPES = ".pdf,.xlsx,.csv,.md,.txt,.json,.png,.jpg,.jpeg";

export default function ConfigGate() {
  const { domains } = useDomainStore();
  const { activeDomainId, setConfigGateOpen, setActiveThreadId } = useWorkspaceStore();
  const { createThread } = useThreadStore();

  const [workflows, setWorkflows] = useState<WorkflowResponse[]>([]);
  const [configs, setConfigs] = useState<ConfigurationResponse[]>([]);
  const [workflowId, setWorkflowId] = useState("");
  const [configId, setConfigId] = useState("");
  const [instructions, setInstructions] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loadingWf, setLoadingWf] = useState(false);
  const [loadingCfg, setLoadingCfg] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const activeDomain = domains.find((d) => d.id === activeDomainId);

  // Fetch workflows for selected domain
  useEffect(() => {
    if (!activeDomainId) return;
    setLoadingWf(true);
    setWorkflowId("");
    apiGet<PaginatedResponse<WorkflowResponse>>(
      `/workflows?domain_id=${activeDomainId}&per_page=100`
    )
      .then((res) => setWorkflows(res.data))
      .catch(() => setWorkflows([]))
      .finally(() => setLoadingWf(false));
  }, [activeDomainId]);

  // Fetch all configurations
  useEffect(() => {
    setLoadingCfg(true);
    apiGet<PaginatedResponse<ConfigurationResponse>>("/configurations?per_page=100")
      .then((res) => setConfigs(res.data))
      .catch(() => setConfigs([]))
      .finally(() => setLoadingCfg(false));
  }, []);

  const canSubmit = activeDomainId && workflowId && configId && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const title = activeDomain
        ? `${activeDomain.display_name} — ${new Date().toLocaleDateString()}`
        : "New Thread";

      const thread = await createThread({
        domain_id: activeDomainId!,
        workflow_id: workflowId,
        configuration_id: configId,
        title,
        instructions,
      });

      // Upload files if any
      // For v1, we create file records with placeholder URLs
      // Real Supabase Storage upload would go here
      for (const file of files) {
        await apiPost<ThreadFile>(`/threads/${thread.id}/files`, {
          thread_id: thread.id,
          file_name: file.name,
          file_url: `/uploads/${file.name}`,
          file_type: file.type || "application/octet-stream",
          file_size_bytes: file.size,
          source: "user_upload",
        });
      }

      setActiveThreadId(thread.id);
    } catch {
      // Toast handled by api client
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancel() {
    setConfigGateOpen(false);
  }

  // File handling
  function addFiles(newFiles: FileList | File[]) {
    const arr = Array.from(newFiles);
    setFiles((prev) => [...prev, ...arr]);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files.length) {
      addFiles(e.dataTransfer.files);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return (
    <div className="flex h-full items-start justify-center overflow-y-auto py-12">
      <div className="w-full max-w-lg space-y-5 px-6">
        {/* Header */}
        <div>
          <h2 className="text-lg font-semibold text-slate-900">New Thread</h2>
          <p className="text-sm text-slate-500">
            Select a workflow and configuration to start.
          </p>
        </div>

        {/* Step 1: Domain (locked) */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <Globe className="size-3.5" />
            Domain
          </label>
          {activeDomain ? (
            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-sm font-medium text-slate-700">
                {activeDomain.display_name}
              </span>
              <Badge variant="secondary" className="text-[10px]">
                Locked
              </Badge>
            </div>
          ) : (
            <p className="text-sm text-red-500">No domain selected — pick one in the left panel</p>
          )}
        </div>

        {/* Step 2: Workflow */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <GitBranch className="size-3.5" />
            Workflow
            <span className="text-red-400">*</span>
          </label>
          <select
            value={workflowId}
            onChange={(e) => setWorkflowId(e.target.value)}
            disabled={loadingWf}
            className={cn(
              "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm",
              "focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400",
              !workflowId && "text-slate-400"
            )}
          >
            <option value="">
              {loadingWf ? "Loading workflows..." : "Select a workflow"}
            </option>
            {workflows.map((wf) => (
              <option key={wf.id} value={wf.id}>
                {wf.workflow_name} · {wf.graph_data?.nodes?.length ?? 0} nodes
              </option>
            ))}
          </select>
          {workflows.length === 0 && !loadingWf && (
            <p className="text-xs text-amber-600">
              No workflows found for this domain. Create one in the Workflows module.
            </p>
          )}
        </div>

        {/* Step 3: Configuration */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <Settings className="size-3.5" />
            Configuration
            <span className="text-red-400">*</span>
          </label>
          <select
            value={configId}
            onChange={(e) => setConfigId(e.target.value)}
            disabled={loadingCfg}
            className={cn(
              "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm",
              "focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400",
              !configId && "text-slate-400"
            )}
          >
            <option value="">
              {loadingCfg ? "Loading configurations..." : "Select a configuration"}
            </option>
            {configs.map((cfg) => (
              <option key={cfg.id} value={cfg.id}>
                {cfg.is_baseline ? "★ " : ""}
                {cfg.config_name} · {cfg.primary_model}
                {cfg.kb_enabled ? " · RAG on" : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Step 4: Instructions */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-500">
            Task Instructions
            <span className="ml-1 font-normal text-slate-400">(optional)</span>
          </label>
          <Textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Optional: Add specific instructions for this thread (e.g., 'Use FCFE approach, project 5 years forward')"
            rows={3}
            className="resize-none text-sm"
          />
        </div>

        {/* Step 5: Project Files */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <FileUp className="size-3.5" />
            Project Files
            <span className="ml-1 font-normal text-slate-400">(optional)</span>
          </label>
          <div
            ref={dropRef}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
            className="cursor-pointer rounded-md border-2 border-dashed border-slate-200 px-4 py-4 text-center transition-colors hover:border-slate-300 hover:bg-slate-50"
          >
            <FileUp className="mx-auto size-5 text-slate-300" />
            <p className="mt-1 text-xs text-slate-400">
              Drop files here or click to browse
            </p>
            <p className="text-[10px] text-slate-300">
              PDF, Excel, CSV, Markdown, Text, JSON, Images
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {files.map((file, i) => (
                <span
                  key={i}
                  className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600"
                >
                  {file.name}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(i);
                    }}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 border-t pt-4">
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-1.5 size-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Start Thread"
            )}
          </Button>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
