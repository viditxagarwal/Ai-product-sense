"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, FileText, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useDomainStore } from "@/stores/domain-store";
import { apiGet } from "@/lib/api";
import type { PaginatedResponse, EnterpriseDocumentResponse } from "@/types";

interface DomainDocCount {
  domainId: string;
  domainName: string;
  docCount: number;
}

export default function EnterpriseKnowledgeSummary() {
  const router = useRouter();
  const { domains, fetchDomains } = useDomainStore();
  const [domainDocs, setDomainDocs] = useState<DomainDocCount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  useEffect(() => {
    if (domains.length === 0) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadCounts() {
      const results: DomainDocCount[] = [];
      for (const domain of domains) {
        try {
          const res = await apiGet<PaginatedResponse<EnterpriseDocumentResponse>>(
            `/knowledge?domain_id=${domain.id}&per_page=1`
          );
          results.push({
            domainId: domain.id,
            domainName: domain.display_name,
            docCount: res.count,
          });
        } catch {
          results.push({
            domainId: domain.id,
            domainName: domain.display_name,
            docCount: 0,
          });
        }
      }
      if (!cancelled) {
        setDomainDocs(results);
        setLoading(false);
      }
    }

    loadCounts();
    return () => {
      cancelled = true;
    };
  }, [domains]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Building2 className="size-5 text-purple-500" />
        <h2 className="text-lg font-semibold">Enterprise Knowledge</h2>
        <Badge variant="secondary" className="text-[10px]">
          Layer 2
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Enterprise documents are configured per-domain in Domain Settings.
        Upload domain-specific context documents that power RAG retrieval.
      </p>

      {loading ? (
        <div className="py-6 text-center text-sm text-slate-400">
          Loading domain summaries...
        </div>
      ) : domainDocs.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            No domains created yet. Create a domain first to upload enterprise
            documents.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {domainDocs.map((dd) => (
            <Card
              key={dd.domainId}
              className="cursor-pointer transition-all hover:shadow-md"
              onClick={() =>
                router.push(`/domains/${dd.domainId}#enterprise-knowledge`)
              }
            >
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
                    <FileText className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{dd.domainName}</p>
                    <p className="text-xs text-muted-foreground">
                      {dd.docCount} {dd.docCount === 1 ? "document" : "documents"}
                    </p>
                  </div>
                </div>
                <ArrowRight className="size-4 text-slate-400" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
