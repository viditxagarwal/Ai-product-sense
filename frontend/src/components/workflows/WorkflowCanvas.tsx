"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  Panel,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type Connection,
  type NodeTypes,
  type EdgeTypes,
  type Node,
  type Edge,
  ConnectionLineType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Dagre from "@dagrejs/dagre";
import {
  ArrowLeft,
  Save,
  Check,
  LayoutGrid,
  Undo2,
  Redo2,
  AlignVerticalSpaceAround,
  Trash2,
  AlignHorizontalSpaceAround,
  AlignStartVertical,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useWorkflowStore } from "@/stores/workflow-store";
import NodeToolbar from "./NodeToolbar";
import NodeInspector from "./NodeInspector";
import EdgeInspector from "./EdgeInspector";
import WorkflowNode from "./CustomNodes/WorkflowNode";
import DeletableEdge from "./CustomEdge";
import LoopbackEdge from "./LoopbackEdge";
import type { LoopbackEdgeData } from "./LoopbackEdge";
import { NODE_TYPE_MAP } from "./nodeTypes";
import TemplatePicker from "./TemplatePicker";
import ReActOnboarding from "./ReActOnboarding";
import type { WorkflowTemplate } from "./workflowTemplates";
import type { WorkflowNodeData } from "./CustomNodes/WorkflowNode";

interface WorkflowCanvasProps {
  workflowId: string;
}

// ─── Helpers ───

function isLoopback(sourceId: string, targetId: string, nodes: Node[]): boolean {
  const sourceNode = nodes.find((n) => n.id === sourceId);
  const targetNode = nodes.find((n) => n.id === targetId);
  if (!sourceNode || !targetNode) return false;
  return targetNode.position.y < sourceNode.position.y;
}

function migrateLoopNodes(
  loadedNodes: Node[],
  loadedEdges: Edge[]
): { nodes: Node[]; edges: Edge[] } {
  const loopNodes = loadedNodes.filter(
    (n) => n.type === "loop" || (n.data as WorkflowNodeData)?.nodeType === "loop"
  );
  if (loopNodes.length === 0) return { nodes: loadedNodes, edges: loadedEdges };

  let migratedNodes = [...loadedNodes];
  let migratedEdges = [...loadedEdges];

  for (const loopNode of loopNodes) {
    const incoming = migratedEdges.filter((e) => e.target === loopNode.id);
    const outgoing = migratedEdges.filter((e) => e.source === loopNode.id);
    migratedNodes = migratedNodes.filter((n) => n.id !== loopNode.id);
    migratedEdges = migratedEdges.filter(
      (e) => e.source !== loopNode.id && e.target !== loopNode.id
    );
    if (incoming.length > 0 && outgoing.length > 0) {
      const sourceId = incoming[0].source;
      const targetId = outgoing[0].target;
      migratedEdges.push({
        id: `loopback-${sourceId}-${targetId}-${Date.now()}`,
        source: sourceId,
        target: targetId,
        type: "loopback",
        animated: false,
        data: {
          label: "Loop",
          loopCondition: "quality_threshold",
          maxIterations: 3,
          exitThreshold: 0.85,
          exitNodeId: "",
        },
      });
    }
  }
  return { nodes: migratedNodes, edges: migratedEdges };
}

// ─── Auto-layout with Dagre ───

function getLayoutedElements(nodes: Node[], edges: Edge[], direction: "TB" | "LR" = "TB") {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 60, ranksep: 80 });

  nodes.forEach((node) => {
    g.setNode(node.id, { width: 200, height: 80 });
  });
  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  Dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: { x: pos.x - 100, y: pos.y - 40 },
    };
  });

  return { nodes: layoutedNodes, edges };
}

// ─── History (Undo/Redo) ───

interface HistoryState {
  nodes: Node[];
  edges: Edge[];
}

const MAX_HISTORY = 20;

