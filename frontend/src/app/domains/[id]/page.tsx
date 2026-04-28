import DomainDetail from "@/components/domains/DomainDetail";

export default function DomainDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <DomainDetail domainId={params.id} />;
}
