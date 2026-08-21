import { Graph, GraphNode, GraphEdge, NodeShape } from "./graph";

const ARROW_PATTERN = /(<-\.->|<-->|<==>|-\.->|==>|-->|-\.-|===|---)/;

const SHAPE_WRAPPERS: { open: string; close: string; shape: NodeShape }[] = [
  { open: "((", close: "))", shape: "circle" },
  { open: "{", close: "}", shape: "diamond" },
  { open: "(", close: ")", shape: "rounded" },
  { open: "[", close: "]", shape: "rect" },
];

function parseNodeRef(
  raw: string
): { id: string; label?: string; shape?: NodeShape } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  for (const w of SHAPE_WRAPPERS) {
    const openIdx = trimmed.indexOf(w.open);
    if (openIdx > 0 && trimmed.endsWith(w.close)) {
      const id = trimmed.slice(0, openIdx);
      const label = trimmed.slice(openIdx + w.open.length, trimmed.length - w.close.length);
      return { id, label, shape: w.shape };
    }
  }

  const idMatch = trimmed.match(/^[A-Za-z0-9_-]+$/);
  if (idMatch) return { id: trimmed };
  return null;
}

export function parseMermaidFlowchart(source: string): Graph {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  let edgeCounter = 0;

  function ensureNode(id: string, label?: string, shape?: NodeShape) {
    const existing = nodes.get(id);
    if (existing) {
      if (label !== undefined) existing.label = label;
      if (shape !== undefined) existing.shape = shape;
      return;
    }
    nodes.set(id, {
      id,
      label: label ?? id,
      shape: shape ?? "rect",
      x: 0,
      y: 0,
      w: 140,
      h: 56,
    });
  }

  const lines = source.split("\n");

  for (const rawLine of lines) {
    const line = rawLine.split("%%")[0].trim();
    if (!line) continue;
    if (/^(graph|flowchart)\s+(TD|TB|LR|RL|BT)/i.test(line)) continue;
    if (/^(subgraph|end|classDef|class|style|click)\b/i.test(line)) continue;

    const arrowMatch = line.match(ARROW_PATTERN);
    if (arrowMatch) {
      const arrowIdx = arrowMatch.index!;
      const leftRaw = line.slice(0, arrowIdx);
      let rightRaw = line.slice(arrowIdx + arrowMatch[0].length).trim();

      let label = "";
      const labelMatch = rightRaw.match(/^\|(.*?)\|\s*(.*)$/);
      if (labelMatch) {
        label = labelMatch[1];
        rightRaw = labelMatch[2];
      }

      const left = parseNodeRef(leftRaw);
      const right = parseNodeRef(rightRaw);
      if (!left || !right) continue;

      ensureNode(left.id, left.label, left.shape);
      ensureNode(right.id, right.label, right.shape);

      edges.push({
        id: `e${edgeCounter++}`,
        from: left.id,
        to: right.id,
        label,
      });
      continue;
    }

    const solo = parseNodeRef(line);
    if (solo) {
      ensureNode(solo.id, solo.label, solo.shape);
    }
  }

  return { nodes: Array.from(nodes.values()), edges };
}
