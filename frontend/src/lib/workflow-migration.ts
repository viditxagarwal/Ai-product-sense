import type { Node, Edge } from "@xyflow/react";
import type { WorkflowComponentType, WorkflowEdgeData } from "@/types";

// Map old node types to new componentType + config
const OLD_TO_NEW: Record<string, { componentType: WorkflowComponentType; llmEnabled?: boolean }> = {
  step: { componentType: "node", llmEnabled: true },
  agent_node: { componentType: "node", llmEnabled: true },
  classifier: { componentType: "node", llmEnabled: true },
  retriever: { componentType: "node", llmEnabled: false },
  validator: { componentType: "node", llmEnabled: false },
  human_review: { componentType: "gate" },
  human_checkpoint: { componentType: "gate" },
  parallel: { componentType: "split" },
  parallelization: { componentType: "split" },
};

export interface MigrationResult {
  nodes: Node[];
  edges: Edge[];
  migrated: boolean;
  startNodeId: string;
  endNodeId: string;
}

/**
 * Migrate old workflow graph_data to the new component model.
 * Adds START/END if missing, converts old node/edge types, preserves data fields.
 */
export function migrateWorkflowData(graphData: Record<string, unknown>): MigrationResult {
  let nodes = ((graphData.nodes || []) as Record<string, unknown>[]).map((n) => ({ ...n })) as Node[];
  let edges = ((graphData.edges || []) as Record<string, unknown>[]).map((e) => ({ ...e })) as Edge[];
  let migrated = false;

  // 1. Check if already migrated (has start/end nodes with componentType)
  const hasStart = nodes.some((n) => n.type === "start");
  const hasEnd = nodes.some((n) => n.type === "end");
  const hasComponentType = nodes.some((n) => (n.data as Record<string, unknown>)?.componentType);

  if (hasStart && hasEnd && hasComponentType) {
    // Already migrated — find start/end IDs
    const startId = nodes.find((n) => n.type === "start")!.id;
    const endId = nodes.find((n) => n.type === "end")!.id;
    return { nodes, edges, migrated: false, startNodeId: startId, endNodeId: endId };
  }

  // 2. Migrate loop nodes → loop edges (existing logic from old migrateLoopNodes)
  const loopNodes = nodes.filter(
    (n) => n.type === "loop" || (n.data as Record<string, unknown>)?.nodeType === "loop"
  );
  for (const loopNode of loopNodes) {
    const incoming = edges.filter((e) => e.target === loopNode.id);
    const outgoing = edges.filter((e) => e.source === loopNode.id);
    nodes = nodes.filter((n) => n.id !== loopNode.id);
    edges = edges.filter((e) => e.source !== loopNode.id && e.target !== loopNode.id);
    if (incoming.length > 0 && outgoing.length > 0) {
      const sourceId = incoming[0].source;
      const targetId = outgoing[0].target;
      const loopData = loopNode.data as Record<string, unknown>;
      edges.push({
        id: `smart-loop-${sourceId}-${targetId}`,
        source: sourceId,
        target: targetId,
        type: "smart",
        data: {
          edgeType: "loop",
          maxIterations: (loopData.maxIterations as number) || 3,
          exitThreshold: (loopData.exitThreshold as number) || 0.85,
          onMaxReached: "use_best",
        } as WorkflowEdgeData,
      } as Edge);
    }
    migrated = true;
  }

  // 3. Migrate decision/route nodes → conditional edges
  const decisionNodes = nodes.filter(
    (n) => n.type === "decision" || n.type === "route"
  );
  for (const decNode of decisionNodes) {
    const incoming = edges.filter((e) => e.target === decNode.id);
    const outgoing = edges.filter((e) => e.source === decNode.id);
    nodes = nodes.filter((n) => n.id !== decNode.id);
    edges = edges.filter((e) => e.source !== decNode.id && e.target !== decNode.id);

    const decData = decNode.data as Record<string, unknown>;
    const conditionPrompt = (decData.conditionPrompt as string) || (decData.purpose as string) || "";

    for (const inc of incoming) {
      for (const out of outgoing) {
        edges.push({
          id: `smart-cond-${inc.source}-${out.target}`,
          source: inc.source,
          target: out.target,
          type: "smart",
          data: {
            edgeType: "conditional",
            conditionMethod: "llm_evaluation",
            conditionPrompt,
            confidenceThreshold: 0.7,
          } as WorkflowEdgeData,
        } as Edge);
      }
    }
    migrated = true;
  }

  // 4. Migrate plan_and_execute nodes → Planner + Executor with loop
  const peNodes = nodes.filter((n) => n.type === "plan_and_execute" || n.type === "plan_execute");
  for (const peNode of peNodes) {
    const incoming = edges.filter((e) => e.target === peNode.id);
    const outgoing = edges.filter((e) => e.source === peNode.id);
    nodes = nodes.filter((n) => n.id !== peNode.id);
    edges = edges.filter((e) => e.source !== peNode.id && e.target !== peNode.id);

    const plannerId = `migrated-planner-${Date.now()}`;
    const executorId = `migrated-executor-${Date.now() + 1}`;

    nodes.push({
      id: plannerId, type: "node",
      position: { x: peNode.position.x, y: peNode.position.y },
      data: { label: "Planner", componentType: "node", nodeType: "node", llmEnabled: true, systemPrompt: "Break the task into steps.", boundTools: [] },
    } as Node);
    nodes.push({
      id: executorId, type: "node",
      position: { x: peNode.position.x + 240, y: peNode.position.y },
      data: { label: "Executor", componentType: "node", nodeType: "node", llmEnabled: true, systemPrompt: "Execute the current step.", boundTools: [] },
    } as Node);

    edges.push({ id: `smart-${plannerId}-${executorId}`, source: plannerId, target: executorId, type: "smart", data: { edgeType: "flow" } as WorkflowEdgeData } as Edge);
    edges.push({ id: `smart-loop-${executorId}-${plannerId}`, source: executorId, target: plannerId, type: "smart", data: { edgeType: "loop", maxIterations: 10, exitThreshold: 0.85, onMaxReached: "use_best" } as WorkflowEdgeData } as Edge);

    // Reconnect incoming to planner, outgoing from executor
    for (const inc of incoming) {
      edges.push({ id: `smart-${inc.source}-${plannerId}`, source: inc.source, target: plannerId, type: "smart", data: { edgeType: "flow" } as WorkflowEdgeData } as Edge);
    }
    for (const out of outgoing) {
      edges.push({ id: `smart-${executorId}-${out.target}`, source: executorId, target: out.target, type: "smart", data: { edgeType: "conditional", conditionMethod: "always", label: "plan complete" } as WorkflowEdgeData } as Edge);
    }
    migrated = true;
  }

  // 5. Convert remaining old node types
  for (const node of nodes) {
    const mapping = OLD_TO_NEW[node.type || ""];
    if (mapping) {
      const oldData = node.data as Record<string, unknown>;
      const newData: Record<string, unknown> = {
        ...oldData,
        componentType: mapping.componentType,
        nodeType: mapping.componentType,
      };

      // Preserve old fields under new names
      if (mapping.llmEnabled !== undefined) newData.llmEnabled = mapping.llmEnabled;
      if (oldData.systemPromptHint && !oldData.systemPrompt) {
        newData.systemPrompt = oldData.systemPromptHint;
      }
      if (oldData.purpose && !oldData.systemPrompt && !oldData.systemPromptHint) {
        newData.systemPrompt = oldData.purpose;
      }

      // Gate mapping
      if (mapping.componentType === "gate") {
        if (oldData.displayContent) newData.reviewInstructions = oldData.displayContent;
        if (oldData.timeoutBehavior) newData.onTimeout = oldData.timeoutBehavior;
        if (oldData.timeoutMinutes) newData.waitDuration = `${oldData.timeoutMinutes}m`;
      }

      // Split mapping
      if (mapping.componentType === "split") {
        if (oldData.fanOutMethod === "by_subtask") newData.fanOutMethod = "same_input";
        if (oldData.fanOutMethod === "by_perspective") newData.fanOutMethod = "custom_per_branch";
        if (oldData.mergeMethod === "synthesize") newData.mergeMethod = "summarize";
      }

      node.type = mapping.componentType;
      node.data = newData;
      migrated = true;
    } else if (!["start", "end", "node", "gate", "split"].includes(node.type || "")) {
      // Unknown old type → default to node
      const oldData = node.data as Record<string, unknown>;
      node.type = "node";
      node.data = { ...oldData, componentType: "node", nodeType: "node", llmEnabled: true };
      migrated = true;
    }
  }

  // 6. Convert edge types
  for (const edge of edges) {
    if (edge.type === "loopback") {
      const oldData = (edge.data || {}) as Record<string, unknown>;
      edge.type = "smart";
      edge.data = {
        edgeType: "loop",
        maxIterations: oldData.maxIterations || 3,
        exitThreshold: oldData.exitThreshold || 0.85,
        onMaxReached: "use_best",
        label: oldData.label || "Loop",
      } as WorkflowEdgeData;
      migrated = true;
    } else if (edge.type === "deletable" || !edge.type) {
      const edgeData = (edge.data || {}) as Record<string, unknown>;
      if (!edgeData.edgeType) {
        // Infer type: backward edges are loops
        const sourceNode = nodes.find((n) => n.id === edge.source);
        const targetNode = nodes.find((n) => n.id === edge.target);
        const isBackward = sourceNode && targetNode && targetNode.position.x < sourceNode.position.x;
        edge.type = "smart";
        edge.data = {
          edgeType: isBackward ? "loop" : "flow",
          ...(isBackward ? { maxIterations: 3, exitThreshold: 0.85, onMaxReached: "use_best" } : {}),
        } as WorkflowEdgeData;
        migrated = true;
      }
    }
  }

  // 7. Add START/END if missing
  const avgY = nodes.length > 0
    ? nodes.reduce((sum, n) => sum + n.position.y, 0) / nodes.length
    : 250;
  const minX = nodes.length > 0 ? Math.min(...nodes.map((n) => n.position.x)) : 100;
  const maxX = nodes.length > 0 ? Math.max(...nodes.map((n) => n.position.x)) : 500;

  let startNodeId = "";
  let endNodeId = "";

  if (!hasStart) {
    startNodeId = `start-migrated-${Date.now()}`;
    nodes.unshift({
      id: startNodeId, type: "start",
      position: { x: minX - 200, y: avgY },
      data: { label: "START", componentType: "start", nodeType: "start" },
    } as Node);

    // Connect START to entry point (node with no incoming edges)
    const hasIncoming = new Set(edges.map((e) => e.target));
    const entryNodes = nodes.filter((n) => !hasIncoming.has(n.id) && n.type !== "start" && n.type !== "end");
    if (entryNodes.length > 0) {
      edges.push({
        id: `smart-${startNodeId}-${entryNodes[0].id}`,
        source: startNodeId, target: entryNodes[0].id,
        type: "smart", data: { edgeType: "flow" } as WorkflowEdgeData,
      } as Edge);
    }
    migrated = true;
  } else {
    startNodeId = nodes.find((n) => n.type === "start")!.id;
  }

  if (!hasEnd) {
    endNodeId = `end-migrated-${Date.now()}`;
    nodes.push({
      id: endNodeId, type: "end",
      position: { x: maxX + 200, y: avgY },
      data: { label: "END", componentType: "end", nodeType: "end" },
    } as Node);

    // Connect exit point to END (node with no outgoing edges)
    const hasOutgoing = new Set(edges.map((e) => e.source));
    const exitNodes = nodes.filter((n) => !hasOutgoing.has(n.id) && n.type !== "start" && n.type !== "end");
    if (exitNodes.length > 0) {
      edges.push({
        id: `smart-${exitNodes[0].id}-${endNodeId}`,
        source: exitNodes[0].id, target: endNodeId,
        type: "smart", data: { edgeType: "flow" } as WorkflowEdgeData,
      } as Edge);
    }
    migrated = true;
  } else {
    endNodeId = nodes.find((n) => n.type === "end")!.id;
  }

  // 8. Ensure all nodes have componentType set
  for (const node of nodes) {
    const d = node.data as Record<string, unknown>;
    if (!d.componentType) {
      d.componentType = node.type || "node";
      d.nodeType = node.type || "node";
      migrated = true;
    }
  }

  return { nodes, edges, migrated, startNodeId, endNodeId };
}
