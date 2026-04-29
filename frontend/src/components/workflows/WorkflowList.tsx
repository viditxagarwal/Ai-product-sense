"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, GitBranch, Trash2, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CardGridSkeleton } from "@/components/ui/skeletons";
import { useWorkflowStore } from "@/stores/workflow-store";
import { useDomainStore } from "@/stores/domain-store";
import TemplatePicker from "./TemplatePicker";
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from "./workflowTemplates";
import type { WorkflowResponse } from "@/types";

export default function WorkflowList() {
  const router = useRouter();
  const {
    workflows,
    loading,
    fetchWorkflows,
    createWorkflow,
    deleteWorkflow,
  } = useWorkflowStore();
  const { domains, fetchDomains } = useDomainStore();

  const [filterDomain, setFilterDomain] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newDomainId, setNewDomainId] = useState("");
  const [creating, setCreating] = useState(false);
  const [quickStartOpen, setQuickStartOpen] = useState(false);
  const [quickStartDomain, setQuickStartDomain] = useState("");
  const [quickStartName, setQuickStartName] = useState("ReAct Agent");

  // Pending workflow metadata (set in step 1, used after template pick)
  const [pendingMeta, setPendingMeta] = useState<{
    name: string;
    desc: string;
    domainId: string;
  } | null>(null);

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  useEffect(() => {
    if (filterDomain === "all") {
      fetchWorkflows();
    } else {
      fetchWorkflows(filterDomain);
    }
  }, [filterDomain, fetchWorkflows]);

  // Step 1: user fills name/domain, clicks "Next" → opens template picker
  const handleNext = () => {
    if (!newName.trim() || !newDomainId) return;
    setPendingMeta({
      name: newName.trim(),
      desc: newDesc.trim(),
      domainId: newDomainId,
    });
    setDialogOpen(false);
    setTemplatePickerOpen(true);
  };

  // Step 2: user picks a template → create workflow with pre-wired graph
  const handleTemplateSelect = async (template: WorkflowTemplate) => {
    if (!pendingMeta) return;
    setTemplatePickerOpen(false);
    setCreating(true);
    try {
      const graph = template.graph();
      const wf = await createWorkflow({
        domain_id: pendingMeta.domainId,
        workflow_name: pendingMeta.name,
        description: pendingMeta.desc,
        template_source: template.id === "blank" ? undefined : template.label,
        graph_data: {
          nodes: graph.nodes as unknown as Record<string, unknown>[],
          edges: graph.edges as unknown as Record<string, unknown>[],
        },
      });
      // Reset form state
      setNewName("");
      setNewDesc("");
      setNewDomainId("");
      setPendingMeta(null);
      const qs = template.id === "react_agent" ? "?onboarding=react" : "";
      router.push(`/workflows/${wf.id}${qs}`);
    } finally {
      setCreating(false);
    }
  };

  // Quick Start: create a ReAct Agent workflow directly
  const handleQuickStart = async () => {
    if (!quickStartDomain) return;
    setQuickStartOpen(false);
    setCreating(true);
    try {
      const reactTemplate = WORKFLOW_TEMPLATES.find((t) => t.id === "react_agent")!;
      const graph = reactTemplate.graph();
      const wf = await createWorkflow({
        domain_id: quickStartDomain,
        workflow_name: quickStartName.trim() || "ReAct Agent",
        template_source: "ReAct Agent",
        graph_data: {
          nodes: graph.nodes as unknown as Record<string, unknown>[],
          edges: graph.edges as unknown as Record<string, unknown>[],
        },
      });
      setQuickStartDomain("");
      setQuickStartName("ReAct Agent");
      router.push(`/workflows/${wf.id}?onboarding=react`);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, wf: WorkflowResponse) => {
    e.stopPropagation();
    if (!confirm(`Delete "${wf.workflow_name}"? This cannot be undone.`)) return;
    await deleteWorkflow(wf.id);
  };

  const getNodeCount = (wf: WorkflowResponse) => {
    const nodes = wf.graph_data?.nodes || [];
    return nodes.filter((n: Record<string, unknown>) => !["start", "end"].includes(n.type as string)).length;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Workflows</h1>
          <p className="text-sm text-muted-foreground">
            Design agentic workflows with a visual canvas editor.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button disabled={creating}>
              <Plus className="mr-1 size-4" />
              {creating ? "Creating..." : "New Workflow"}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Workflow</DialogTitle>
              <DialogDescription>
                Name your workflow and assign it to a domain. You&apos;ll pick a pattern next.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Workflow Name</Label>
                <Input
                  placeholder="e.g., Financial Analysis Pipeline"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Domain</Label>
                <Select value={newDomainId} onValueChange={setNewDomainId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a domain" />
                  </SelectTrigger>
                  <SelectContent>
                    {domains.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Textarea
                  placeholder="What does this workflow do?"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleNext}
                disabled={!newName.trim() || !newDomainId}
              >
                Next: Pick Pattern
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Quick Start: ReAct Agent card */}
      <button
        onClick={() => setQuickStartOpen(true)}
        disabled={creating}
        className="flex w-full items-center gap-4 rounded-lg border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 text-left transition-all hover:border-blue-300 hover:shadow-md"
      >
        <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-blue-500">
          <Zap className="size-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-800">
              Quick Start: ReAct Agent
            </span>
            <Badge className="bg-blue-500 text-[9px] text-white hover:bg-blue-500">
              Most Common
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Create a tool-using agent in seconds. It thinks, acts, observes, and repeats until done.
          </p>
        </div>
        <span className="shrink-0 text-xs font-medium text-blue-600">
          Create &rarr;
        </span>
      </button>

      {/* Quick Start domain picker dialog */}
      <Dialog open={quickStartOpen} onOpenChange={setQuickStartOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Quick Start: ReAct Agent</DialogTitle>
            <DialogDescription>
              Pick a domain and name, then you&apos;re on the canvas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Workflow Name</Label>
              <Input
                placeholder="ReAct Agent"
                value={quickStartName}
                onChange={(e) => setQuickStartName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Domain</Label>
              <Select value={quickStartDomain} onValueChange={setQuickStartDomain}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a domain" />
                </SelectTrigger>
                <SelectContent>
                  {domains.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickStartOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleQuickStart} disabled={!quickStartDomain || creating}>
              {creating ? "Creating..." : "Create ReAct Agent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template picker dialog (step 2) */}
      <TemplatePicker
        open={templatePickerOpen}
        onOpenChange={(open) => {
          setTemplatePickerOpen(open);
          if (!open) setPendingMeta(null);
        }}
        onSelect={handleTemplateSelect}
        mode="create"
      />

      {/* Domain filter */}
      <div className="flex items-center gap-2">
        <Label className="text-xs text-slate-500">Filter by domain:</Label>
        <Select value={filterDomain} onValueChange={setFilterDomain}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Domains</SelectItem>
            {domains.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Workflow grid */}
      {loading ? (
        <CardGridSkeleton count={3} />
      ) : workflows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <GitBranch className="mx-auto mb-3 size-10 text-slate-300" />
            <p className="text-sm text-muted-foreground">
              No workflows yet. Create your first workflow to start building.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workflows.map((wf) => (
            <Card
              key={wf.id}
              className="cursor-pointer transition-all hover:shadow-md"
              onClick={() => router.push(`/workflows/${wf.id}`)}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold">
                      {wf.workflow_name}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {wf.description || "No description"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-7 shrink-0 p-0 text-slate-400 hover:text-red-500"
                    onClick={(e) => handleDelete(e, wf)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">
                    {getNodeCount(wf)} nodes
                  </Badge>
                  {wf.template_source && (
                    <Badge
                      variant="secondary"
                      className="bg-violet-50 text-[10px] text-violet-700"
                    >
                      {wf.template_source}
                    </Badge>
                  )}
                </div>
                <p className="mt-2 text-[10px] text-slate-400">
                  {new Date(wf.created_at).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
