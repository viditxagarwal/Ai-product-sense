"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import DomainCard from "@/components/domains/DomainCard";
import { CardGridSkeleton } from "@/components/ui/skeletons";
import { useDomainStore } from "@/stores/domain-store";
import type { DomainName } from "@/types";

export default function DomainsPage() {
  const { domains, loading, fetchDomains, createDomain, deleteDomain } =
    useDomainStore();
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [domainName, setDomainName] = useState<DomainName>("custom");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await createDomain({
        domain_name: domainName,
        display_name: displayName,
        description,
      });
      setOpen(false);
      setDisplayName("");
      setDomainName("custom");
      setDescription("");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this domain and all its data? This cannot be undone."))
      return;
    await deleteDomain(id);
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Domains</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure domain namespaces for memory isolation and enterprise
            settings.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-1 size-4" />
          New Domain
        </Button>
      </div>

      {loading && domains.length === 0 ? (
        <CardGridSkeleton count={3} />
      ) : domains.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-lg border-2 border-dashed">
          <p className="text-sm text-muted-foreground">No domains yet</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => setOpen(true)}
          >
            <Plus className="mr-1 size-4" />
            Create your first domain
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {domains.map((domain) => (
            <DomainCard
              key={domain.id}
              domain={domain}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Create Domain Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Domain</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g., Financial Analysis"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="domainType">Domain Type</Label>
              <Select
                value={domainName}
                onValueChange={(v) => setDomainName(v as DomainName)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="financial_valuation">
                    Financial Valuation
                  </SelectItem>
                  <SelectItem value="coding">Coding</SelectItem>
                  <SelectItem value="tax">Tax</SelectItem>
                  <SelectItem value="design">Design</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this domain for?"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creating || !displayName}>
                {creating ? "Creating..." : "Create Domain"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
