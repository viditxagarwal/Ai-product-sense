"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, GitBranch, Trash2 } from "lucide-react";
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
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newDomainId, setNewDomainId] = useState("");
  const [creating, setCreating] = useState(false);

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

  const handleCreate = async () => {
    if (!newName.trim() || !newDomainId) return;
    setCreating(true);
    try {
      const wf = await createWorkflow({
        domain_id: newDomainId,
        workflow_name: newName.trim(),
        description: newDesc.trim(),
      });
      setDialogOpen(false);
      setNewName("");
      setNewDesc("");
      setNewDomainId("");
      router.push(`/workflows/${wf.id}`);
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
    return wf.graph_data?.nodes?.length || 0;
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
            <Button>
              <Plus className="mr-1 size-4" />
              New Workflow
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Workflow</DialogTitle>
              <DialogDescription>
                Create a workflow and assign it to a domain.
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
                onClick={handleCreate}
                disabled={!newName.trim() || !newDomainId || creating}
              >
                {creating ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

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
