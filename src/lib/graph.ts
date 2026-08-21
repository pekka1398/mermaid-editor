export type NodeShape = "rect" | "rounded" | "diamond" | "circle";

export interface GraphNode {
  id: string;
  label: string;
  shape: NodeShape;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  label: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function emptyGraph(): Graph {
  return { nodes: [], edges: [] };
}
