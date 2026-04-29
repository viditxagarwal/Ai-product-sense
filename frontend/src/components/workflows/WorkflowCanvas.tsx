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
import WorkflowNode from "./CustomNodes/WorkflowNode";
import DeletableEdge from "./CustomEdge";
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
      // Ensure existing edges use the deletable type
      const edgesWithType = (gd.edges as Edge[]).map((e) => ({
        ...e,
        type: "deletable",
      }));
      setEdges(edgesWithType);
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
            type: "deletable",
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
    setContextMenu(null);
  }, []);

  // ─── Deletion helpers ───

  /** Delete a node by id, auto-reconnect surrounding nodes, update entry/exit */
  const deleteNodeById = useCallback(
    (nodeId: string) => {
      const incomingEdges = edgesRef.current.filter((e) => e.target === nodeId);
      const outgoingEdges = edgesRef.current.filter((e) => e.source === nodeId);

      // Auto-reconnect: if A→B→C, connect A→C
      const reconnectEdges: Edge[] = [];
      if (incomingEdges.length > 0 && outgoingEdges.length > 0) {
        for (const inc of incomingEdges) {
          for (const out of outgoingEdges) {
            // Don't create duplicate edges
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

      // Remove node and its edges, add reconnect edges
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => [
        ...eds.filter((e) => e.source !== nodeId && e.target !== nodeId),
        ...reconnectEdges,
      ]);

      // Clear selection if deleted node was selected
      setSelectedNode((prev) => (prev?.id === nodeId ? null : prev));

      // Update entry/exit if they referenced the deleted node
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

  /** Prompt confirmation then delete */
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

  /** Delete an edge by id (instant, no confirmation) */
  const deleteEdgeById = useCallback(
    (edgeId: string) => {
      setEdges((eds) => eds.filter((e) => e.id !== edgeId));
      toast.success("Edge deleted.");
    },
    [setEdges]
  );

  /** Disconnect all edges from a node */
  const disconnectNode = useCallback(
    (nodeId: string) => {
      setEdges((eds) =>
        eds.filter((e) => e.source !== nodeId && e.target !== nodeId)
      );
      toast.success("All edges disconnected.");
    },
    [setEdges]
  );

  /** Duplicate a node */
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

  // ─── Keyboard shortcut: Delete/Backspace ───
  // We disable React Flow's built-in deleteKeyCode and handle it ourselves
  // to show confirmation for nodes
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;

      // Don't intercept if user is typing in an input
      const tag = (event.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // Check for selected nodes
      const selectedNodes = nodesRef.current.filter((n) => n.selected);
      const selectedEdges = edgesRef.current.filter((e) => e.selected);

      if (selectedNodes.length > 0) {
        event.preventDefault();
        // Confirm for first selected node
        confirmDeleteNode(selectedNodes[0]);
      } else if (selectedEdges.length > 0) {
        event.preventDefault();
        // Instant delete for edges
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

        {selectedNode && (
          <NodeInspector
            node={selectedNode}
            onUpdate={handleNodeUpdate}
            onClose={() => setSelectedNode(null)}
            onDeleteNode={confirmDeleteNode}
          />
        )}
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

      {/* Right-click Context Menu (rendered as a fixed overlay) */}
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
                <button
                  className="flex w-full items-center rounded-sm px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100"
                  onClick={() => {
                    toast.info("Edge conditions can be configured via Decision nodes.");
                    setContextMenu(null);
                  }}
                >
                  Add Condition
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
