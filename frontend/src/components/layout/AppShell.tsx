"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { setTokenAccessor, setTokenRefresher } from "@/lib/api";
import Sidebar from "./Sidebar";

const PUBLIC_PATHS = ["/login", "/signup"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const { user, loading, getAccessToken, refreshToken } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Wire the auth token into the API client
  useEffect(() => {
    setTokenAccessor(getAccessToken);
    setTokenRefresher(refreshToken);
  }, [getAccessToken, refreshToken]);

  // Redirect unauthenticated users to login
  useEffect(() => {
    if (!loading && !user && !PUBLIC_PATHS.includes(pathname)) {
      router.push("/login");
    }
  }, [user, loading, pathname, router]);

  // Auth pages render without the shell
  if (PUBLIC_PATHS.includes(pathname)) {
    return <>{children}</>;
  }

  // Show nothing while checking auth
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-sm text-slate-400">Loading...</div>
      </div>
    );
  }

  // Not authenticated — will redirect via useEffect
  if (!user) {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-6 py-6">{children}</div>
      </main>
    </div>
  );
}