function useHistory() {
  const pastRef = useRef<HistoryState[]>([]);
  const futureRef = useRef<HistoryState[]>([]);

  const push = useCallback((state: HistoryState) => {
    pastRef.current = [...pastRef.current.slice(-(MAX_HISTORY - 1)), state];
    futureRef.current = [];
  }, []);

  const undo = useCallback(
    (
      currentNodes: Node[],
      currentEdges: Edge[],
      setNodes: (nds: Node[]) => void,
      setEdges: (eds: Edge[]) => void
    ) => {
      if (pastRef.current.length === 0) return false;
      const prev = pastRef.current[pastRef.current.length - 1];
      pastRef.current = pastRef.current.slice(0, -1);
      futureRef.current = [
        ...futureRef.current,
        { nodes: currentNodes, edges: currentEdges },
      ];
      setNodes(prev.nodes);
      setEdges(prev.edges);
      return true;
    },
    []
  );

  const redo = useCallback(
    (
      currentNodes: Node[],
      currentEdges: Edge[],
      setNodes: (nds: Node[]) => void,
      setEdges: (eds: Edge[]) => void
    ) => {
      if (futureRef.current.length === 0) return false;
      const next = futureRef.current[futureRef.current.length - 1];
      futureRef.current = futureRef.current.slice(0, -1);
      pastRef.current = [
        ...pastRef.current,
        { nodes: currentNodes, edges: currentEdges },
      ];
      setNodes(next.nodes);
      setEdges(next.edges);
      return true;
    },
    []
  );

  const canUndo = useCallback(() => pastRef.current.length > 0, []);
  const canRedo = useCallback(() => futureRef.current.length > 0, []);

  return { push, undo, redo, canUndo, canRedo };
}

// ─── Inner Canvas (needs ReactFlowProvider wrapper) ───

