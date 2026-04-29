"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Key,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  FlaskConical,
  Eye,
  EyeOff,
  Server,
  Search,
  Database,
  BarChart3,
  Sparkles,
  Cpu,
  Cloud,
  Zap,
  Globe,
} from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApiKeyRecord {
  id: string;
  provider: string;
  key_hint: string;
  extra_fields: Record<string, string>;
  is_valid: boolean | null;
  last_tested_at: string | null;
}

interface TestResult {
  success: boolean;
  message: string;
  models: string[];
}

// ---------------------------------------------------------------------------
// Provider definitions
// ---------------------------------------------------------------------------

interface ProviderDef {
  provider: string;
  name: string;
  icon: React.ElementType;
  color: string;
  section: "model" | "tool";
  keyLabel: string;
  keyPlaceholder: string;
  needsKey: boolean;
  extraFields?: { key: string; label: string; placeholder: string; required?: boolean }[];
  modelsUnlocked?: string[];
  description?: string;
}

const PROVIDERS: ProviderDef[] = [
  {
    provider: "openai",
    name: "OpenAI",
    icon: Sparkles,
    color: "bg-green-500",
    section: "model",
    keyLabel: "API Key",
    keyPlaceholder: "sk-...",
    needsKey: true,
    extraFields: [{ key: "organization_id", label: "Organization ID (optional)", placeholder: "org-..." }],
    modelsUnlocked: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "o1", "o1-mini"],
  },
  {
    provider: "anthropic",
    name: "Anthropic",
    icon: Cpu,
    color: "bg-orange-500",
    section: "model",
    keyLabel: "API Key",
    keyPlaceholder: "sk-ant-...",
    needsKey: true,
    modelsUnlocked: ["claude-opus-4", "claude-sonnet-4", "claude-haiku-3.5"],
  },
  {
    provider: "groq",
    name: "Groq",
    icon: Zap,
    color: "bg-purple-500",
    section: "model",
    keyLabel: "API Key",
    keyPlaceholder: "gsk_...",
    needsKey: true,
    modelsUnlocked: ["llama-3.3-70b", "llama-3.1-8b", "mixtral-8x7b", "gemma2-9b"],
  },
  {
    provider: "google_ai",
    name: "Google AI (Gemini)",
    icon: Cloud,
    color: "bg-blue-500",
    section: "model",
    keyLabel: "API Key",
    keyPlaceholder: "AIza...",
    needsKey: true,
    modelsUnlocked: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
  },
  {
    provider: "ollama",
    name: "Ollama (Local)",
    icon: Server,
    color: "bg-slate-600",
    section: "model",
    keyLabel: "",
    keyPlaceholder: "",
    needsKey: false,
    extraFields: [{ key: "base_url", label: "Ollama Base URL", placeholder: "http://localhost:11434" }],
    description: "Run models locally. No API key needed.",
  },
  {
    provider: "custom_openai",
    name: "Custom OpenAI-Compatible",
    icon: Globe,
    color: "bg-indigo-500",
    section: "model",
    keyLabel: "API Key (optional)",
    keyPlaceholder: "sk-...",
    needsKey: false,
    extraFields: [
      { key: "base_url", label: "Base URL", placeholder: "https://your-endpoint.com", required: true },
      { key: "model_name", label: "Model Name", placeholder: "my-model" },
    ],
    description: "vLLM, LiteLLM, Azure OpenAI, or any OpenAI-compatible endpoint.",
  },
  // Tool providers
  {
    provider: "tavily",
    name: "Tavily (Web Search)",
    icon: Search,
    color: "bg-teal-500",
    section: "tool",
    keyLabel: "API Key",
    keyPlaceholder: "tvly-...",
    needsKey: true,
    description: "Enables the Web Search tool in workflows.",
  },
  {
    provider: "alpha_vantage",
    name: "Alpha Vantage",
    icon: BarChart3,
    color: "bg-yellow-600",
    section: "tool",
    keyLabel: "API Key",
    keyPlaceholder: "Your Alpha Vantage key",
    needsKey: true,
    description: "Financial market data for the Financial Data API tool.",
  },
  {
    provider: "polygon",
    name: "Polygon.io",
    icon: BarChart3,
    color: "bg-red-500",
    section: "tool",
    keyLabel: "API Key",
    keyPlaceholder: "Your Polygon.io key",
    needsKey: true,
    description: "Real-time and historical market data.",
  },
  {
    provider: "database_pg",
    name: "PostgreSQL",
    icon: Database,
    color: "bg-sky-600",
    section: "tool",
    keyLabel: "Connection String",
    keyPlaceholder: "postgresql://user:pass@host:5432/db",
    needsKey: true,
    extraFields: [{ key: "read_only", label: "Read-only", placeholder: "true" }],
    description: "Database Query tool connection.",
  },
  {
    provider: "database_mysql",
    name: "MySQL",
    icon: Database,
    color: "bg-orange-600",
    section: "tool",
    keyLabel: "Connection String",
    keyPlaceholder: "mysql://user:pass@host:3306/db",
    needsKey: true,
    extraFields: [{ key: "read_only", label: "Read-only", placeholder: "true" }],
    description: "Database Query tool connection.",
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editProvider, setEditProvider] = useState<ProviderDef | null>(null);
  const [formKey, setFormKey] = useState("");
  const [formExtra, setFormExtra] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    try {
      const data = await apiGet<ApiKeyRecord[]>("/settings/api-keys");
      setKeys(data);
    } catch {
      // handled by api client
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const getKeyForProvider = (provider: string) =>
    keys.find((k) => k.provider === provider);

  async function handleSave() {
    if (!editProvider) return;
    setSaving(true);
    try {
      await apiPost("/settings/api-keys", {
        provider: editProvider.provider,
        api_key: formKey,
        extra_fields: formExtra,
      });
      toast.success(`${editProvider.name} key saved`);
      setEditProvider(null);
      setFormKey("");
      setFormExtra({});
      fetchKeys();
    } catch {
      // handled by api client
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(keyId: string) {
    setTesting(keyId);
    try {
      const result = await apiPost<TestResult>(`/settings/api-keys/${keyId}/test`);
      if (result.success) {
        toast.success(result.message);
        if (result.models.length > 0) {
          toast.info(`Models: ${result.models.slice(0, 5).join(", ")}${result.models.length > 5 ? "..." : ""}`);
        }
      } else {
        toast.error(result.message);
      }
      fetchKeys();
    } catch {
      // handled
    } finally {
      setTesting(null);
    }
  }

  async function handleDelete(keyId: string) {
    try {
      await apiDelete(`/settings/api-keys/${keyId}`);
      toast.success("Key removed");
      setDeleteConfirm(null);
      fetchKeys();
    } catch {
      // handled
    }
  }

  function openEditor(def: ProviderDef) {
    const existing = getKeyForProvider(def.provider);
    setEditProvider(def);
    setFormKey("");
    setFormExtra(existing?.extra_fields || {});
    setShowKey(false);
  }

  function renderStatusBadge(record: ApiKeyRecord | undefined, def: ProviderDef) {
    if (!def.needsKey && def.provider === "ollama") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
          <Server className="size-3" /> Local
        </span>
      );
    }
    if (!record) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
          Not configured
        </span>
      );
    }
    if (record.is_valid === true) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
          <CheckCircle2 className="size-3" /> Connected
        </span>
      );
    }
    if (record.is_valid === false) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
          <XCircle className="size-3" /> Invalid
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-50 px-2 py-0.5 text-xs font-medium text-yellow-700">
        Untested
      </span>
    );
  }

  function renderProviderCard(def: ProviderDef) {
    const record = getKeyForProvider(def.provider);
    const Icon = def.icon;
    const isTestLoading = testing === record?.id;

    return (
      <Card key={def.provider} className="flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`flex size-9 items-center justify-center rounded-lg ${def.color} text-white`}>
                <Icon className="size-4.5" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">{def.name}</CardTitle>
                {def.description && (
                  <CardDescription className="mt-0.5 text-xs">{def.description}</CardDescription>
                )}
              </div>
            </div>
            {renderStatusBadge(record, def)}
          </div>
        </CardHeader>
        <CardContent className="flex-1 pb-3">
          {record && record.key_hint && (
            <div className="mb-2 rounded-md bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">
              {"•".repeat(12)}{record.key_hint}
            </div>
          )}
          {def.modelsUnlocked && (
            <div className="flex flex-wrap gap-1">
              {def.modelsUnlocked.map((m) => (
                <span
                  key={m}
                  className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500"
                >
                  {m}
                </span>
              ))}
            </div>
          )}
        </CardContent>
        <CardFooter className="gap-2 border-t pt-3">
          <Button size="sm" variant="outline" onClick={() => openEditor(def)}>
            {record ? "Update Key" : "Add Key"}
          </Button>
          {record && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleTest(record.id)}
                disabled={isTestLoading}
              >
                {isTestLoading ? (
                  <Loader2 className="mr-1 size-3.5 animate-spin" />
                ) : (
                  <FlaskConical className="mr-1 size-3.5" />
                )}
                Test
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto text-red-500 hover:text-red-700"
                onClick={() => setDeleteConfirm(record.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </>
          )}
        </CardFooter>
      </Card>
    );
  }

  const modelProviders = PROVIDERS.filter((p) => p.section === "model");
  const toolProviders = PROVIDERS.filter((p) => p.section === "tool");

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <Key className="size-6" /> API Keys &amp; Credentials
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage API keys for model providers and external tools. Keys are encrypted and stored securely.
        </p>
      </div>

      {/* Section 1: Model Providers */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Model Providers</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modelProviders.map(renderProviderCard)}
        </div>
      </section>

      {/* Section 2: Tool API Keys */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Tool API Keys</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {toolProviders.map(renderProviderCard)}
        </div>
      </section>

      {/* Edit/Add Dialog */}
      <Dialog open={!!editProvider} onOpenChange={(open) => !open && setEditProvider(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editProvider && (getKeyForProvider(editProvider.provider) ? "Update" : "Add")}{" "}
              {editProvider?.name} Key
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {editProvider?.needsKey !== false && editProvider?.keyLabel && (
              <div className="space-y-2">
                <Label>{editProvider.keyLabel}</Label>
                <div className="relative">
                  <Input
                    type={showKey ? "text" : "password"}
                    placeholder={editProvider.keyPlaceholder}
                    value={formKey}
                    onChange={(e) => setFormKey(e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    onClick={() => setShowKey(!showKey)}
                  >
                    {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
            )}
            {editProvider?.extraFields?.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label>{field.label}</Label>
                <Input
                  placeholder={field.placeholder}
                  value={formExtra[field.key] || ""}
                  onChange={(e) =>
                    setFormExtra((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProvider(null)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove API Key</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Are you sure you want to remove this API key? Any workflows using this provider will stop working.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
