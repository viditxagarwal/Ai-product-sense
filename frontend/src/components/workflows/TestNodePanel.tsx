"use client";

import { useState } from "react";
import { Play, Loader2 } from "lucide-react";
import { apiPost } from "@/lib/api";

interface TestNodePanelProps {
  nodeConfig: Record<string, unknown>;
  configId?: string;
  onClose: () => void;
}

interface TestResult {
  output: string;
  tokens: { input: number; output: number; thinking: number; total: number };
  cost_usd: number;
  duration_ms: number;
  model: string;
  errors: string[];
}

export default function TestNodePanel({ nodeConfig, configId, onClose }: TestNodePanelProps) {
  const [inputData, setInputData] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const runTest = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await apiPost<TestResult>("/nodes/test", {
        node_config: nodeConfig,
        input_data: inputData,
        config_id: configId,
      });
      setResult(res);
    } catch (e: unknown) {
      setResult({
        output: "",
        tokens: { input: 0, output: 0, thinking: 0, total: 0 },
        cost_usd: 0,
        duration_ms: 0,
        model: "",
        errors: [e instanceof Error ? e.message : "Test failed"],
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border bg-white p-3 text-xs space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-medium text-slate-700">Test Node</span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-[10px]">Close</button>
      </div>

      <div>
        <label className="mb-1 block text-[10px] font-medium text-slate-500">Test Input</label>
        <textarea
          value={inputData}
          onChange={(e) => setInputData(e.target.value)}
          placeholder="Enter test message or JSON input..."
          className="w-full rounded border border-slate-200 p-2 text-xs min-h-[80px] resize-y focus:outline-none focus:ring-1 focus:ring-blue-300"
        />
      </div>

      <button
        onClick={runTest}
        disabled={loading || !inputData.trim()}
        className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-white text-xs hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
        {loading ? "Running..." : "Run Test"}
      </button>

      {result && (
        <div className="space-y-2 border-t pt-2">
          {result.errors.length > 0 && (
            <div className="rounded bg-red-50 border border-red-200 p-2 text-red-600">
              {result.errors.join(", ")}
            </div>
          )}
          {result.output && (
            <div>
              <div className="text-[10px] font-medium text-slate-500 mb-1">Output</div>
              <pre className="whitespace-pre-wrap rounded bg-slate-50 border p-2 text-[11px] max-h-48 overflow-y-auto">
                {result.output}
              </pre>
            </div>
          )}
          <div className="flex flex-wrap gap-3 text-[10px] text-slate-500">
            {result.model && <span>Model: {result.model}</span>}
            <span>{result.tokens.total} tokens ({result.tokens.input} in / {result.tokens.output} out)</span>
            <span>${result.cost_usd.toFixed(6)}</span>
            <span>{result.duration_ms}ms</span>
          </div>
        </div>
      )}
    </div>
  );
}
