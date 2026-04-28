"use client";

import { useEffect } from "react";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { cn } from "@/lib/utils";
import LeftPanel from "./LeftPanel";
import CenterPanel from "./CenterPanel";
import RightPanel from "./RightPanel";

export default function WorkspaceLayout() {
  const { leftPanelOpen, rightPanelOpen, toggleLeftPanel, toggleRightPanel } =
    useWorkspaceStore();

  // Keyboard shortcuts: Cmd+B = left, Cmd+. = right
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.metaKey && e.key === "b") {
        e.preventDefault();
        toggleLeftPanel();
      }
      if (e.metaKey && e.key === ".") {
        e.preventDefault();
        toggleRightPanel();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleLeftPanel, toggleRightPanel]);

  return (
    <div className="flex h-full">
      {/* Left panel */}
      <div
        className={cn(
          "shrink-0 border-r border-slate-200 bg-white transition-all duration-200",
          leftPanelOpen ? "w-60" : "w-0 overflow-hidden border-r-0"
        )}
      >
        {leftPanelOpen && <LeftPanel />}
      </div>

      {/* Left toggle */}
      <button
        onClick={toggleLeftPanel}
        className="flex w-5 shrink-0 items-center justify-center border-r border-slate-200 bg-slate-50 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        title={leftPanelOpen ? "Collapse left panel (⌘B)" : "Expand left panel (⌘B)"}
      >
        {leftPanelOpen ? (
          <PanelLeftClose className="size-3.5" />
        ) : (
          <PanelLeftOpen className="size-3.5" />
        )}
      </button>

      {/* Center panel */}
      <div className="min-w-0 flex-1 bg-white">
        <CenterPanel />
      </div>

      {/* Right toggle */}
      <button
        onClick={toggleRightPanel}
        className="flex w-5 shrink-0 items-center justify-center border-l border-slate-200 bg-slate-50 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        title={rightPanelOpen ? "Collapse right panel (⌘.)" : "Expand right panel (⌘.)"}
      >
        {rightPanelOpen ? (
          <PanelRightClose className="size-3.5" />
        ) : (
          <PanelRightOpen className="size-3.5" />
        )}
      </button>

      {/* Right panel */}
      <div
        className={cn(
          "shrink-0 border-l border-slate-200 bg-white transition-all duration-200",
          rightPanelOpen ? "w-[340px]" : "w-0 overflow-hidden border-l-0"
        )}
      >
        {rightPanelOpen && <RightPanel />}
      </div>
    </div>
  );
}
