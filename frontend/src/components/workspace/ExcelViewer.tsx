"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { cn } from "@/lib/utils";

interface ExcelViewerProps {
  content: ArrayBuffer;
}

export default function ExcelViewer({ content }: ExcelViewerProps) {
  const [activeSheet, setActiveSheet] = useState(0);
  const [selectedCell, setSelectedCell] = useState<string | null>(null);

  const workbook = useMemo(() => {
    try {
      return XLSX.read(content, { type: "array" });
    } catch {
      return null;
    }
  }, [content]);

  const sheetNames = workbook?.SheetNames ?? [];

  const { headers, rows } = useMemo(() => {
    if (!workbook || sheetNames.length === 0) return { headers: [], rows: [] };
    const sheet = workbook.Sheets[sheetNames[activeSheet]];
    const json = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
    if (json.length === 0) return { headers: [], rows: [] };
    return {
      headers: (json[0] || []).map((h) => String(h ?? "")),
      rows: json.slice(1).map((row) => row.map((cell) => String(cell ?? ""))),
    };
  }, [workbook, sheetNames, activeSheet]);

  // Reset selection when sheet changes
  useEffect(() => {
    setSelectedCell(null);
  }, [activeSheet]);

  if (!workbook) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-sm text-red-500">Failed to parse Excel file</p>
      </div>
    );
  }

  function getCellRef(rowIdx: number, colIdx: number): string {
    const col = XLSX.utils.encode_col(colIdx);
    return `${col}${rowIdx + 2}`; // +2 because row 0 is headers, 1-indexed
  }

  return (
    <div className="flex h-full flex-col">
      {/* Sheet tabs */}
      {sheetNames.length > 1 && (
        <div className="flex gap-0.5 border-b bg-slate-50 px-2 py-1">
          {sheetNames.map((name, i) => (
            <button
              key={name}
              onClick={() => setActiveSheet(i)}
              className={cn(
                "rounded px-2 py-1 text-[10px] font-medium transition-colors",
                i === activeSheet
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-400 hover:text-slate-600"
              )}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {/* Selected cell reference */}
      {selectedCell && (
        <div className="border-b bg-blue-50 px-3 py-1 text-[10px] font-medium text-blue-600">
          Cell: {selectedCell}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-100">
              <th className="w-10 border border-slate-200 bg-slate-100 px-2 py-1 text-center text-[10px] font-medium text-slate-400">
                #
              </th>
              {headers.map((h, i) => (
                <th
                  key={i}
                  className="border border-slate-200 bg-slate-100 px-2 py-1 text-left font-medium text-slate-600"
                >
                  {h || XLSX.utils.encode_col(i)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className="hover:bg-slate-50">
                <td className="border border-slate-200 bg-slate-50 px-2 py-1 text-center text-[10px] text-slate-400">
                  {ri + 2}
                </td>
                {headers.map((_, ci) => {
                  const ref = getCellRef(ri, ci);
                  const isSelected = selectedCell === ref;
                  return (
                    <td
                      key={ci}
                      onClick={() => setSelectedCell(ref)}
                      className={cn(
                        "cursor-pointer border border-slate-200 px-2 py-1 text-slate-700",
                        isSelected && "bg-blue-50 ring-1 ring-inset ring-blue-400"
                      )}
                    >
                      {row[ci] ?? ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="p-4 text-center text-xs text-slate-400">
            Empty sheet
          </p>
        )}
      </div>
    </div>
  );
}
