import type { LucideIcon } from "lucide-react";
import {
  Box,
  GitBranch,
  Layers,
  Repeat,
  ListOrdered,
  UserCheck,
  Tag,
  Search,
  CheckCircle,
} from "lucide-react";

export interface NodeTypeConfig {
  type: string;
  label: string;
  icon: LucideIcon;
  color: string;       // tailwind bg class for the node header
  borderColor: string;  // tailwind border class
  textColor: string;    // tailwind text class
}

export const NODE_TYPE_CONFIGS: NodeTypeConfig[] = [
  {
    type: "agent_node",
    label: "Node",
    icon: Box,
    color: "bg-blue-500",
    borderColor: "border-blue-300",
    textColor: "text-blue-700",
  },
  {
    type: "route",
    label: "Route",
    icon: GitBranch,
    color: "bg-orange-500",
    borderColor: "border-orange-300",
    textColor: "text-orange-700",
  },
  {
    type: "parallelization",
    label: "Parallelization",
    icon: Layers,
    color: "bg-purple-500",
    borderColor: "border-purple-300",
    textColor: "text-purple-700",
  },
  {
    type: "loop",
    label: "Loop",
    icon: Repeat,
    color: "bg-teal-500",
    borderColor: "border-teal-300",
    textColor: "text-teal-700",
  },
  {
    type: "plan_and_execute",
    label: "Plan-and-Execute",
    icon: ListOrdered,
    color: "bg-indigo-500",
    borderColor: "border-indigo-300",
    textColor: "text-indigo-700",
  },
  {
    type: "human_checkpoint",
    label: "Human Checkpoint",
    icon: UserCheck,
    color: "bg-amber-500",
    borderColor: "border-amber-300",
    textColor: "text-amber-700",
  },
  {
    type: "classifier",
    label: "Classifier",
    icon: Tag,
    color: "bg-pink-500",
    borderColor: "border-pink-300",
    textColor: "text-pink-700",
  },
  {
    type: "retriever",
    label: "Retriever",
    icon: Search,
    color: "bg-green-500",
    borderColor: "border-green-300",
    textColor: "text-green-700",
  },
  {
    type: "validator",
    label: "Validator",
    icon: CheckCircle,
    color: "bg-red-500",
    borderColor: "border-red-300",
    textColor: "text-red-700",
  },
];

export const NODE_TYPE_MAP: Record<string, NodeTypeConfig> = {};
for (const cfg of NODE_TYPE_CONFIGS) {
  NODE_TYPE_MAP[cfg.type] = cfg;
}
