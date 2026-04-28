"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase";

interface GuardrailFileUploadProps {
  domainId: string;
  currentFileName: string | null;
  currentFileUrl: string | null;
  onSave: (fileName: string | null, fileUrl: string | null) => Promise<void>;
}

export default function GuardrailFileUpload({
  domainId,
  currentFileName,
  currentFileUrl,
  onSave,
}: GuardrailFileUploadProps) {
  const [uploading, setUploading] = useState(false);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      setUploading(true);
      const supabase = createClient();
      const filePath = `guardrails/${domainId}/${Date.now()}-${file.name}`;

      const { data, error } = await supabase.storage
        .from("documents")
        .upload(filePath, file);

      if (error) {
        console.error("Upload error:", error.message);
        setUploading(false);
        return;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("documents").getPublicUrl(data.path);

      await onSave(file.name, publicUrl);
      setUploading(false);
    },
    [domainId, onSave]
  );

  const handleRemove = async () => {
    await onSave(null, null);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    accept: {
      "application/pdf": [".pdf"],
      "text/plain": [".txt"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        [".docx"],
    },
  });

  if (currentFileName && currentFileUrl) {
    return (
      <div className="flex items-center gap-3 rounded-lg border px-4 py-3">
        <FileText className="size-4 shrink-0 text-slate-400" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{currentFileName}</p>
          <p className="text-xs text-muted-foreground">
            Enterprise guardrails file
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={handleRemove}>
          <X className="size-4 text-muted-foreground" />
        </Button>
      </div>
    );
  }

  return (
    <div
      {...getRootProps()}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${
        isDragActive
          ? "border-slate-400 bg-slate-50"
          : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <input {...getInputProps()} />
      {uploading ? (
        <Loader2 className="size-6 animate-spin text-slate-400" />
      ) : (
        <Upload className="size-6 text-slate-400" />
      )}
      <p className="mt-2 text-sm text-slate-500">
        {isDragActive
          ? "Drop guardrails file here"
          : "Upload enterprise guardrails file"}
      </p>
      <p className="mt-1 text-xs text-slate-400">PDF, DOCX, or TXT</p>
    </div>
  );
}
