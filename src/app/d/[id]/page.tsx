import FlowchartEditor from "../../FlowchartEditor";

export default async function DiagramPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FlowchartEditor diagramId={id} />;
}
