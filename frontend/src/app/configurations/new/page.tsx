"use client";

import { Suspense } from "react";
import ConfigForm from "@/components/configurations/ConfigForm";

export default function NewConfigurationPage() {
  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center text-sm text-slate-400">Loading...</div>}>
      <ConfigForm />
    </Suspense>
  );
}
