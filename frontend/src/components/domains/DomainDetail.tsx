"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDomainStore } from "@/stores/domain-store";
import { apiGet } from "@/lib/api";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import BasePromptEditor from "./BasePromptEditor";
import EnterpriseDocList from "./EnterpriseDocList";
import GuardrailFileUpload from "./GuardrailFileUpload";
import { FormSkeleton } from "@/components/ui/skeletons";
import type {
  EnterpriseDocumentResponse,
  PaginatedResponse,
  MemoryIsolation,
} from "@/types";

const DOMAIN_LABELS: Record<string, string> = {
  financial_valuation: "Financial Valuation",
  coding: "Coding",
  tax: "Tax",
  design: "Design",
  custom: "Custom",
};

const MEMORY_DESCRIPTIONS: Record<string, string> = {
  strict:
    "Complete isolation — conversations in this domain never share memory with other domains.",
  soft: "Soft isolation — user profile data is shared across domains, but conversation memory stays isolated.",
  none: "No isolation — all memory is shared across all domains for this user.",
};

interface DomainDetailProps {
  domainId: string;
}

export default function DomainDetail({ domainId }: DomainDetailProps) {
  const router = useRouter();
  const { currentDomain, fetchDomain, updateDomain, deleteDomain, loading } =
    useDomainStore();
  const [documents, setDocuments] = useState<EnterpriseDocumentResponse[]>([]);

  const loadDocuments = useCallback(async () => {
    try {
      const res = await apiGet<PaginatedResponse<EnterpriseDocumentResponse>>(
        `/knowledge?domain_id=${domainId}&per_page=100`
      );
      setDocuments(res.data);
    } catch {
      // Documents may not exist yet
    }
  }, [domainId]);

  useEffect(() => {
    fetchDomain(domainId);
    loadDocuments();
  }, [domainId, fetchDomain, loadDocuments]);

  if (loading || !currentDomain) {
    return <FormSkeleton sections={4} />;
  }

  const domain = currentDomain;

  const handleMemoryChange = async (value: string) => {
    await updateDomain(domainId, {
      memory_isolation: value as MemoryIsolation,
    });
  };

  const handleBasePromptSave = async (value: string) => {
    await updateDomain(domainId, { base_prompt: value });
  };

  const handleGuardrailFileSave = async (
    fileName: string | null,
    fileUrl: string | null
  ) => {
    await updateDomain(domainId, {
      enterprise_guardrails_file_name: fileName ?? undefined,
      enterprise_guardrails_file_url: fileUrl ?? undefined,
    });
  };

  const handleDelete = async () => {
    if (!confirm("Delete this domain? This cannot be undone.")) return;
    await deleteDomain(domainId);
    router.push("/domains");
  };

  return (
    <div className="space-y-8">
      {/* Breadcrumbs + Header */}
      <div>
        <Breadcrumbs
          items={[
            { label: "Domains", href: "/domains" },
            { label: domain.display_name },
          ]}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/domains")}
          className="mb-4"
        >
          <ArrowLeft className="mr-1 size-4" />
          Back to Domains
        </Button>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">
              {domain.display_name}
            </h1>
            <Badge variant="secondary">
              {DOMAIN_LABELS[domain.domain_name] ?? domain.domain_name}
            </Badge>
          </div>
          <Button variant="destructive" size="sm" onClick={handleDelete}>
            <Trash2 className="mr-1 size-4" />
            Delete
          </Button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Created {new Date(domain.created_at).toLocaleDateString()}
          {domain.description && ` · ${domain.description}`}
        </p>
      </div>

      {/* Memory Isolation */}
      <section className="space-y-3">
        <Label className="text-base font-semibold">Memory Isolation</Label>
        <Select
          value={domain.memory_isolation}
          onValueChange={handleMemoryChange}
        >
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="strict">Strict</SelectItem>
            <SelectItem value="soft">Soft</SelectItem>
            <SelectItem value="none">None</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          {MEMORY_DESCRIPTIONS[domain.memory_isolation]}
        </p>
      </section>

      {/* Base Prompt */}
      <section className="space-y-3">
        <Label className="text-base font-semibold">Base Prompt</Label>
        <BasePromptEditor
          value={domain.base_prompt}
          onSave={handleBasePromptSave}
        />
      </section>

      {/* Enterprise Knowledge */}
      <section className="space-y-3">
        <Label className="text-base font-semibold">
          Enterprise Knowledge (Layer 2)
        </Label>
        <p className="text-sm text-muted-foreground">
          Upload enterprise documents that provide domain-specific context for
          RAG retrieval.
        </p>
        <EnterpriseDocList
          domainId={domainId}
          documents={documents}
          onRefresh={loadDocuments}
        />
      </section>

      {/* Enterprise Guardrails File */}
      <section className="space-y-3">
        <Label className="text-base font-semibold">
          Enterprise Guardrails File
        </Label>
        <p className="text-sm text-muted-foreground">
          Upload a single enterprise guardrails document. This defines
          domain-specific safety rules beyond the platform defaults.
        </p>
        <GuardrailFileUpload
          domainId={domainId}
          currentFileName={domain.enterprise_guardrails_file_name}
          currentFileUrl={domain.enterprise_guardrails_file_url}
          onSave={handleGuardrailFileSave}
        />
      </section>
    </div>
  );
}
