"use client";

import { useState } from "react";
import { ZoomIn, ZoomOut, RotateCw } from "lucide-react";

interface ImageViewerProps {
  fileUrl: string;
  fileName: string;
}

export default function ImageViewer({ fileUrl, fileName }: ImageViewerProps) {
  const [zoom, setZoom] = useState(1);

  return (
    <div className="flex h-full flex-col">
      {/* Zoom controls */}
      <div className="flex items-center gap-1 border-b px-3 py-1.5">
        <button
          onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <ZoomOut className="size-3.5" />
        </button>
        <span className="text-[10px] text-slate-400">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <ZoomIn className="size-3.5" />
        </button>
        <button
          onClick={() => setZoom(1)}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <RotateCw className="size-3.5" />
        </button>
      </div>

      {/* Image */}
      <div className="flex-1 overflow-auto p-4">
        {/* Generic artifact previews need to support arbitrary uploaded/blob URLs and natural image sizing. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fileUrl}
          alt={fileName}
          style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
          className="max-w-none"
        />
      </div>
    </div>
  );
}
