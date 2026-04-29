import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";

export interface ProviderModels {
  provider: string;
  display_name: string;
  connected: boolean;
  models: string[];
}

export function useAvailableModels() {
  const [providers, setProviders] = useState<ProviderModels[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<ProviderModels[]>("/settings/available-models")
      .then(setProviders)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Flat list of all connected models for quick lookup
  const connectedModels = providers
    .filter((p) => p.connected)
    .flatMap((p) => p.models);

  return { providers, connectedModels, loading };
}
