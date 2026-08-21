import dagre from "dagre";
import { Graph } from "./graph";

export function layoutGraph(graph: Graph, direction: "TB" | "LR" = "TB"): Graph {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: direction, nodesep: 40, ranksep: 60, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of graph.nodes) {
    g.setNode(node.id, { width: node.w, height: node.h });
  }
  for (const edge of graph.edges) {
    g.setEdge(edge.from, edge.to);
  }

  dagre.layout(g);

  const nodes = graph.nodes.map((node) => {
    const pos = g.node(node.id);
    return { ...node, x: pos.x - node.w / 2, y: pos.y - node.h / 2 };
  });

  return { nodes, edges: graph.edges };
}
