"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Graph, GraphNode, emptyGraph } from "@/lib/graph";
import { parseMermaidFlowchart } from "@/lib/parseMermaid";
import { layoutGraph } from "@/lib/layout";
import { graphToMermaid } from "@/lib/exportMermaid";
import { wrapText } from "@/lib/textWrap";

const NODE_MAX_LINES = 3;
const NODE_LINE_HEIGHT = 16;
const NODE_TEXT_PADDING = 12;

const STORAGE_KEY = "flowchart-editor:graph";
const MIN_VIEW_W = 200;
const MAX_VIEW_W = 8000;

const DEFAULT_SOURCE = `graph TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Ship it]
    B -->|No| D[Debug]
    D --> B
`;

function nextId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

type Selection = { type: "node" | "edge"; id: string } | null;
type Editing = { type: "node" | "edge"; id: string; value: string } | null;
type Dragging = { ids: string[]; offsets: Record<string, { x: number; y: number }> } | null;
type ViewBox = { x: number; y: number; w: number; h: number };
type PanState = {
  startClientX: number;
  startClientY: number;
  startView: ViewBox;
  rectWidth: number;
  rectHeight: number;
} | null;
type MarqueeState = { startX: number; startY: number } | null;
type Rect = { x: number; y: number; w: number; h: number };

