import PromptEditor from "@/components/prompts/PromptEditor";

export default function PromptEditorPage({
  params,
}: {
  params: { id: string };
}) {
  return <PromptEditor promptId={params.id} />;
}
