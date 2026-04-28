"use client";

import { useEffect, useState } from "react";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, X } from "lucide-react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { cn } from "@/lib/utils";
import LeftPanel from "./LeftPanel";
import CenterPanel from "./CenterPanel";
import RightPanel from "./RightPanel";

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);
  return matches;
}

export default function WorkspaceLayout() {
  const {
    leftPanelOpen,
    rightPanelOpen,
    toggleLeftPanel,
    toggleRightPanel,
    setSelectedStepId,
  } = useWorkspaceStore();

  const isMobile = useMediaQuery("(max-width: 767px)");
  const isTablet = useMediaQuery("(max-width: 1023px)");

  // Auto-hide panels on smaller screens
  useEffect(() => {
    if (isMobile && leftPanelOpen) toggleLeftPanel();
    if (isTablet && rightPanelOpen) toggleRightPanel();
    // Only run on breakpoint change, not on panel state change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, isTablet]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Cmd+B = toggle left panel
      if (e.metaKey && e.key === "b") {
        e.preventDefault();
        toggleLeftPanel();
      }
      // Cmd+. = toggle right panel
      if (e.metaKey && e.key === ".") {
        e.preventDefault();
        toggleRightPanel();
      }
      // Cmd+K = focus chat input
      if (e.metaKey && e.key === "k") {
        e.preventDefault();
        const input = document.querySelector<HTMLTextAreaElement>(
          "[data-chat-input]"
        );
        input?.focus();
      }
      // Escape = close panels / deselect
      if (e.key === "Escape") {
        setSelectedStepId(null);
        // Close overlay panels on mobile/tablet
        if (isMobile && leftPanelOpen) toggleLeftPanel();
        if (isTablet && rightPanelOpen) toggleRightPanel();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleLeftPanel, toggleRightPanel, setSelectedStepId, isMobile, isTablet, leftPanelOpen, rightPanelOpen]);

  // Panel as overlay on small screens
  const leftOverlay = isMobile && leftPanelOpen;
  const rightOverlay = isTablet && rightPanelOpen;

  return (
    <div className="relative flex h-full overflow-hidden">
      {/* Backdrop for overlays */}
      {(leftOverlay || rightOverlay) && (
        <div
          className="absolute inset-0 z-30 bg-black/20 transition-opacity duration-200"
          onClick={() => {
            if (leftOverlay) toggleLeftPanel();
            if (rightOverlay) toggleRightPanel();
          }}
        />
      )}

      {/* Left panel */}
      <div
        className={cn(
          "shrink-0 border-r border-slate-200 bg-white transition-all duration-200",
          leftOverlay
            ? "absolute inset-y-0 left-0 z-40 w-60 shadow-xl"
            : leftPanelOpen
              ? "w-60"
              : "w-0 overflow-hidden border-r-0"
        )}
      >
        {(leftPanelOpen || leftOverlay) && (
          <div className="relative h-full">
            {leftOverlay && (
              <button
                onClick={toggleLeftPanel}
                className="absolute right-2 top-2 z-10 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="size-4" />
              </button>
            )}
            <LeftPanel />
          </div>
        )}
      </div>

      {/* Left toggle (hidden on mobile overlay) */}
      {!leftOverlay && (
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
      )}

      {/* Center panel */}
      <div className="min-w-0 flex-1 bg-white">
        <CenterPanel />
      </div>

      {/* Right toggle (hidden on tablet overlay) */}
      {!rightOverlay && (
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
      )}

      {/* Right panel */}
      <div
        className={cn(
          "shrink-0 border-l border-slate-200 bg-white transition-all duration-200",
          rightOverlay
            ? "absolute inset-y-0 right-0 z-40 w-[340px] shadow-xl"
            : rightPanelOpen
              ? "w-[340px]"
              : "w-0 overflow-hidden border-l-0"
        )}
      >
        {(rightPanelOpen || rightOverlay) && (
          <div className="relative h-full">
            {rightOverlay && (
              <button
                onClick={toggleRightPanel}
                className="absolute right-2 top-2 z-10 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="size-4" />
              </button>
            )}
            <RightPanel />
          </div>
        )}
      </div>
    </div>
  );
}
