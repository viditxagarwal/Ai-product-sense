"use client";

import { useMemo, useState } from "react";
import Papa from "papaparse";
import { ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface CsvViewerProps {
  content: string;
}

export default function CsvViewer({ content }: CsvViewerProps) {
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [filterText, setFilterText] = useState("");

  const { headers, rows } = useMemo(() => {
    const result = Papa.parse<string[]>(content, { skipEmptyLines: true });
    if (result.data.length === 0) return { headers: [], rows: [] };
    return {
      headers: result.data[0],
      rows: result.data.slice(1),
    };
  }, [content]);

  const processedRows = useMemo(() => {
    let filtered = rows;

    // Filter
    if (filterText) {
      const lower = filterText.toLowerCase();
      filtered = rows.filter((row) =>
        row.some((cell) => cell.toLowerCase().includes(lower))
      );
    }

    // Sort
    if (sortCol !== null) {
      filtered = [...filtered].sort((a, b) => {
        const va = a[sortCol] ?? "";
        const vb = b[sortCol] ?? "";
        const numA = Number(va);
        const numB = Number(vb);
        if (!isNaN(numA) && !isNaN(numB)) {
          return sortAsc ? numA - numB : numB - numA;
        }
        return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }

    return filtered;
  }, [rows, sortCol, sortAsc, filterText]);

  function handleSort(colIdx: number) {
    if (sortCol === colIdx) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(colIdx);
      setSortAsc(true);
    }
  }

  if (headers.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-sm text-slate-400">Empty CSV file</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Filter */}
      <div className="border-b px-3 py-1.5">
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Filter rows..."
          className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs placeholder:text-slate-300 focus:border-slate-400 focus:outline-none"
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10">
            <tr>
              {headers.map((h, i) => (
                <th
                  key={i}
                  onClick={() => handleSort(i)}
                  className="cursor-pointer border border-slate-200 bg-slate-100 px-2 py-1.5 text-left font-medium text-slate-600 hover:bg-slate-200"
                >
                  <span className="flex items-center gap-1">
                    {h}
                    <ArrowUpDown
                      className={cn(
                        "size-3",
                        sortCol === i ? "text-slate-600" : "text-slate-300"
                      )}
                    />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {processedRows.map((row, ri) => (
              <tr key={ri} className="hover:bg-slate-50">
                {headers.map((_, ci) => (
                  <td
                    key={ci}
                    className="border border-slate-200 px-2 py-1 text-slate-700"
                  >
                    {row[ci] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t bg-slate-50 px-3 py-1 text-[10px] text-slate-400">
          {processedRows.length} of {rows.length} rows
        </p>
      </div>
    </div>
  );
}
