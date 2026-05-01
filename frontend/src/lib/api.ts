import { toast } from "sonner";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

let tokenAccessor: (() => string | null) | null = null;
let tokenRefresher: (() => Promise<string | null>) | null = null;

// Circuit breaker: once auth fails definitively, stop all requests
// and redirect once. Reset on next successful token set.
let authFailed = false;

// Deduplicate concurrent refresh attempts
let refreshPromise: Promise<string | null> | null = null;

export function setTokenAccessor(accessor: () => string | null) {
  tokenAccessor = accessor;
  // New token accessor means auth state changed (e.g., fresh login) — reset breaker
  authFailed = false;
}

export function setTokenRefresher(refresher: () => Promise<string | null>) {
  tokenRefresher = refresher;
}

/** Expose the current access token for non-fetch uses (e.g. WebSocket auth) */
export function getStoredToken(): string | null {
  return tokenAccessor?.() ?? null;
}

async function doFetch(
  path: string,
  token: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    ...(options.headers as Record<string, string>),
  };

  return fetch(`${BASE_URL}${path}`, { ...options, headers });
}

function deduplicatedRefresh(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = tokenRefresher!().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  // Circuit breaker — auth already failed, don't hit backend
  if (authFailed) {
    throw new Error("Session expired");
  }

  const token = tokenAccessor?.();
  if (!token) {
    throw new Error("Not authenticated");
  }

  let res = await doFetch(path, token, options);

  // On 401, try refreshing the token once and retry
  if (res.status === 401 && tokenRefresher && !authFailed) {
    const newToken = await deduplicatedRefresh();
    if (newToken) {
      res = await doFetch(path, newToken, options);
    }
  }

  // If still 401 after refresh — trip the circuit breaker
  if (res.status === 401) {
    if (!authFailed) {
      authFailed = true;
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    throw new Error("Session expired");
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    const message = error.detail || `API error: ${res.status}`;
    toast.error(message);
    throw new Error(message);
  }

  return res.json();
}

export function apiGet<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: "GET" });
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  if (authFailed) {
    throw new Error("Session expired");
  }

  const token = tokenAccessor?.();
  if (!token) {
    throw new Error("Not authenticated");
  }

  let res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (res.status === 401 && tokenRefresher && !authFailed) {
    const newToken = await deduplicatedRefresh();
    if (newToken) {
      res = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${newToken}` },
        body: formData,
      });
    }
  }

  if (res.status === 401) {
    authFailed = true;
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    throw new Error("Session expired");
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    const message = error.detail || `API error: ${res.status}`;
    toast.error(message);
    throw new Error(message);
  }

  return res.json();
}

export function apiAssetUrl(path: string): string {
  if (!path || path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const origin = new URL(BASE_URL).origin;
  return `${origin}${path}`;
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function apiDelete<T = { success: boolean }>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: "DELETE" });
}
