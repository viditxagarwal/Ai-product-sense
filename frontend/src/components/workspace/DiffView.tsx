"use client";

interface DiffViewProps {
  inputText: string;
  outputText: string;
  title?: string;
}

export default function DiffView({ inputText, outputText, title }: DiffViewProps) {
  if (!inputText || !outputText) return null;

  return (
    <div className="rounded-lg border bg-white text-xs">
      {title && (
        <div className="border-b px-3 py-1.5 text-[11px] font-medium text-slate-500">{title}</div>
      )}
      <div className="grid grid-cols-2 divide-x">
        <div className="p-3">
          <div className="mb-1 text-[10px] font-medium text-red-500 uppercase">Input</div>
          <pre className="whitespace-pre-wrap text-[11px] text-slate-600 max-h-64 overflow-y-auto">
            {inputText}
          </pre>
        </div>
        <div className="p-3">
          <div className="mb-1 text-[10px] font-medium text-emerald-500 uppercase">Output</div>
          <pre className="whitespace-pre-wrap text-[11px] text-slate-600 max-h-64 overflow-y-auto">
            {outputText}
          </pre>
        </div>
      </div>
    </div>
  );
}
