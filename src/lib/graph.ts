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

export interface GraphStroke {
  id: string;
  /** flattened [x0, y0, x1, y1, ...] in diagram (SVG) coordinates */
  points: number[];
  color: string;
  width: number;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  strokes?: GraphStroke[];
}

export function emptyGraph(): Graph {
  return { nodes: [], edges: [], strokes: [] };
}
