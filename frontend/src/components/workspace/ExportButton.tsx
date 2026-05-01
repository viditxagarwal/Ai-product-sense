"use client";

import { Download } from "lucide-react";
import { apiGet } from "@/lib/api";

interface ExportButtonProps {
  runId: string;
}

export default function ExportButton({ runId }: ExportButtonProps) {
  const handleExport = async () => {
    try {
      const data = await apiGet(`/executions/${runId}/export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `execution_${runId}_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export failed:", e);
    }
  };

  return (
    <button
      onClick={handleExport}
      className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-100 border border-slate-200"
      title="Export execution data"
    >
      <Download className="size-3" />
      Export
    </button>
  );
}
