import { Graph } from "./graph";

// a, b, ... z, aa, ab, ... — short readable ids for exported Mermaid
function aliasFor(index: number): string {
  let n = index;
  let s = "";
  do {
    s = String.fromCharCode(97 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

function escapeLabel(label: string): string {
  return label.replace(/\r?\n/g, "<br/>").replace(/"/g, "&quot;");
}

export function graphToMermaid(graph: Graph, direction: "TB" | "LR" = "TB"): string {
  const lines = [`graph ${direction}`];

  const alias = new Map<string, string>();
  graph.nodes.forEach((node, i) => alias.set(node.id, aliasFor(i)));

  const declared = new Set<string>();
  const label = (id: string) => {
    const node = graph.nodes.find((n) => n.id === id);
    const a = alias.get(id) ?? id;
    if (declared.has(id) || !node) return a;
    declared.add(id);
    return `${a}["${escapeLabel(node.label)}"]`;
  };

  for (const edge of graph.edges) {
    if (!alias.has(edge.from) || !alias.has(edge.to)) continue;
    const arrow = edge.label ? `-->|${edge.label}|` : "-->";
    lines.push(`    ${label(edge.from)} ${arrow} ${label(edge.to)}`);
  }

  for (const node of graph.nodes) {
    if (!declared.has(node.id)) lines.push(`    ${label(node.id)}`);
  }

  return lines.join("\n");
}