export default function FlowchartEditor() {
  const [graph, setGraph] = useState<Graph>(emptyGraph());
  const [selected, setSelected] = useState<Selection>(null);
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Editing>(null);
  const [dragging, setDragging] = useState<Dragging>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState(DEFAULT_SOURCE);
  const [view, setView] = useState<ViewBox>({ x: 0, y: 0, w: 1200, h: 800 });
  const [marqueeRect, setMarqueeRect] = useState<Rect | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<PanState>(null);
  const marqueeRef = useRef<MarqueeState>(null);
  const justMarqueedRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setView({ x: 0, y: 0, w: rect.width, h: rect.height });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = el!.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setView((v) => {
        const scaleFactor = Math.pow(1.0015, e.deltaY);
        const newW = Math.min(MAX_VIEW_W, Math.max(MIN_VIEW_W, v.w * scaleFactor));
        const factor = newW / v.w;
        const newH = v.h * factor;
        const px = v.x + (mx / rect.width) * v.w;
        const py = v.y + (my / rect.height) * v.h;
        return {
          x: px - (mx / rect.width) * newW,
          y: py - (my / rect.height) * newH,
          w: newW,
          h: newH,
        };
      });
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setGraph(dedupeGraph(JSON.parse(saved)));
        return;
      } catch {
        // fall through to default import
      }
    }
    setGraph(layoutGraph(parseMermaidFlowchart(DEFAULT_SOURCE)));
  }, []);

  useEffect(() => {
    if (graph.nodes.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(graph));
    }
  }, [graph]);

  const toSvgPoint = useCallback(
    (clientX: number, clientY: number) => {
      const container = containerRef.current;
      if (!container) return { x: 0, y: 0 };
      const rect = container.getBoundingClientRect();
      return {
        x: view.x + ((clientX - rect.left) / rect.width) * view.w,
        y: view.y + ((clientY - rect.top) / rect.height) * view.h,
      };
    },
    [view]
  );

  const svgRectToScreen = useCallback(
    (x: number, y: number, w: number, h: number) => {
      const container = containerRef.current;
      if (!container) return { left: 0, top: 0, width: 0, height: 0 };
      const rect = container.getBoundingClientRect();
      const scaleX = rect.width / view.w;
      const scaleY = rect.height / view.h;
      return {
        left: (x - view.x) * scaleX,
        top: (y - view.y) * scaleY,
        width: w * scaleX,
        height: h * scaleY,
      };
    },
    [view]
  );

  function handleNodePointerDown(e: React.PointerEvent, node: GraphNode) {
    e.stopPropagation();
    const p = toSvgPoint(e.clientX, e.clientY);
    if (multiSelected.size > 0 && multiSelected.has(node.id)) {
      const ids = Array.from(multiSelected);
      const offsets: Record<string, { x: number; y: number }> = {};
      for (const id of ids) {
        const n = graph.nodes.find((n) => n.id === id);
        if (n) offsets[id] = { x: p.x - n.x, y: p.y - n.y };
      }
      setDragging({ ids, offsets });
      return;
    }
    setDragging({ ids: [node.id], offsets: { [node.id]: { x: p.x - node.x, y: p.y - node.y } } });
  }

  function handleNodeClick(e: React.MouseEvent, node: GraphNode) {
    e.stopPropagation();
    if (multiSelected.has(node.id)) return;
    setMultiSelected(new Set());
    setSelected({ type: "node", id: node.id });
    setConnectFrom(node.id);
  }

  function handleNodeContextMenu(e: React.MouseEvent, node: GraphNode) {
    e.preventDefault();
    e.stopPropagation();
    if (connectFrom && connectFrom !== node.id) {
      setGraph((g) => ({
        ...g,
        edges: [...g.edges, { id: nextId("e"), from: connectFrom, to: node.id, label: "" }],
      }));
      setConnectFrom(null);
    }
  }

  function handleBackgroundPointerDown(e: React.PointerEvent) {
    if ((e.target as SVGElement).closest("[data-node-id],[data-edge-id]")) return;
    if (e.shiftKey) {
      const p = toSvgPoint(e.clientX, e.clientY);
      marqueeRef.current = { startX: p.x, startY: p.y };
      setMarqueeRect({ x: p.x, y: p.y, w: 0, h: 0 });
      return;
    }
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    panRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startView: view,
      rectWidth: rect.width,
      rectHeight: rect.height,
    };
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (dragging) {
      const p = toSvgPoint(e.clientX, e.clientY);
      setGraph((g) => ({
        ...g,
        nodes: g.nodes.map((n) => {
          const offset = dragging.offsets[n.id];
          if (!dragging.ids.includes(n.id) || !offset) return n;
          return { ...n, x: p.x - offset.x, y: p.y - offset.y };
        }),
      }));
      return;
    }
    if (marqueeRef.current) {
      const p = toSvgPoint(e.clientX, e.clientY);
      const { startX, startY } = marqueeRef.current;
      setMarqueeRect({
        x: Math.min(startX, p.x),
        y: Math.min(startY, p.y),
        w: Math.abs(p.x - startX),
        h: Math.abs(p.y - startY),
      });
      return;
    }
    if (panRef.current) {
      const p = panRef.current;
      const dx = e.clientX - p.startClientX;
      const dy = e.clientY - p.startClientY;
      const dxView = (dx / p.rectWidth) * p.startView.w;
      const dyView = (dy / p.rectHeight) * p.startView.h;
      setView({
        ...p.startView,
        x: p.startView.x - dxView,
        y: p.startView.y - dyView,
      });
    }
  }

  function handlePointerUp() {
    setDragging(null);
    panRef.current = null;
    if (marqueeRef.current && marqueeRect) {
      const { x, y, w, h } = marqueeRect;
      const ids = graph.nodes
        .filter(
          (n) =>
            n.x < x + w && n.x + n.w > x && n.y < y + h && n.y + n.h > y
        )
        .map((n) => n.id);
      setMultiSelected(new Set(ids));
      setSelected(null);
      marqueeRef.current = null;
      setMarqueeRect(null);
      justMarqueedRef.current = true;
    }
  }

  function handleCanvasDoubleClick(e: React.MouseEvent) {
    if ((e.target as SVGElement).closest("[data-node-id]")) return;
    const p = toSvgPoint(e.clientX, e.clientY);
    const id = nextId("n");
    const node: GraphNode = {
      id,
      label: "New",
      shape: "rect",
      x: p.x - 70,
      y: p.y - 28,
      w: 140,
      h: 56,
    };
    setGraph((g) => ({ ...g, nodes: [...g.nodes, node] }));
    setSelected({ type: "node", id });
    setEditing({ type: "node", id, value: "New" });
  }

  function startEditNode(node: GraphNode) {
    setEditing({ type: "node", id: node.id, value: node.label });
  }

  function commitEdit() {
    if (!editing) return;
    if (editing.type === "node") {
      setGraph((g) => ({
        ...g,
        nodes: g.nodes.map((n) =>
          n.id === editing.id ? { ...n, label: editing.value } : n
        ),
      }));
    } else {
      setGraph((g) => ({
        ...g,
        edges: g.edges.map((edge) =>
          edge.id === editing.id ? { ...edge, label: editing.value } : edge
        ),
      }));
    }
    setEditing(null);
  }

  const deleteSelected = useCallback(() => {
    if (multiSelected.size > 0) {
      setGraph((g) => ({
        nodes: g.nodes.filter((n) => !multiSelected.has(n.id)),
        edges: g.edges.filter((e) => !multiSelected.has(e.from) && !multiSelected.has(e.to)),
      }));
      setMultiSelected(new Set());
      return;
    }
    if (!selected) return;
    if (selected.type === "node") {
      setGraph((g) => ({
        nodes: g.nodes.filter((n) => n.id !== selected.id),
        edges: g.edges.filter((e) => e.from !== selected.id && e.to !== selected.id),
      }));
    } else {
      setGraph((g) => ({ ...g, edges: g.edges.filter((e) => e.id !== selected.id) }));
    }
    setSelected(null);
  }, [selected, multiSelected]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (editing) return;
      if ((e.key === "Delete" || e.key === "Backspace") && (selected || multiSelected.size > 0)) {
        const active = document.activeElement;
        if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
        e.preventDefault();
        deleteSelected();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected, multiSelected, editing, deleteSelected]);

  function runImport() {
    const parsed = layoutGraph(parseMermaidFlowchart(importText));
    setGraph(parsed);
    setShowImport(false);
    setSelected(null);
  }

  function exportMermaid() {
    const text = graphToMermaid(graph);
    downloadText(text, "diagram.mmd");
  }

  function exportSvg() {
    const svg = svgRef.current;
    if (!svg) return;
    const bbox = computeBBox(graph);
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute(
      "viewBox",
      `${bbox.x - 20} ${bbox.y - 20} ${bbox.w + 40} ${bbox.h + 40}`
    );
    clone.setAttribute("width", String(bbox.w + 40));
    clone.setAttribute("height", String(bbox.h + 40));
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(clone);
    downloadText(
      `<?xml version="1.0" encoding="UTF-8"?>\n${source}`,
      "diagram.svg",
      "image/svg+xml"
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-zinc-50 dark:bg-black">
      <main ref={containerRef} className="relative flex-1 overflow-hidden">
        <div className="absolute right-4 top-4 z-10 flex gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="rounded border border-zinc-300 bg-white/90 px-3 py-1 text-xs font-medium text-zinc-700 shadow-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-200"
          >
            Import Mermaid
          </button>
          <button
            onClick={exportMermaid}
            className="rounded border border-zinc-300 bg-white/90 px-3 py-1 text-xs font-medium text-zinc-700 shadow-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-200"
          >
            Export .mmd
          </button>
          <button
            onClick={exportSvg}
            className="rounded bg-zinc-900 px-3 py-1 text-xs font-medium text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900"
          >
            Export SVG
          </button>
        </div>
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          className="bg-white dark:bg-zinc-950"
          onPointerDown={handleBackgroundPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onDoubleClick={handleCanvasDoubleClick}
          onClick={(e) => {
            if (justMarqueedRef.current) {
              justMarqueedRef.current = false;
              return;
            }
            if (!(e.target as SVGElement).closest("[data-node-id],[data-edge-id]")) {
              setSelected(null);
              setConnectFrom(null);
              setMultiSelected(new Set());
            }
          }}
          onContextMenu={(e) => {
            if (!(e.target as SVGElement).closest("[data-node-id]")) {
              e.preventDefault();
              setConnectFrom(null);
            }
          }}
        >
          <defs>
            <marker
              id="arrow-end"
              markerWidth="12"
              markerHeight="12"
              refX="10"
              refY="6"
              markerUnits="userSpaceOnUse"
              orient="auto"
              overflow="visible"
            >
              <path d="M0,0 L12,6 L0,12 z" fill="#52525b" />
            </marker>
            <marker
              id="arrow-end-selected"
              markerWidth="12"
              markerHeight="12"
              refX="10"
              refY="6"
              markerUnits="userSpaceOnUse"
              orient="auto"
              overflow="visible"
            >
              <path d="M0,0 L12,6 L0,12 z" fill="#2563eb" />
            </marker>
          </defs>

          {graph.edges.map((edge) => {
            const from = graph.nodes.find((n) => n.id === edge.from);
            const to = graph.nodes.find((n) => n.id === edge.to);
            if (!from || !to) return null;
            const fcx = from.x + from.w / 2;
            const fcy = from.y + from.h / 2;
            const tcx = to.x + to.w / 2;
            const tcy = to.y + to.h / 2;
            const dx = tcx - fcx;
            const dy = tcy - fcy;
            const start = borderPoint(fcx, fcy, from.w / 2, from.h / 2, dx, dy);
            const end = borderPoint(tcx, tcy, to.w / 2, to.h / 2, -dx, -dy);
            const x1 = start.x;
            const y1 = start.y;
            const x2 = end.x;
            const y2 = end.y;
            const isSelected = selected?.type === "edge" && selected.id === edge.id;
            const mx = (fcx + tcx) / 2;
            const my = (fcy + tcy) / 2;
            return (
              <g key={edge.id}>
                <line
                  data-edge-id={edge.id}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={isSelected ? "#2563eb" : "#71717a"}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  markerEnd={isSelected ? "url(#arrow-end-selected)" : "url(#arrow-end)"}
                  className="cursor-pointer text-zinc-500"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected({ type: "edge", id: edge.id });
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditing({ type: "edge", id: edge.id, value: edge.label });
                  }}
                />
                {edge.label && (
                  <text
                    x={mx}
                    y={my - 6}
                    textAnchor="middle"
                    className="pointer-events-none fill-zinc-600 text-xs dark:fill-zinc-300"
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}

          {graph.nodes.map((node) => {
            const isMulti = multiSelected.has(node.id);
            const isSelected = selected?.type === "node" && selected.id === node.id;
            const isConnectSource = connectFrom === node.id;
            const isEditing = editing?.type === "node" && editing.id === node.id;
            const stroke = isMulti
              ? "#16a34a"
              : isConnectSource
              ? "#16a34a"
              : isSelected
              ? "#2563eb"
              : "#3f3f46";
            return (
              <g
                key={node.id}
                data-node-id={node.id}
                onPointerDown={(e) => handleNodePointerDown(e, node)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  startEditNode(node);
                }}
                onClick={(e) => handleNodeClick(e, node)}
                onContextMenu={(e) => handleNodeContextMenu(e, node)}
                className="cursor-move"
              >
                <rect
                  x={node.x}
                  y={node.y}
                  width={node.w}
                  height={node.h}
                  rx={4}
                  fill="white"
                  stroke={stroke}
                  strokeWidth={isSelected || isConnectSource || isMulti ? 2.5 : 1.5}
                />
                {!isEditing && (() => {
                  const lines = wrapText(
                    node.label,
                    node.w - NODE_TEXT_PADDING * 2,
                    NODE_MAX_LINES
                  );
                  const cx = node.x + node.w / 2;
                  const startY =
                    node.y + node.h / 2 - ((lines.length - 1) * NODE_LINE_HEIGHT) / 2;
                  return (
                    <text
                      textAnchor="middle"
                      className="pointer-events-none select-none fill-zinc-800 text-sm dark:fill-zinc-100"
                    >
                      {lines.map((line, i) => (
                        <tspan key={i} x={cx} y={startY + i * NODE_LINE_HEIGHT} dominantBaseline="middle">
                          {line}
                        </tspan>
                      ))}
                    </text>
                  );
                })()}
              </g>
            );
          })}

          {marqueeRect && (
            <rect
              x={marqueeRect.x}
              y={marqueeRect.y}
              width={marqueeRect.w}
              height={marqueeRect.h}
              fill="#16a34a1a"
              stroke="#16a34a"
              strokeWidth={1}
              strokeDasharray="4 3"
              pointerEvents="none"
            />
          )}
        </svg>

        {editing && editing.type === "node" && (() => {
          const node = graph.nodes.find((n) => n.id === editing.id);
          if (!node) return null;
          const screen = svgRectToScreen(node.x, node.y, node.w, node.h);
          return (
            <input
              autoFocus
              value={editing.value}
              onChange={(e) => setEditing({ ...editing, value: e.target.value })}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEdit();
                if (e.key === "Escape") setEditing(null);
              }}
              style={{
                position: "absolute",
                left: screen.left,
                top: screen.top,
                width: screen.width,
                height: screen.height,
              }}
              className="rounded border border-blue-500 bg-white px-2 text-center text-sm text-zinc-900 outline-none"
            />
          );
        })()}

        {editing && editing.type === "edge" && (() => {
          const edge = graph.edges.find((e) => e.id === editing.id);
          const from = graph.nodes.find((n) => n.id === edge?.from);
          const to = graph.nodes.find((n) => n.id === edge?.to);
          if (!edge || !from || !to) return null;
          const mx = (from.x + from.w / 2 + to.x + to.w / 2) / 2;
          const my = (from.y + from.h / 2 + to.y + to.h / 2) / 2;
          const screen = svgRectToScreen(mx - 60, my - 12, 120, 24);
          return (
            <input
              autoFocus
              value={editing.value}
              onChange={(e) => setEditing({ ...editing, value: e.target.value })}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEdit();
                if (e.key === "Escape") setEditing(null);
              }}
              style={{
                position: "absolute",
                left: screen.left,
                top: screen.top,
                width: screen.width,
              }}
              className="rounded border border-blue-500 bg-white px-2 text-center text-xs text-zinc-900 outline-none"
            />
          );
        })()}
      </main>

      {showImport && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40">
          <div className="flex w-[600px] flex-col gap-3 rounded-lg bg-white p-4 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Paste Mermaid flowchart
            </h2>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={12}
              spellCheck={false}
              className="rounded border border-zinc-300 bg-white p-2 font-mono text-xs text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowImport(false)}
                className="rounded border border-zinc-300 px-3 py-1 text-xs text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
              >
                Cancel
              </button>
              <button
                onClick={runImport}
                className="rounded bg-zinc-900 px-3 py-1 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                Import & Layout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function dedupeGraph(graph: Graph): Graph {
  const seenNodeIds = new Set<string>();
  const nodes = graph.nodes.map((node) => {
    if (seenNodeIds.has(node.id)) {
      return { ...node, id: nextId("n") };
    }
    seenNodeIds.add(node.id);
    return node;
  });

  const seenEdgeIds = new Set<string>();
  const edges = graph.edges.map((edge) => {
    if (!seenEdgeIds.has(edge.id)) {
      seenEdgeIds.add(edge.id);
      return edge;
    }
    const id = nextId("e");
    seenEdgeIds.add(id);
    return { ...edge, id };
  });

  return { nodes, edges };
}

function borderPoint(
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  dx: number,
  dy: number
) {
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const scaleX = dx !== 0 ? halfW / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? halfH / Math.abs(dy) : Infinity;
  const scale = Math.min(scaleX, scaleY);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

function computeBBox(graph: Graph) {
  if (graph.nodes.length === 0) return { x: 0, y: 0, w: 400, h: 300 };
  const minX = Math.min(...graph.nodes.map((n) => n.x));
  const minY = Math.min(...graph.nodes.map((n) => n.y));
  const maxX = Math.max(...graph.nodes.map((n) => n.x + n.w));
  const maxY = Math.max(...graph.nodes.map((n) => n.y + n.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function downloadText(content: string, filename: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
