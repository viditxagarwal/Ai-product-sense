"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Globe,
  GitBranch,
  Wrench,
  BookOpen,
  PenTool,
  Shield,
  Settings,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Cpu,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
  Key,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { apiGet } from "@/lib/api";
import type { PaginatedResponse } from "@/types";

const NAV_ITEMS = [
  { href: "/workspace", label: "Workspace", icon: MessageSquare, countKey: null },
  { href: "/domains", label: "Domains", icon: Globe, countKey: "domains" },
  { href: "/workflows", label: "Workflows", icon: GitBranch, countKey: "workflows" },
  { href: "/tools", label: "Tools", icon: Wrench, countKey: "tools" },
  { href: "/knowledge", label: "Knowledge", icon: BookOpen, countKey: null },
  { href: "/prompts", label: "Prompts", icon: PenTool, countKey: "prompts" },
  { href: "/guardrails", label: "Guardrails", icon: Shield, countKey: "guardrails" },
  { href: "/configurations", label: "Configurations", icon: Settings, countKey: "configurations" },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});

  // Fetch counts for nav items
  useEffect(() => {
    async function loadCounts() {
      const endpoints: { key: string; path: string }[] = [
        { key: "domains", path: "/domains?per_page=1" },
        { key: "workflows", path: "/workflows?per_page=1" },
        { key: "tools", path: "/tools?per_page=1" },
        { key: "prompts", path: "/prompts?per_page=1" },
        { key: "guardrails", path: "/guardrails?per_page=1" },
        { key: "configurations", path: "/configurations?per_page=1" },
      ];

      const results: Record<string, number> = {};
      await Promise.allSettled(
        endpoints.map(async ({ key, path }) => {
          try {
            const res = await apiGet<PaginatedResponse<unknown>>(path);
            results[key] = res.count;
          } catch {
            // silently ignore
          }
        })
      );
      setCounts(results);
    }

    if (user) loadCounts();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close mobile menu on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const sidebarContent = (
    <>
      {/* Logo */}
      <Link
        href="/"
        className="flex h-14 items-center gap-2.5 border-b border-slate-800 px-4"
      >
        <Cpu className="size-5 shrink-0 text-white" />
        {!collapsed && (
          <span className="text-sm font-semibold tracking-tight text-white">
            AI Product Studio
          </span>
        )}
      </Link>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon, countKey }) => {
          const isActive =
            pathname === href || pathname.startsWith(href + "/");
          const count = countKey ? counts[countKey] : undefined;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-slate-800 text-white"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
              )}
              title={collapsed ? label : undefined}
            >
              <Icon className="size-4 shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1">{label}</span>
                  {count !== undefined && count > 0 && (
                    <span className="rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-400">
                      {count}
                    </span>
                  )}
                </>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Settings + Theme toggle + User + sign out */}
      <div className="border-t border-slate-800 px-2 py-2">
        <Link
          href="/settings/api-keys"
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
            pathname.startsWith("/settings")
              ? "bg-slate-800 text-white"
              : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
          )}
          title={collapsed ? "Settings" : undefined}
        >
          <Key className="size-4 shrink-0" />
          {!collapsed && <span>Settings</span>}
        </Link>
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-800/60 hover:text-slate-200"
          title={collapsed ? "Toggle theme" : undefined}
        >
          {theme === "dark" ? (
            <Sun className="size-4 shrink-0" />
          ) : (
            <Moon className="size-4 shrink-0" />
          )}
          {!collapsed && (
            <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
          )}
        </button>
        {!collapsed && user && (
          <div className="mb-1 truncate px-2.5 text-xs text-slate-500">
            {user.email}
          </div>
        )}
        <button
          onClick={signOut}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-800/60 hover:text-slate-200"
          title={collapsed ? "Sign out" : undefined}
        >
          <LogOut className="size-4 shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>

      {/* Collapse toggle — desktop only */}
      <button
        onClick={onToggle}
        className="hidden h-10 items-center justify-center border-t border-slate-800 text-slate-500 transition-colors hover:text-slate-300 md:flex"
      >
        {collapsed ? (
          <ChevronRight className="size-4" />
        ) : (
          <ChevronLeft className="size-4" />
        )}
      </button>
    </>
  );

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        className="fixed left-3 top-3 z-50 flex size-10 items-center justify-center rounded-md bg-slate-900 text-white shadow-lg md:hidden"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-56 flex-col bg-slate-900 text-slate-300 transition-transform duration-200 md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden h-screen flex-col border-r border-slate-800 bg-slate-900 text-slate-300 transition-all duration-200 md:flex",
          collapsed ? "w-16" : "w-56"
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
