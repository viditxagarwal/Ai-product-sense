import { Suspense } from "react";
import WorkflowCanvas from "@/components/workflows/WorkflowCanvas";

export default function WorkflowEditorPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <Suspense fallback={<div className="flex h-96 items-center justify-center text-sm text-slate-400">Loading workflow...</div>}>
      <WorkflowCanvas workflowId={params.id} />
    </Suspense>
  );
}
