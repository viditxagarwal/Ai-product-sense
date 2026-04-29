"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type NodeTypes,
  type EdgeTypes,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, Save, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import type { WorkflowNodeData } from "./CustomNodes/WorkflowNode";

interface WorkflowCanvasProps {
  workflowId: string;
}

// ─── Helpers ───

/** Check if target is "upstream" of source based on Y position (lower Y = earlier in flow) */
function isLoopback(
  sourceId: string,
  targetId: string,
  nodes: Node[]
): boolean {
  const sourceNode = nodes.find((n) => n.id === sourceId);
  const targetNode = nodes.find((n) => n.id === targetId);
  if (!sourceNode || !targetNode) return false;
  // Target is above (earlier) than source in canvas = loopback
  return targetNode.position.y < sourceNode.position.y;
}

/**
 * Migrate legacy "loop" nodes into loopback edges.
 * For each loop node: find its incoming and outgoing edges,
 * create a loopback edge from the node before it back to the node
 * the loop was supposed to target (the node it points to).
 * If loop node has A→Loop and Loop→B, we create B→A loopback and remove the loop node.
 * If it only has one side, just remove the loop node and reconnect.
 */
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

    // Remove loop node
    migratedNodes = migratedNodes.filter((n) => n.id !== loopNode.id);
    // Remove edges to/from loop node
    migratedEdges = migratedEdges.filter(
      (e) => e.source !== loopNode.id && e.target !== loopNode.id
    );

    // Create loopback edge: from the source of incoming edges
    // back to the target of outgoing edges
    if (incoming.length > 0 && outgoing.length > 0) {
      const sourceId = incoming[0].source; // node before loop
      const targetId = outgoing[0].target; // node loop points to
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

export default function WorkflowCanvas({ workflowId }: WorkflowCanvasProps) {
  const router = useRouter();
  const { currentWorkflow, fetchWorkflow, updateWorkflow, loading } =
    useWorkflowStore();

  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const [workflowName, setWorkflowName] = useState("");
  const [entryPoint, setEntryPoint] = useState("");
  const [exitPoint, setExitPoint] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle"
  );

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

  const nodeTypes: NodeTypes = useMemo(
    () => ({
      // Current types
      step: WorkflowNode,
      decision: WorkflowNode,
      parallel: WorkflowNode,
      human_review: WorkflowNode,
      // Legacy types (for backward compatibility with saved workflows)
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

  // Track whether there are unsaved changes
  const dirtyRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchWorkflow(workflowId);
  }, [workflowId, fetchWorkflow]);

  // Load graph data from workflow (with migration)
  useEffect(() => {
    if (!currentWorkflow) return;
    setWorkflowName(currentWorkflow.workflow_name);
    setEntryPoint(currentWorkflow.entry_point || "");
    setExitPoint(currentWorkflow.exit_point || "");

    const gd = currentWorkflow.graph_data;
    let loadedNodes = (gd?.nodes || []) as Node[];
    let loadedEdges = (gd?.edges || []) as Edge[];

    // Migrate legacy loop nodes to loopback edges
    const migrated = migrateLoopNodes(loadedNodes, loadedEdges);
    loadedNodes = migrated.nodes;
    loadedEdges = migrated.edges;

    // Ensure edge types
    loadedEdges = loadedEdges.map((e) => ({
      ...e,
      type: e.type === "loopback" ? "loopback" : "deletable",
    }));

    setNodes(loadedNodes);
    setEdges(loadedEdges);
  }, [currentWorkflow, setNodes, setEdges]);

  // Auto-save debounce: 5 seconds after changes
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

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);
  useEffect(() => {
    nameRef.current = workflowName;
  }, [workflowName]);
  useEffect(() => {
    entryRef.current = entryPoint;
  }, [entryPoint]);
  useEffect(() => {
    exitRef.current = exitPoint;
  }, [exitPoint]);

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

  // Trigger auto-save when nodes/edges change
  useEffect(() => {
    if (currentWorkflow) scheduleSave();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  // ─── Connection handler: detect loopback ───
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      const loopback = isLoopback(
        connection.source,
        connection.target,
        nodesRef.current
      );

      if (loopback) {
        // Create a loopback edge
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

        // Auto-select the edge to open inspector
        setSelectedNode(null);
        // We need to find it after state update
        setTimeout(() => {
          setSelectedEdge(newEdge);
        }, 50);
      } else {
        setEdges((eds) =>
          addEdge(
            {
              ...connection,
              type: "deletable",
              animated: true,
              style: { strokeWidth: 2 },
            },
            eds
          )
        );
      }
    },
    [setEdges]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNode(node);
      setSelectedEdge(null);
    },
    []
  );

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      if (edge.type === "loopback") {
        setSelectedEdge(edge);
        setSelectedNode(null);
      }
    },
    []
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setSelectedEdge(null);
    setContextMenu(null);
  }, []);

  // ─── Deletion helpers ───

  const deleteNodeById = useCallback(
    (nodeId: string) => {
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
    [setNodes, setEdges]
  );

  const confirmDeleteNode = useCallback((node: Node) => {
    setNodeToDelete(node);
    setDeleteDialogOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (nodeToDelete) {
      deleteNodeById(nodeToDelete.id);
    }
    setDeleteDialogOpen(false);
    setNodeToDelete(null);
  }, [nodeToDelete, deleteNodeById]);

  const deleteEdgeById = useCallback(
    (edgeId: string) => {
      setEdges((eds) => eds.filter((e) => e.id !== edgeId));
      setSelectedEdge((prev) => (prev?.id === edgeId ? null : prev));
      toast.success("Edge deleted.");
    },
    [setEdges]
  );

  const disconnectNode = useCallback(
    (nodeId: string) => {
      setEdges((eds) =>
        eds.filter((e) => e.source !== nodeId && e.target !== nodeId)
      );
      toast.success("All edges disconnected.");
    },
    [setEdges]
  );

  const duplicateNode = useCallback(
    (node: Node) => {
      const config = NODE_TYPE_MAP[node.type || "step"];
      const id = `${node.type || "step"}_${Date.now()}`;
      const newNode: Node = {
        id,
        type: node.type,
        position: {
          x: node.position.x + 40,
          y: node.position.y + 40,
        },
        data: { ...node.data },
      };
      setNodes((nds) => [...nds, newNode]);
      toast.success(`Duplicated "${(node.data as WorkflowNodeData).label || config?.label || "Node"}".`);
    },
    [setNodes]
  );

  // ─── Edge data update (for EdgeInspector) ───
  const handleEdgeUpdate = useCallback(
    (edgeId: string, data: Partial<LoopbackEdgeData>) => {
      setEdges((eds) =>
        eds.map((e) =>
          e.id === edgeId
            ? { ...e, data: { ...(e.data || {}), ...data } }
            : e
        )
      );
      // Keep selectedEdge in sync
      setSelectedEdge((prev) =>
        prev && prev.id === edgeId
          ? { ...prev, data: { ...(prev.data || {}), ...data } }
          : prev
      );
    },
    [setEdges]
  );

  // ─── Keyboard shortcut: Delete/Backspace ───
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;

      const tag = (event.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const selectedNodes = nodesRef.current.filter((n) => n.selected);
      const selectedEdges = edgesRef.current.filter((e) => e.selected);

      if (selectedNodes.length > 0) {
        event.preventDefault();
        confirmDeleteNode(selectedNodes[0]);
      } else if (selectedEdges.length > 0) {
        event.preventDefault();
        for (const edge of selectedEdges) {
          deleteEdgeById(edge.id);
        }
      }
    },
    [confirmDeleteNode, deleteEdgeById]
  );

  // ─── Context menu handlers ───
  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      setContextMenu({
        type: "node",
        id: node.id,
        x: event.clientX,
        y: event.clientY,
      });
    },
    []
  );

  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault();
      setContextMenu({
        type: "edge",
        id: edge.id,
        x: event.clientX,
        y: event.clientY,
      });
    },
    []
  );

  // Add node from toolbar click
  const handleAddNode = useCallback(
    (nodeType: string) => {
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
    [setNodes]
  );

  // ─── Template: add pre-wired pattern ───
  const handleAddTemplate = useCallback(
    (templateId: string) => {
      if (templateId !== "plan_and_execute") return;

      const ts = Date.now();
      const baseX = 300;
      const baseY = 100;
      const yGap = 160;

      const plannerId = `step_planner_${ts}`;
      const executorId = `step_executor_${ts}`;
      const decisionId = `decision_complete_${ts}`;
      const synthesizeId = `step_synthesize_${ts}`;

      const templateNodes: Node[] = [
        {
          id: plannerId,
          type: "step",
          position: { x: baseX, y: baseY },
          data: {
            label: "Planner",
            nodeType: "step",
            purpose: "Break the task into sequential steps",
            systemPromptHint:
              "This node's system prompt should instruct the LLM to break the task into numbered steps. The plan becomes the state that the Executor iterates through.",
            boundTools: [],
            onMissingData: "flag",
            onToolFailure: "retry",
            onLowConfidence: "proceed",
          },
        },
        {
          id: executorId,
          type: "step",
          position: { x: baseX, y: baseY + yGap },
          data: {
            label: "Executor",
            nodeType: "step",
            purpose: "Execute the current step from the plan",
            boundTools: [],
            onMissingData: "flag",
            onToolFailure: "retry",
            onLowConfidence: "proceed",
          },
        },
        {
          id: decisionId,
          type: "decision",
          position: { x: baseX, y: baseY + yGap * 2 },
          data: {
            label: "All Steps Complete?",
            nodeType: "decision",
            purpose: "Check if all steps in the plan have been executed",
            conditionType: "rule_based",
            conditionPrompt: "steps_remaining === 0",
            pathMappings: "true → Synthesize\nfalse → Executor",
            boundTools: [],
          },
        },
        {
          id: synthesizeId,
          type: "step",
          position: { x: baseX, y: baseY + yGap * 3 },
          data: {
            label: "Synthesize",
            nodeType: "step",
            purpose: "Merge all step outputs into a final result",
            boundTools: [],
            onMissingData: "flag",
            onToolFailure: "retry",
            onLowConfidence: "proceed",
          },
        },
      ];

      const templateEdges: Edge[] = [
        // Planner → Executor
        {
          id: `e-${plannerId}-${executorId}-${ts}`,
          source: plannerId,
          target: executorId,
          type: "deletable",
          animated: true,
          style: { strokeWidth: 2 },
        },
        // Executor → Decision
        {
          id: `e-${executorId}-${decisionId}-${ts}`,
          source: executorId,
          target: decisionId,
          type: "deletable",
          animated: true,
          style: { strokeWidth: 2 },
        },
        // Decision → Synthesize (exit path)
        {
          id: `e-${decisionId}-${synthesizeId}-${ts}`,
          source: decisionId,
          target: synthesizeId,
          type: "deletable",
          animated: true,
          style: { strokeWidth: 2 },
        },
        // Loopback: Decision → Executor (loop while steps remaining)
        {
          id: `loopback-${decisionId}-${executorId}-${ts}`,
          source: decisionId,
          target: executorId,
          type: "loopback",
          animated: false,
          data: {
            label: "Steps remaining",
            loopCondition: "max_iterations",
            maxIterations: 10,
            exitThreshold: 1.0,
            exitNodeId: synthesizeId,
          } as LoopbackEdgeData,
        },
      ];

      setNodes((nds) => [...nds, ...templateNodes]);
      setEdges((eds) => [...eds, ...templateEdges]);
      setEntryPoint(plannerId);
      toast.success(
        "Plan & Execute pattern added. All nodes are regular — customize tools, models, and prompts."
      );
    },
    [setNodes, setEdges]
  );

  // Drop from toolbar drag
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const nodeType = event.dataTransfer.getData(
        "application/workflow-node-type"
      );
      if (!nodeType) return;

      const config = NODE_TYPE_MAP[nodeType];
      const id = `${nodeType}_${Date.now()}`;

      const reactFlowBounds = (
        event.currentTarget as HTMLElement
      ).getBoundingClientRect();
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
    [setNodes]
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

  // Resolve context menu targets
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/workflows")}
          >
            <ArrowLeft className="mr-1 size-4" />
            Back
          </Button>
          <Input
            value={workflowName}
            onChange={(e) => {
              setWorkflowName(e.target.value);
              scheduleSave();
            }}
            className="h-8 w-56 text-sm font-semibold"
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Entry:</span>
            <Select
              value={entryPoint || "none"}
              onValueChange={(v) => {
                setEntryPoint(v === "none" ? "" : v);
                scheduleSave();
              }}
            >
              <SelectTrigger className="h-7 w-36 text-xs">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {nodeOptions.map((n) => (
                  <SelectItem key={n.id} value={n.id}>
                    {n.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Exit:</span>
            <Select
              value={exitPoint || "none"}
              onValueChange={(v) => {
                setExitPoint(v === "none" ? "" : v);
                scheduleSave();
              }}
            >
              <SelectTrigger className="h-7 w-36 text-xs">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {nodeOptions.map((n) => (
                  <SelectItem key={n.id} value={n.id}>
                    {n.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button size="sm" onClick={performSave} disabled={saveStatus === "saving"}>
            {saveStatus === "saving" ? (
              <>Saving...</>
            ) : saveStatus === "saved" ? (
              <>
                <Check className="mr-1 size-4" />
                Saved
              </>
            ) : (
              <>
                <Save className="mr-1 size-4" />
                Save
              </>
            )}
          </Button>

          <Badge variant="secondary" className="text-[10px]">
            {nodes.length} nodes · {edges.length} edges
          </Badge>
        </div>
      </div>

      {/* Three-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        <NodeToolbar onAddNode={handleAddNode} onAddTemplate={handleAddTemplate} />

        {/* Canvas wrapper with keyboard handler */}
        <div
          className="flex-1"
          onDragOver={onDragOver}
          onDrop={onDrop}
          onKeyDown={handleKeyDown}
          tabIndex={0}
        >
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
              gap={16}
              size={1}
              color="#e2e8f0"
            />
          </ReactFlow>
        </div>

        {/* Right panel: Node Inspector or Edge Inspector */}
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
            onClose={() => setSelectedNode(null)}
            onDeleteNode={confirmDeleteNode}
          />
        ) : null}
      </div>

      {/* Delete Node Confirmation Dialog */}
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
            <AlertDialogCancel onClick={() => setNodeToDelete(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete Node
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Right-click Context Menu */}
      {contextMenu && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setContextMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu(null);
          }}
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
                  onClick={() => {
                    confirmDeleteNode(contextNode);
                    setContextMenu(null);
                  }}
                >
                  <span className="text-red-600">Delete Node</span>
                </button>
                <button
                  className="flex w-full items-center rounded-sm px-3 py-1.5 text-xs hover:bg-slate-100"
                  onClick={() => {
                    duplicateNode(contextNode);
                    setContextMenu(null);
                  }}
                >
                  Duplicate Node
                </button>
                <button
                  className="flex w-full items-center rounded-sm px-3 py-1.5 text-xs hover:bg-slate-100"
                  onClick={() => {
                    disconnectNode(contextNode.id);
                    setContextMenu(null);
                  }}
                >
                  Disconnect All Edges
                </button>
              </>
            )}
            {contextMenu.type === "edge" && (
              <>
                <button
                  className="flex w-full items-center rounded-sm px-3 py-1.5 text-xs hover:bg-slate-100"
                  onClick={() => {
                    deleteEdgeById(contextMenu.id);
                    setContextMenu(null);
                  }}
                >
                  <span className="text-red-600">Delete Edge</span>
                </button>
                {contextEdge?.type !== "loopback" && (
                  <button
                    className="flex w-full items-center rounded-sm px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100"
                    onClick={() => {
                      toast.info("Edge conditions can be configured via Decision nodes.");
                      setContextMenu(null);
                    }}
                  >
                    Add Condition
                  </button>
                )}
                {contextEdge?.type === "loopback" && (
                  <button
                    className="flex w-full items-center rounded-sm px-3 py-1.5 text-xs hover:bg-slate-100"
                    onClick={() => {
                      setSelectedEdge(contextEdge);
                      setSelectedNode(null);
                      setContextMenu(null);
                    }}
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
