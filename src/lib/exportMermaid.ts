import { Graph, GraphNode } from "./graph";

function wrapLabel(node: GraphNode): string {
  return `${node.id}[${node.label}]`;
}

export function graphToMermaid(graph: Graph, direction: "TB" | "LR" = "TB"): string {
  const lines = [`graph ${direction}`];
  const declared = new Set<string>();

  for (const edge of graph.edges) {
    const fromNode = graph.nodes.find((n) => n.id === edge.from);
    const toNode = graph.nodes.find((n) => n.id === edge.to);
    if (!fromNode || !toNode) continue;

    const fromText = declared.has(fromNode.id) ? fromNode.id : wrapLabel(fromNode);
    const toText = declared.has(toNode.id) ? toNode.id : wrapLabel(toNode);
    declared.add(fromNode.id);
    declared.add(toNode.id);

    const arrow = edge.label ? `-->|${edge.label}|` : "-->";
    lines.push(`    ${fromText} ${arrow} ${toText}`);
  }

  for (const node of graph.nodes) {
    if (!declared.has(node.id)) {
      lines.push(`    ${wrapLabel(node)}`);
      declared.add(node.id);
    }
  }

  return lines.join("\n");
}