function WorkflowCanvasInner({ workflowId }: WorkflowCanvasProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentWorkflow, fetchWorkflow, updateWorkflow, loading } =
    useWorkflowStore();
  const { fitView } = useReactFlow();

  // Show onboarding overlay for ReAct template
  const [showOnboarding, setShowOnboarding] = useState(false);
  useEffect(() => {
    if (searchParams.get("onboarding") === "react") {
      setShowOnboarding(true);
      window.history.replaceState({}, "", `/workflows/${workflowId}`);
    }
  }, [searchParams, workflowId]);

  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const [workflowName, setWorkflowName] = useState("");
  const [entryPoint, setEntryPoint] = useState("");
  const [exitPoint, setExitPoint] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  // Deletion state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [nodeToDelete, setNodeToDelete] = useState<Node | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    type: "node" | "edge";
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);

  // Clipboard for copy-paste
  const clipboardRef = useRef<Node | null>(null);

  // History for undo/redo
  const history = useHistory();
  const [, forceRender] = useState(0);
  const skipHistoryRef = useRef(false);

  // Push current state to history before changes
  const pushHistory = useCallback(() => {
    history.push({ nodes: nodesRef.current, edges: edgesRef.current });
    forceRender((n) => n + 1);
  }, [history]);

  const nodeTypes: NodeTypes = useMemo(
    () => ({
      step: WorkflowNode,
      decision: WorkflowNode,
      parallel: WorkflowNode,
      human_review: WorkflowNode,
      retriever: WorkflowNode,
      agent_node: WorkflowNode,
      route: WorkflowNode,
      parallelization: WorkflowNode,
      loop: WorkflowNode,
      plan_and_execute: WorkflowNode,
      human_checkpoint: WorkflowNode,
      classifier: WorkflowNode,
      validator: WorkflowNode,
    }),
    []
  );

  const edgeTypes: EdgeTypes = useMemo(
    () => ({
      deletable: DeletableEdge,
      loopback: LoopbackEdge,
    }),
    []
  );

  const dirtyRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchWorkflow(workflowId);
  }, [workflowId, fetchWorkflow]);

  // Load graph data
  useEffect(() => {
    if (!currentWorkflow) return;
    setWorkflowName(currentWorkflow.workflow_name);
    setEntryPoint(currentWorkflow.entry_point || "");
    setExitPoint(currentWorkflow.exit_point || "");

    const gd = currentWorkflow.graph_data;
    let loadedNodes = (gd?.nodes || []) as Node[];
    let loadedEdges = (gd?.edges || []) as Edge[];

    const migrated = migrateLoopNodes(loadedNodes, loadedEdges);
    loadedNodes = migrated.nodes;
    loadedEdges = migrated.edges;

    loadedEdges = loadedEdges.map((e) => ({
      ...e,
      type: e.type === "loopback" ? "loopback" : "deletable",
    }));

    skipHistoryRef.current = true;
    setNodes(loadedNodes);
    setEdges(loadedEdges);
  }, [currentWorkflow, setNodes, setEdges]);

  const scheduleSave = useCallback(() => {
    dirtyRef.current = true;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      dirtyRef.current = false;
      performSave();
    }, 5000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const nameRef = useRef(workflowName);
  const entryRef = useRef(entryPoint);
  const exitRef = useRef(exitPoint);

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);
  useEffect(() => { nameRef.current = workflowName; }, [workflowName]);
  useEffect(() => { entryRef.current = entryPoint; }, [entryPoint]);
  useEffect(() => { exitRef.current = exitPoint; }, [exitPoint]);

  // Track history on node/edge changes (skip initial load)
  useEffect(() => {
    if (skipHistoryRef.current) {
      skipHistoryRef.current = false;
      return;
    }
    // Don't push during undo/redo (handled separately)
  }, [nodes, edges]);

  const performSave = useCallback(async () => {
    setSaveStatus("saving");
    try {
      await updateWorkflow(workflowId, {
        workflow_name: nameRef.current,
        entry_point: entryRef.current || undefined,
        exit_point: exitRef.current || undefined,
        graph_data: {
          nodes: nodesRef.current as unknown as Record<string, unknown>[],
          edges: edgesRef.current as unknown as Record<string, unknown>[],
        },
      });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("idle");
    }
  }, [workflowId, updateWorkflow]);

  useEffect(() => {
    if (currentWorkflow) scheduleSave();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  // ─── Connection handler ───
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      pushHistory();

      const loopback = isLoopback(connection.source, connection.target, nodesRef.current);

      if (loopback) {
        const newEdge: Edge = {
          id: `loopback-${connection.source}-${connection.target}-${Date.now()}`,
          source: connection.source,
          target: connection.target,
          sourceHandle: connection.sourceHandle ?? undefined,
          targetHandle: connection.targetHandle ?? undefined,
          type: "loopback",
          animated: false,
          data: {
            label: "Loop",
            loopCondition: "quality_threshold",
            maxIterations: 3,
            exitThreshold: 0.85,
            exitNodeId: "",
          } as LoopbackEdgeData,
        };
        setEdges((eds) => [...eds, newEdge]);
        toast.info("Loopback detected! Configure loop settings in the inspector.");
        setSelectedNode(null);
        setTimeout(() => setSelectedEdge(newEdge), 50);
      } else {
        setEdges((eds) =>
          addEdge(
            { ...connection, type: "deletable", animated: true, style: { strokeWidth: 2 } },
            eds
          )
        );
      }
    },
    [setEdges, pushHistory]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setSelectedEdge(null);
  }, []);

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    if (edge.type === "loopback") {
      setSelectedEdge(edge);
      setSelectedNode(null);
    }
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setSelectedEdge(null);
    setContextMenu(null);
  }, []);

  // ─── Deletion ───

  const deleteNodeById = useCallback(
    (nodeId: string) => {
      pushHistory();
      const incomingEdges = edgesRef.current.filter((e) => e.target === nodeId);
      const outgoingEdges = edgesRef.current.filter((e) => e.source === nodeId);

      const reconnectEdges: Edge[] = [];
      if (incomingEdges.length > 0 && outgoingEdges.length > 0) {
        for (const inc of incomingEdges) {
          for (const out of outgoingEdges) {
            const exists = edgesRef.current.some(
              (e) => e.source === inc.source && e.target === out.target
            );
            if (!exists && inc.source !== out.target) {
              reconnectEdges.push({
                id: `e-${inc.source}-${out.target}-${Date.now()}`,
                source: inc.source,
                target: out.target,
                type: "deletable",
                animated: true,
                style: { strokeWidth: 2 },
              });
            }
          }
        }
      }

      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => [
        ...eds.filter((e) => e.source !== nodeId && e.target !== nodeId),
        ...reconnectEdges,
      ]);

      setSelectedNode((prev) => (prev?.id === nodeId ? null : prev));
      if (entryRef.current === nodeId) setEntryPoint("");
      if (exitRef.current === nodeId) setExitPoint("");

      if (reconnectEdges.length > 0) {
        toast.success("Node deleted. Surrounding nodes reconnected.");
      } else {
        toast.success("Node deleted.");
      }
    },
    [setNodes, setEdges, pushHistory]
  );

  const confirmDeleteNode = useCallback((node: Node) => {
    setNodeToDelete(node);
    setDeleteDialogOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (nodeToDelete) deleteNodeById(nodeToDelete.id);
    setDeleteDialogOpen(false);
    setNodeToDelete(null);
  }, [nodeToDelete, deleteNodeById]);

  const deleteEdgeById = useCallback(
    (edgeId: string) => {
      pushHistory();
      setEdges((eds) => eds.filter((e) => e.id !== edgeId));
      setSelectedEdge((prev) => (prev?.id === edgeId ? null : prev));
      toast.success("Edge deleted.");
    },
    [setEdges, pushHistory]
  );

  const disconnectNode = useCallback(
    (nodeId: string) => {
      pushHistory();
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      toast.success("All edges disconnected.");
    },
    [setEdges, pushHistory]
  );

  const duplicateNode = useCallback(
    (node: Node) => {
      pushHistory();
      const config = NODE_TYPE_MAP[node.type || "step"];
      const id = `${node.type || "step"}_${Date.now()}`;
      const nodeData = node.data as unknown as WorkflowNodeData;
      const newNode: Node = {
        id,
        type: node.type,
        position: { x: node.position.x + 40, y: node.position.y + 40 },
        data: {
          ...node.data,
          label: `${nodeData.label || config?.label || "Node"} Copy`,
        },
      };
      setNodes((nds) => [...nds, newNode]);
      toast.success(`Duplicated "${nodeData.label || config?.label || "Node"}".`);
    },
    [setNodes, pushHistory]
  );

  // ─── Edge data update ───
  const handleEdgeUpdate = useCallback(
    (edgeId: string, data: Partial<LoopbackEdgeData>) => {
      setEdges((eds) =>
        eds.map((e) =>
          e.id === edgeId ? { ...e, data: { ...(e.data || {}), ...data } } : e
        )
      );
      setSelectedEdge((prev) =>
        prev && prev.id === edgeId
          ? { ...prev, data: { ...(prev.data || {}), ...data } }
          : prev
      );
    },
    [setEdges]
  );

  // ─── Auto-layout ───
  const handleAutoLayout = useCallback(
    (direction: "TB" | "LR" = "TB") => {
      pushHistory();
      const layouted = getLayoutedElements(nodesRef.current, edgesRef.current, direction);
      setNodes(layouted.nodes);
      setEdges(layouted.edges);
      setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 50);
      toast.success(direction === "TB" ? "Top-to-bottom layout applied." : "Left-to-right layout applied.");
    },
    [setNodes, setEdges, fitView, pushHistory]
  );

  // ─── Undo / Redo ───
  const handleUndo = useCallback(() => {
    skipHistoryRef.current = true;
    const ok = history.undo(
      nodesRef.current,
      edgesRef.current,
      (nds) => setNodes(nds),
      (eds) => setEdges(eds)
    );
    if (!ok) toast.info("Nothing to undo.");
  }, [history, setNodes, setEdges]);

  const handleRedo = useCallback(() => {
    skipHistoryRef.current = true;
    const ok = history.redo(
      nodesRef.current,
      edgesRef.current,
      (nds) => setNodes(nds),
      (eds) => setEdges(eds)
    );
    if (!ok) toast.info("Nothing to redo.");
  }, [history, setNodes, setEdges]);

  // ─── Multi-select actions ───
  const multiSelectedNodes = useMemo(
    () => nodes.filter((n) => n.selected),
    [nodes]
  );

  const deleteSelectedNodes = useCallback(() => {
    const selected = nodesRef.current.filter((n) => n.selected);
    if (selected.length === 0) return;
    pushHistory();
    const ids = new Set(selected.map((n) => n.id));
    setNodes((nds) => nds.filter((n) => !ids.has(n.id)));
    setEdges((eds) => eds.filter((e) => !ids.has(e.source) && !ids.has(e.target)));
    setSelectedNode(null);
    toast.success(`Deleted ${selected.length} node${selected.length > 1 ? "s" : ""}.`);
  }, [setNodes, setEdges, pushHistory]);

  const alignSelectedNodes = useCallback(
    (axis: "x" | "y") => {
      const selected = nodesRef.current.filter((n) => n.selected);
      if (selected.length < 2) return;
      pushHistory();
      const avg =
        selected.reduce((sum, n) => sum + n.position[axis], 0) / selected.length;
      const ids = new Set(selected.map((n) => n.id));
      setNodes((nds) =>
        nds.map((n) =>
          ids.has(n.id) ? { ...n, position: { ...n.position, [axis]: avg } } : n
        )
      );
      toast.success(axis === "x" ? "Aligned vertically." : "Aligned horizontally.");
    },
    [setNodes, pushHistory]
  );

  // ─── Keyboard shortcuts ───
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const tag = (event.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const mod = event.metaKey || event.ctrlKey;

      // Undo: Ctrl+Z
      if (mod && event.key === "z" && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
        return;
      }
      // Redo: Ctrl+Shift+Z or Ctrl+Y
      if (mod && ((event.key === "z" && event.shiftKey) || event.key === "y")) {
        event.preventDefault();
        handleRedo();
        return;
      }
      // Copy: Ctrl+C
      if (mod && event.key === "c") {
        const sel = nodesRef.current.filter((n) => n.selected);
        if (sel.length === 1) {
          clipboardRef.current = sel[0];
          toast.success("Node copied.");
        }
        return;
      }
      // Paste: Ctrl+V
      if (mod && event.key === "v") {
        if (!clipboardRef.current) return;
        event.preventDefault();
        pushHistory();
        const src = clipboardRef.current;
        const srcData = src.data as unknown as WorkflowNodeData;
        const id = `${src.type || "step"}_${Date.now()}`;
        const newNode: Node = {
          id,
          type: src.type,
          position: { x: src.position.x + 50, y: src.position.y + 50 },
          data: {
            ...src.data,
            label: `${srcData.label || "Node"} Copy`,
          },
        };
        setNodes((nds) => [...nds, newNode]);
        toast.success("Node pasted.");
        return;
      }

      // Delete/Backspace
      if (event.key !== "Delete" && event.key !== "Backspace") return;

      const selectedNodes = nodesRef.current.filter((n) => n.selected);
      const selectedEdges = edgesRef.current.filter((e) => e.selected);

      if (selectedNodes.length > 1) {
        event.preventDefault();
        deleteSelectedNodes();
      } else if (selectedNodes.length === 1) {
        event.preventDefault();
        confirmDeleteNode(selectedNodes[0]);
      } else if (selectedEdges.length > 0) {
        event.preventDefault();
        pushHistory();
        for (const edge of selectedEdges) {
          setEdges((eds) => eds.filter((e) => e.id !== edge.id));
        }
        toast.success("Edge(s) deleted.");
      }
    },
    [confirmDeleteNode, handleUndo, handleRedo, pushHistory, setNodes, setEdges, deleteSelectedNodes]
  );

  // ─── Context menu ───
  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      setContextMenu({ type: "node", id: node.id, x: event.clientX, y: event.clientY });
    },
    []
  );

  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault();
      setContextMenu({ type: "edge", id: edge.id, x: event.clientX, y: event.clientY });
    },
    []
  );

  // Add node from toolbar click
  const handleAddNode = useCallback(
    (nodeType: string) => {
      pushHistory();
      const config = NODE_TYPE_MAP[nodeType];
      const id = `${nodeType}_${Date.now()}`;
      const newNode: Node = {
        id,
        type: nodeType,
        position: { x: 250 + Math.random() * 200, y: 150 + Math.random() * 200 },
        data: {
          label: config?.label || "Node",
          nodeType,
          purpose: "",
          boundTools: [],
          onMissingData: "flag",
          onToolFailure: "retry",
          onLowConfidence: "proceed",
        },
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes, pushHistory]
  );

  // ─── Template insert ───
  const handleInsertTemplate = useCallback(
    (template: WorkflowTemplate) => {
      pushHistory();
      const graph = template.graph();
      setNodes((nds) => [...nds, ...graph.nodes]);
      setEdges((eds) => [
        ...eds,
        ...graph.edges.map((e) => ({
          ...e,
          type: e.type === "loopback" ? "loopback" : "deletable",
        })),
      ]);
      if (!entryRef.current && graph.entryPoint) {
        setEntryPoint(graph.entryPoint);
      }
      setTemplatePickerOpen(false);
      toast.success(`${template.label} pattern added. Customize nodes, tools, and prompts.`);
    },
    [setNodes, setEdges, pushHistory]
  );

  // Drop from toolbar drag
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const nodeType = event.dataTransfer.getData("application/workflow-node-type");
      if (!nodeType) return;
      pushHistory();

      const config = NODE_TYPE_MAP[nodeType];
      const id = `${nodeType}_${Date.now()}`;
      const reactFlowBounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const position = {
        x: event.clientX - reactFlowBounds.left - 80,
        y: event.clientY - reactFlowBounds.top - 20,
      };

      const newNode: Node = {
        id,
        type: nodeType,
        position,
        data: {
          label: config?.label || "Node",
          nodeType,
          purpose: "",
          boundTools: [],
          onMissingData: "flag",
          onToolFailure: "retry",
          onLowConfidence: "proceed",
        },
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes, pushHistory]
  );

  // Update node data from inspector
  const handleNodeUpdate = useCallback(
    (nodeId: string, data: Partial<WorkflowNodeData>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
        )
      );
      setSelectedNode((prev) =>
        prev && prev.id === nodeId
          ? { ...prev, data: { ...prev.data, ...data } }
          : prev
      );
    },
    [setNodes]
  );

  if (loading || !currentWorkflow) {
    return (
      <div className="flex h-96 items-center justify-center text-sm text-slate-400">
        Loading workflow...
      </div>
    );
  }

  const nodeOptions = nodes.map((n) => ({
    id: n.id,
    label: (n.data as unknown as WorkflowNodeData).label || n.id,
  }));

  const contextNode = contextMenu?.type === "node"
    ? nodes.find((n) => n.id === contextMenu.id) || null
    : null;
  const contextEdge = contextMenu?.type === "edge"
    ? edges.find((e) => e.id === contextMenu.id) || null
    : null;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Settings bar */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push("/workflows")}>
            <ArrowLeft className="mr-1 size-4" />
            Back
          </Button>
          <Input
            value={workflowName}
            onChange={(e) => { setWorkflowName(e.target.value); scheduleSave(); }}
            className="h-8 w-56 text-sm font-semibold"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Entry:</span>
            <Select
              value={entryPoint || "none"}
              onValueChange={(v) => { setEntryPoint(v === "none" ? "" : v); scheduleSave(); }}
            >
              <SelectTrigger className="h-7 w-36 text-xs">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {nodeOptions.map((n) => (
                  <SelectItem key={n.id} value={n.id}>{n.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Exit:</span>
            <Select
              value={exitPoint || "none"}
              onValueChange={(v) => { setExitPoint(v === "none" ? "" : v); scheduleSave(); }}
            >
              <SelectTrigger className="h-7 w-36 text-xs">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {nodeOptions.map((n) => (
                  <SelectItem key={n.id} value={n.id}>{n.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="h-5 w-px bg-slate-200" />

          {/* Undo / Redo */}
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="size-7 p-0"
                  onClick={handleUndo}
                  disabled={!history.canUndo()}
                >
                  <Undo2 className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Undo (Ctrl+Z)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="size-7 p-0"
                  onClick={handleRedo}
                  disabled={!history.canRedo()}
                >
                  <Redo2 className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Redo (Ctrl+Shift+Z)</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="h-5 w-px bg-slate-200" />

          {/* Auto-layout */}
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => handleAutoLayout("TB")}
                >
                  <AlignVerticalSpaceAround className="mr-1 size-3.5" />
                  Layout
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Auto-layout top-to-bottom</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Button variant="outline" size="sm" onClick={() => setTemplatePickerOpen(true)}>
            <LayoutGrid className="mr-1 size-4" />
            Templates
          </Button>

          <Button size="sm" onClick={performSave} disabled={saveStatus === "saving"}>
            {saveStatus === "saving" ? (
              <>Saving...</>
            ) : saveStatus === "saved" ? (
              <><Check className="mr-1 size-4" />Saved</>
            ) : (
              <><Save className="mr-1 size-4" />Save</>
            )}
          </Button>

          <Badge variant="secondary" className="text-[10px]">
            {nodes.length} step{nodes.length !== 1 ? "s" : ""} · {edges.length} connection{edges.length !== 1 ? "s" : ""}
          </Badge>
        </div>
      </div>

      {/* Three-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        <NodeToolbar onAddNode={handleAddNode} />

        {/* Canvas wrapper */}
        <div
          className="relative flex-1"
          onDragOver={onDragOver}
          onDrop={onDrop}
          onKeyDown={handleKeyDown}
          tabIndex={0}
        >
          {showOnboarding && (
            <ReActOnboarding onDismiss={() => setShowOnboarding(false)} />
          )}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            onNodeContextMenu={onNodeContextMenu}
            onEdgeContextMenu={onEdgeContextMenu}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={{
              type: "deletable",
              animated: true,
              style: { strokeWidth: 2, stroke: "#94a3b8" },
            }}
            connectionLineType={ConnectionLineType.SmoothStep}
            connectionLineStyle={{ stroke: "#3b82f6", strokeWidth: 2, strokeDasharray: "5 5" }}
            snapToGrid
            snapGrid={[20, 20]}
            selectionOnDrag
            panOnDrag={[1, 2]}
            fitView
            deleteKeyCode={null}
          >
            <Controls position="bottom-left" />
            <MiniMap
              position="bottom-right"
              nodeStrokeWidth={3}
              zoomable
              pannable
              className="!bg-slate-50"
            />
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="#e2e8f0"
            />

            {/* Multi-select floating toolbar */}
            {multiSelectedNodes.length > 1 && (
              <Panel position="top-center">
                <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 shadow-lg">
                  <span className="mr-1 text-xs font-medium text-slate-600">
                    {multiSelectedNodes.length} selected
                  </span>
                  <div className="h-4 w-px bg-slate-200" />
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="size-7 p-0 text-red-500 hover:text-red-600"
                          onClick={deleteSelectedNodes}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Delete selected</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="size-7 p-0"
                          onClick={() => alignSelectedNodes("y")}
                        >
                          <AlignHorizontalSpaceAround className="size-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Align horizontal</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="size-7 p-0"
                          onClick={() => alignSelectedNodes("x")}
                        >
                          <AlignStartVertical className="size-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Align vertical</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </Panel>
            )}
          </ReactFlow>
        </div>

        {/* Right panel */}
        {selectedEdge && selectedEdge.type === "loopback" ? (
          <EdgeInspector
            edge={selectedEdge}
            nodes={nodes}
            onUpdateEdge={handleEdgeUpdate}
            onDeleteEdge={deleteEdgeById}
            onClose={() => setSelectedEdge(null)}
          />
        ) : selectedNode ? (
          <NodeInspector
            node={selectedNode}
            edges={edges}
            onUpdate={handleNodeUpdate}
            onUpdateEdge={handleEdgeUpdate}
            onClose={() => setSelectedNode(null)}
            onDeleteNode={confirmDeleteNode}
          />
        ) : null}
      </div>

      {/* Delete Node Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this node?</AlertDialogTitle>
            <AlertDialogDescription>
              All connected edges will also be removed.
              {nodeToDelete && (() => {
                const inc = edges.filter((e) => e.target === nodeToDelete.id);
                const out = edges.filter((e) => e.source === nodeToDelete.id);
                if (inc.length > 0 && out.length > 0) {
                  return " Surrounding nodes will be reconnected automatically.";
                }
                return "";
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setNodeToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-red-600 hover:bg-red-700">
              Delete Node
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Template Picker */}
      <TemplatePicker
        open={templatePickerOpen}
        onOpenChange={setTemplatePickerOpen}
        onSelect={handleInsertTemplate}
        mode="insert"
      />

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setContextMenu(null)}
          onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
        >
          <div
            className="absolute z-50 min-w-[160px] overflow-hidden rounded-md border border-slate-200 bg-white p-1 shadow-lg"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            {contextMenu.type === "node" && contextNode && (
              <>
                <button
                  className="flex w-full items-center rounded-sm px-3 py-1.5 text-xs hover:bg-slate-100"
                  onClick={() => { confirmDeleteNode(contextNode); setContextMenu(null); }}
                >
                  <span className="text-red-600">Delete Node</span>
                </button>
                <button
                  className="flex w-full items-center rounded-sm px-3 py-1.5 text-xs hover:bg-slate-100"
                  onClick={() => { duplicateNode(contextNode); setContextMenu(null); }}
                >
                  Duplicate Node
                </button>
                <button
                  className="flex w-full items-center rounded-sm px-3 py-1.5 text-xs hover:bg-slate-100"
                  onClick={() => { disconnectNode(contextNode.id); setContextMenu(null); }}
                >
                  Disconnect All Edges
                </button>
              </>
            )}
            {contextMenu.type === "edge" && (
              <>
                <button
                  className="flex w-full items-center rounded-sm px-3 py-1.5 text-xs hover:bg-slate-100"
                  onClick={() => { deleteEdgeById(contextMenu.id); setContextMenu(null); }}
                >
                  <span className="text-red-600">Delete Edge</span>
                </button>
                {contextEdge?.type !== "loopback" && (
                  <button
                    className="flex w-full items-center rounded-sm px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100"
                    onClick={() => { toast.info("Edge conditions can be configured via Decision nodes."); setContextMenu(null); }}
                  >
                    Add Condition
                  </button>
                )}
                {contextEdge?.type === "loopback" && (
                  <button
                    className="flex w-full items-center rounded-sm px-3 py-1.5 text-xs hover:bg-slate-100"
                    onClick={() => { setSelectedEdge(contextEdge); setSelectedNode(null); setContextMenu(null); }}
                  >
                    Edit Loop Settings
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Wrapper with ReactFlowProvider ───

export default function WorkflowCanvas({ workflowId }: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner workflowId={workflowId} />
    </ReactFlowProvider>
  );
}
