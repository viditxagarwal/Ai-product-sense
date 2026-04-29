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
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, Save, Check } from "lucide-react";
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
import { useWorkflowStore } from "@/stores/workflow-store";
import NodeToolbar from "./NodeToolbar";
import NodeInspector from "./NodeInspector";
import WorkflowNode from "./CustomNodes/WorkflowNode";
import { NODE_TYPE_MAP } from "./nodeTypes";
import type { WorkflowNodeData } from "./CustomNodes/WorkflowNode";

interface WorkflowCanvasProps {
  workflowId: string;
}

export default function WorkflowCanvas({ workflowId }: WorkflowCanvasProps) {
  const router = useRouter();
  const { currentWorkflow, fetchWorkflow, updateWorkflow, loading } =
    useWorkflowStore();

  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [workflowName, setWorkflowName] = useState("");
  const [entryPoint, setEntryPoint] = useState("");
  const [exitPoint, setExitPoint] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle"
  );

  const nodeTypes: NodeTypes = useMemo(
    () => ({
      // New types
      step: WorkflowNode,
      decision: WorkflowNode,
      parallel: WorkflowNode,
      human_review: WorkflowNode,
      retriever: WorkflowNode,
      // Legacy types (backward compatibility for existing workflows)
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

  // Track whether there are unsaved changes
  const dirtyRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchWorkflow(workflowId);
  }, [workflowId, fetchWorkflow]);

  // Load graph data from workflow
  useEffect(() => {
    if (!currentWorkflow) return;
    setWorkflowName(currentWorkflow.workflow_name);
    setEntryPoint(currentWorkflow.entry_point || "");
    setExitPoint(currentWorkflow.exit_point || "");

    const gd = currentWorkflow.graph_data;
    if (gd && gd.nodes) {
      setNodes(gd.nodes as Node[]);
    }
    if (gd && gd.edges) {
      setEdges(gd.edges as Edge[]);
    }
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

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            type: "default",
            animated: true,
            style: { strokeWidth: 2 },
          },
          eds
        )
      );
    },
    [setEdges]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNode(node);
    },
    []
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

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

      // Get canvas bounds for position calculation
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
      // Also update selectedNode for inspector reactivity
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
        <NodeToolbar onAddNode={handleAddNode} />

        <div className="flex-1" onDragOver={onDragOver} onDrop={onDrop}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            deleteKeyCode={["Backspace", "Delete"]}
            defaultEdgeOptions={{
              animated: true,
              style: { strokeWidth: 2, stroke: "#94a3b8" },
            }}
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

        {selectedNode && (
          <NodeInspector
            node={selectedNode}
            onUpdate={handleNodeUpdate}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>
    </div>
  );
}
