import type { LucideIcon } from "lucide-react";
import {
  Box,
  GitBranch,
  Layers,
  UserCheck,
} from "lucide-react";

export interface NodeTypeConfig {
  type: string;
  label: string;
  description: string;  // one-line description shown in toolbar
  icon: LucideIcon;
  color: string;       // tailwind bg class for the node header
  borderColor: string;  // tailwind border class
  textColor: string;    // tailwind text class
  tooltip: string;
}

export const NODE_TYPE_CONFIGS: NodeTypeConfig[] = [
  {
    type: "step",
    label: "Step",
    description: "A processing unit that does work",
    icon: Box,
    color: "bg-blue-500",
    borderColor: "border-blue-300",
    textColor: "text-blue-700",
    tooltip: "A single processing node. Bind tools, set system prompts, configure model overrides.",
  },
  {
    type: "decision",
    label: "Decision",
    description: "Routes output to different paths",
    icon: GitBranch,
    color: "bg-orange-500",
    borderColor: "border-orange-300",
    textColor: "text-orange-700",
    tooltip: "Routes output to different paths based on a condition. Can be rule-based or LLM-classified.",
  },
  {
    type: "parallel",
    label: "Parallel",
    description: "Splits into N branches, merges back",
    icon: Layers,
    color: "bg-purple-500",
    borderColor: "border-purple-300",
    textColor: "text-purple-700",
    tooltip: "Splits work into parallel branches, then merges results. Configure branch count and merge strategy.",
  },
  {
    type: "human_review",
    label: "Human Review",
    description: "Pauses for human input or approval",
    icon: UserCheck,
    color: "bg-amber-500",
    borderColor: "border-amber-300",
    textColor: "text-amber-700",
    tooltip: "Pauses execution for human input or approval. Configure what's shown and timeout behavior.",
  },
];

export const NODE_TYPE_MAP: Record<string, NodeTypeConfig> = {};
for (const cfg of NODE_TYPE_CONFIGS) {
  NODE_TYPE_MAP[cfg.type] = cfg;
}

// Legacy type aliases for migration — map old types to new ones
const LEGACY_MAP: Record<string, string> = {
  agent_node: "step",
  route: "decision",
  parallelization: "parallel",
  human_checkpoint: "human_review",
  classifier: "decision",
  loop: "step",
  plan_and_execute: "step",
  validator: "step",
  retriever: "step",
};

/** Resolve a node type, mapping legacy types to new ones */
export function resolveNodeType(type: string): string {
  return LEGACY_MAP[type] || type;
}
