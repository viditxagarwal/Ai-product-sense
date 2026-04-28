import WorkflowCanvas from "@/components/workflows/WorkflowCanvas";

export default function WorkflowEditorPage({
  params,
}: {
  params: { id: string };
}) {
  return <WorkflowCanvas workflowId={params.id} />;
}
