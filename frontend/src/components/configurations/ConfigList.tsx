"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, GitCompare, Copy, Settings2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ConfigCompare from "./ConfigCompare";
import { CardGridSkeleton } from "@/components/ui/skeletons";
import { useConfigStore } from "@/stores/config-store";

export default function ConfigList() {
  const router = useRouter();
  const { configs, loading, fetchConfigs, duplicateConfig } = useConfigStore();
  const [search, setSearch] = useState("");
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareLeftId, setCompareLeftId] = useState("");
  const [compareRightId, setCompareRightId] = useState("");

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const filtered = configs.filter((c) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      c.config_name.toLowerCase().includes(q) ||
      c.tags.some((t) => t.toLowerCase().includes(q)) ||
      c.config_description.toLowerCase().includes(q)
    );
  });

  const handleDuplicate = async (e: React.MouseEvent, configId: string, name: string) => {
    e.stopPropagation();
    const newCfg = await duplicateConfig(configId, `Copy of ${name}`);
    router.push(`/configurations/${newCfg.id}`);
  };

  const openCompare = () => {
    if (configs.length >= 2) {
      setCompareLeftId(configs[0].id);
      setCompareRightId(configs[1].id);
      setCompareOpen(true);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Configurations</h1>
          <p className="text-sm text-muted-foreground">
            Immutable configuration snapshots. Each defines ALL behavioral
            settings for a task run.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={openCompare}
            disabled={configs.length < 2}
          >
            <GitCompare className="mr-1 size-4" />
            Compare
          </Button>
          <Button onClick={() => router.push("/configurations/new")}>
            <Plus className="mr-1 size-4" />
            New Configuration
          </Button>
        </div>
      </div>

      {/* Search */}
      <Input
        placeholder="Search by name, tags, or description..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {/* Grid */}
      {loading ? (
        <CardGridSkeleton count={6} />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Settings2 className="mx-auto mb-3 size-10 text-slate-300" />
            <p className="text-sm text-muted-foreground">
              {search
                ? "No configurations match your search."
                : "No configurations yet. Create your first one to get started."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((cfg) => (
            <Card
              key={cfg.id}
              className="cursor-pointer transition-all hover:shadow-md"
              onClick={() => router.push(`/configurations/${cfg.id}`)}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold">
                      {cfg.config_name}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {cfg.config_description || "No description"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-7 shrink-0 p-0 text-slate-400 hover:text-slate-600"
                    onClick={(e) =>
                      handleDuplicate(e, cfg.id, cfg.config_name)
                    }
                    title="Duplicate"
                  >
                    <Copy className="size-4" />
                  </Button>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className="text-[10px]">
                    v{cfg.config_version}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {cfg.primary_model}
                  </Badge>
                  {cfg.is_baseline && (
                    <Badge className="bg-blue-50 text-[10px] text-blue-700 hover:bg-blue-50">
                      Baseline
                    </Badge>
                  )}
                  {cfg.tags.map((t) => (
                    <Badge
                      key={t}
                      variant="secondary"
                      className="bg-slate-50 text-[10px]"
                    >
                      {t}
                    </Badge>
                  ))}
                </div>

                <p className="mt-2 text-[10px] text-slate-400">
                  {new Date(cfg.created_at).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Compare modal */}
      {configs.length >= 2 && (
        <ConfigCompare
          open={compareOpen}
          onOpenChange={setCompareOpen}
          configs={configs}
          leftId={compareLeftId}
          rightId={compareRightId}
          onLeftChange={setCompareLeftId}
          onRightChange={setCompareRightId}
        />
      )}
    </div>
  );
}
