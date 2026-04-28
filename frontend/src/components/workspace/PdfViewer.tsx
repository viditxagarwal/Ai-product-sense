"use client";

interface PdfViewerProps {
  fileUrl: string;
}

export default function PdfViewer({ fileUrl }: PdfViewerProps) {
  return (
    <div className="flex h-full flex-col">
      <iframe
        src={fileUrl}
        title="PDF Viewer"
        className="flex-1 border-0"
        style={{ minHeight: 0 }}
      />
    </div>
  );
}
