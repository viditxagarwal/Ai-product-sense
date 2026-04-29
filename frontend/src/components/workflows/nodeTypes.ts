import type { LucideIcon } from "lucide-react";
import {
  Box,
  ShieldCheck,
  GitFork,
  Circle,
} from "lucide-react";
import type { WorkflowComponentType } from "@/types";

export interface NodeTypeConfig {
  type: WorkflowComponentType;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;       // tailwind bg class for the node header/accent
  borderColor: string;
  textColor: string;
  tooltip: string;
}

export const NODE_TYPE_CONFIGS: NodeTypeConfig[] = [
  {
    type: "node",
    label: "Node",
    description: "Processing step — toggle LLM on/off",
    icon: Box,
    color: "bg-blue-500",
    borderColor: "border-blue-300",
    textColor: "text-blue-700",
    tooltip: "Universal processing node. Toggle LLM on for AI-powered steps, off for direct tool execution.",
  },
  {
    type: "gate",
    label: "Gate",
    description: "Human review checkpoint",
    icon: ShieldCheck,
    color: "bg-amber-500",
    borderColor: "border-amber-300",
    textColor: "text-amber-700",
    tooltip: "Pauses execution for human review and approval. Configure what the reviewer sees and timeout behavior.",
  },
  {
    type: "split",
    label: "Split",
    description: "Parallel branches",
    icon: GitFork,
    color: "bg-purple-500",
    borderColor: "border-purple-300",
    textColor: "text-purple-700",
    tooltip: "Fan out into parallel branches, then merge results. Configure branch count and merge strategy.",
  },
];

// Config for START/END (not in toolbar but used for rendering)
export const START_END_CONFIG: NodeTypeConfig = {
  type: "start",
  label: "Start/End",
  description: "Entry/exit point",
  icon: Circle,
  color: "bg-gray-500",
  borderColor: "border-gray-300",
  textColor: "text-gray-600",
  tooltip: "Auto-created entry/exit point. Cannot be deleted.",
};

export const NODE_TYPE_MAP: Record<string, NodeTypeConfig> = {};
for (const cfg of NODE_TYPE_CONFIGS) {
  NODE_TYPE_MAP[cfg.type] = cfg;
}
NODE_TYPE_MAP["start"] = START_END_CONFIG;
NODE_TYPE_MAP["end"] = { ...START_END_CONFIG, type: "end" as WorkflowComponentType, label: "End" };

// Legacy type aliases — map old types to new component types
const LEGACY_MAP: Record<string, WorkflowComponentType> = {
  step: "node",
  agent_node: "node",
  route: "node",
  decision: "node",
  classifier: "node",
  loop: "node",
  plan_and_execute: "node",
  validator: "node",
  retriever: "node",
  parallelization: "split",
  parallel: "split",
  human_review: "gate",
  human_checkpoint: "gate",
};

// Populate NODE_TYPE_MAP with legacy aliases
for (const [oldType, newType] of Object.entries(LEGACY_MAP)) {
  if (!NODE_TYPE_MAP[oldType]) {
    NODE_TYPE_MAP[oldType] = NODE_TYPE_MAP[newType];
  }
}

/** Resolve a node type to a WorkflowComponentType, mapping legacy types */
export function resolveComponentType(type: string): WorkflowComponentType {
  if (["node", "gate", "split", "start", "end"].includes(type)) {
    return type as WorkflowComponentType;
  }
  return LEGACY_MAP[type] || "node";
}

/** @deprecated Use resolveComponentType instead */
export function resolveNodeType(type: string): string {
  return resolveComponentType(type);
}
