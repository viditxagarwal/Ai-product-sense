import ConfigDetail from "@/components/configurations/ConfigDetail";

export default function ConfigurationDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <ConfigDetail configId={params.id} />;
}
