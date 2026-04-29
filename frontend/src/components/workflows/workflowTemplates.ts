import type { Node, Edge } from "@xyflow/react";
import type { WorkflowNodeData, WorkflowEdgeData } from "@/types";

export interface WorkflowTemplateGraph {
  nodes: Node[];
  edges: Edge[];
  entryPoint: string;
  exitPoint: string;
}

export interface WorkflowTemplate {
  id: string;
  label: string;
  description: string;
  useCase: string;
  preview: string;
  color: string;
  graph: () => WorkflowTemplateGraph;
}

// ─── Node factory helpers ─────────────────────────────────

function startNode(id: string, x: number, y: number): Node {
  return { id, type: "start", position: { x, y }, data: { label: "START", componentType: "start", nodeType: "start" } };
}

function endNode(id: string, x: number, y: number): Node {
  return { id, type: "end", position: { x, y }, data: { label: "END", componentType: "end", nodeType: "end" } };
}

function nodeFactory(
  id: string, label: string, x: number, y: number,
  extra: Partial<WorkflowNodeData> = {}
): Node {
  return {
    id, type: "node", position: { x, y },
    data: { label, componentType: "node", nodeType: "node", llmEnabled: true, boundTools: [], ...extra },
  };
}

function toolNode(
  id: string, label: string, x: number, y: number,
  extra: Partial<WorkflowNodeData> = {}
): Node {
  return {
    id, type: "node", position: { x, y },
    data: { label, componentType: "node", nodeType: "node", llmEnabled: false, ...extra },
  };
}

function gateFactory(
  id: string, label: string, x: number, y: number,
  extra: Partial<WorkflowNodeData> = {}
): Node {
  return {
    id, type: "gate", position: { x, y },
    data: {
      label, componentType: "gate", nodeType: "gate",
      availableActions: { approve: true, rejectWithReason: true, editAndApprove: true, sendBackForRevision: false, addCommentAndContinue: false },
      waitDuration: "24h", onTimeout: "auto_approve", ...extra,
    },
  };
}

function splitFactory(
  id: string, label: string, x: number, y: number,
  extra: Partial<WorkflowNodeData> = {}
): Node {
  return {
    id, type: "split", position: { x, y },
    data: {
      label, componentType: "split", nodeType: "split",
      branchCount: 3, fanOutMethod: "same_input", mergeMethod: "summarize",
      waitStrategy: "wait_all", branchTimeout: 60, ...extra,
    },
  };
}

// ─── Edge factory helpers ─────────────────────────────────

function flowEdge(source: string, target: string, suffix?: string): Edge {
  return {
    id: `edge-${source}-${target}${suffix ? `-${suffix}` : ""}`,
    source, target, type: "smart", animated: true,
    data: { edgeType: "flow" } as WorkflowEdgeData,
  };
}

function conditionalEdge(source: string, target: string, label: string, extra: Partial<WorkflowEdgeData> = {}): Edge {
  return {
    id: `edge-${source}-${target}-cond`,
    source, target, type: "smart", animated: false,
    data: { edgeType: "conditional", label, conditionMethod: "llm_evaluation", confidenceThreshold: 0.7, ...extra } as WorkflowEdgeData,
  };
}

function loopEdge(source: string, target: string, maxIterations = 3): Edge {
  return {
    id: `edge-${source}-${target}-loop`,
    source, target, type: "smart", animated: false,
    data: { edgeType: "loop", maxIterations, exitThreshold: 0.85, onMaxReached: "use_best" } as WorkflowEdgeData,
  };
}

// ─── Template Definitions ─────────────────────────────────

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "react_agent",
    label: "ReAct Agent",
    description: "The agent thinks, acts, observes, and repeats until done.",
    useCase: "General-purpose tool-using agent",
    preview: "START → Agent ↻ → END",
    color: "bg-blue-500",
    graph: () => {
      const s = startNode("tpl-react-start", 50, 250);
      const agent = nodeFactory("tpl-react-agent", "ReAct Agent", 250, 250, {
        systemPrompt: "You are a helpful assistant. Reason step by step, use tools when needed, provide a complete answer.",
      });
      const e = endNode("tpl-react-end", 550, 250);
      return {
        nodes: [s, agent, e],
        edges: [
          flowEdge(s.id, agent.id),
          conditionalEdge(agent.id, e.id, "answer complete"),
          loopEdge(agent.id, agent.id, 5),
        ],
        entryPoint: s.id,
        exitPoint: e.id,
      };
    },
  },
  {
    id: "simple_chain",
    label: "Simple Chain",
    description: "Sequential processing pipeline.",
    useCase: "Multi-step processing",
    preview: "START → A → B → C → END",
    color: "bg-emerald-500",
    graph: () => {
      const s = startNode("tpl-chain-start", 50, 250);
      const a = nodeFactory("tpl-chain-analyzer", "Analyzer", 230, 250, { systemPrompt: "Analyze the input thoroughly." });
      const b = nodeFactory("tpl-chain-synth", "Synthesizer", 470, 250, { systemPrompt: "Synthesize the analysis into key findings." });
      const c = nodeFactory("tpl-chain-fmt", "Formatter", 710, 250, { systemPrompt: "Format the output clearly." });
      const e = endNode("tpl-chain-end", 930, 250);
      return {
        nodes: [s, a, b, c, e],
        edges: [flowEdge(s.id, a.id), flowEdge(a.id, b.id), flowEdge(b.id, c.id), flowEdge(c.id, e.id)],
        entryPoint: s.id, exitPoint: e.id,
      };
    },
  },
  {
    id: "rag_pipeline",
    label: "RAG Pipeline",
    description: "Retrieve context then generate answer.",
    useCase: "Knowledge-grounded Q&A",
    preview: "START → Retrieve → Generate → END",
    color: "bg-emerald-500",
    graph: () => {
      const s = startNode("tpl-rag-start", 50, 250);
      const ret = toolNode("tpl-rag-retrieve", "Retrieve Context", 230, 250);
      const gen = nodeFactory("tpl-rag-generate", "Generate Answer", 470, 250, {
        systemPrompt: "Using the retrieved context, answer the user's question accurately. Cite your sources.",
      });
      const e = endNode("tpl-rag-end", 700, 250);
      return {
        nodes: [s, ret, gen, e],
        edges: [flowEdge(s.id, ret.id), flowEdge(ret.id, gen.id), flowEdge(gen.id, e.id)],
        entryPoint: s.id, exitPoint: e.id,
      };
    },
  },
  {
    id: "human_in_the_loop",
    label: "Human-in-the-Loop",
    description: "AI drafts, human reviews, AI finalizes.",
    useCase: "Approval workflows, sensitive decisions",
    preview: "START → Draft → Review ↻ → Finalize → END",
    color: "bg-amber-500",
    graph: () => {
      const s = startNode("tpl-hitl-start", 50, 250);
      const draft = nodeFactory("tpl-hitl-draft", "Draft Response", 230, 250, { systemPrompt: "Draft a thorough response." });
      const review = gateFactory("tpl-hitl-review", "Manager Review", 450, 250, { waitDuration: "24h", onTimeout: "auto_approve" });
      const fin = nodeFactory("tpl-hitl-finalize", "Finalize Response", 670, 250, { systemPrompt: "Incorporate feedback and finalize." });
      const e = endNode("tpl-hitl-end", 890, 250);
      return {
        nodes: [s, draft, review, fin, e],
        edges: [
          flowEdge(s.id, draft.id),
          flowEdge(draft.id, review.id),
          conditionalEdge(review.id, fin.id, "approved"),
          loopEdge(review.id, draft.id, 3),
          flowEdge(fin.id, e.id),
        ],
        entryPoint: s.id, exitPoint: e.id,
      };
    },
  },
  {
    id: "parallel_analysis",
    label: "Parallel Analysis",
    description: "Analyze from multiple perspectives then synthesize.",
    useCase: "Multi-perspective analysis",
    preview: "START → Split → [A,B,C] → Synthesize → END",
    color: "bg-purple-500",
    graph: () => {
      const s = startNode("tpl-par-start", 50, 250);
      const sp = splitFactory("tpl-par-split", "Fan Out", 230, 250, {
        branchCount: 3, fanOutMethod: "custom_per_branch", mergeMethod: "summarize",
        branchPrompts: ["Analyze from financial perspective", "Analyze from legal perspective", "Analyze from operational perspective"],
      });
      const fin = nodeFactory("tpl-par-finance", "Finance Analyst", 450, 100, { systemPrompt: "Analyze from a financial perspective." });
      const leg = nodeFactory("tpl-par-legal", "Legal Analyst", 450, 250, { systemPrompt: "Analyze from a legal perspective." });
      const ops = nodeFactory("tpl-par-ops", "Operations Analyst", 450, 400, { systemPrompt: "Analyze from an operational perspective." });
      const synth = nodeFactory("tpl-par-synth", "Synthesize", 670, 250, { systemPrompt: "Combine the analyses into a unified report." });
      const e = endNode("tpl-par-end", 890, 250);
      return {
        nodes: [s, sp, fin, leg, ops, synth, e],
        edges: [
          flowEdge(s.id, sp.id),
          flowEdge(sp.id, fin.id, "a"), flowEdge(sp.id, leg.id, "b"), flowEdge(sp.id, ops.id, "c"),
          flowEdge(fin.id, synth.id, "a"), flowEdge(leg.id, synth.id, "b"), flowEdge(ops.id, synth.id, "c"),
          flowEdge(synth.id, e.id),
        ],
        entryPoint: s.id, exitPoint: e.id,
      };
    },
  },
  {
    id: "classifier_router",
    label: "Classifier Router",
    description: "Route to specialist based on input classification.",
    useCase: "Multi-domain intake, support routing",
    preview: "START → Classify → [A,B,C] → Format → END",
    color: "bg-orange-500",
    graph: () => {
      const s = startNode("tpl-cls-start", 50, 250);
      const cls = nodeFactory("tpl-cls-classify", "Classify Intent", 230, 250, { systemPrompt: "Determine the category of the user's question." });
      const fa = nodeFactory("tpl-cls-finance", "Finance Agent", 480, 100, { systemPrompt: "Answer financial questions." });
      const la = nodeFactory("tpl-cls-legal", "Legal Agent", 480, 250, { systemPrompt: "Answer legal questions." });
      const ga = nodeFactory("tpl-cls-general", "General Agent", 480, 400, { systemPrompt: "Answer general questions." });
      const fmt = nodeFactory("tpl-cls-format", "Format", 700, 250, { systemPrompt: "Format the response." });
      const e = endNode("tpl-cls-end", 920, 250);
      return {
        nodes: [s, cls, fa, la, ga, fmt, e],
        edges: [
          flowEdge(s.id, cls.id),
          conditionalEdge(cls.id, fa.id, "financial question"),
          conditionalEdge(cls.id, la.id, "legal question"),
          { ...conditionalEdge(cls.id, ga.id, "default"), data: { edgeType: "conditional", conditionMethod: "always", label: "default" } as WorkflowEdgeData },
          flowEdge(fa.id, fmt.id, "a"), flowEdge(la.id, fmt.id, "b"), flowEdge(ga.id, fmt.id, "c"),
          flowEdge(fmt.id, e.id),
        ],
        entryPoint: s.id, exitPoint: e.id,
      };
    },
  },
  {
    id: "plan_and_execute",
    label: "Plan and Execute",
    description: "Create a plan then execute steps iteratively.",
    useCase: "Complex multi-step tasks",
    preview: "START → Planner ↔ Executor → END",
    color: "bg-teal-500",
    graph: () => {
      const s = startNode("tpl-pe-start", 50, 250);
      const planner = nodeFactory("tpl-pe-planner", "Planner", 230, 250, { systemPrompt: "Break the task into numbered steps. Output the next step to execute." });
      const executor = nodeFactory("tpl-pe-executor", "Executor", 470, 250, { systemPrompt: "Execute the current step from the plan." });
      const e = endNode("tpl-pe-end", 710, 250);
      return {
        nodes: [s, planner, executor, e],
        edges: [
          flowEdge(s.id, planner.id),
          flowEdge(planner.id, executor.id),
          conditionalEdge(executor.id, e.id, "plan complete"),
          loopEdge(executor.id, planner.id, 10),
        ],
        entryPoint: s.id, exitPoint: e.id,
      };
    },
  },
  {
    id: "validator_loop",
    label: "Validator Loop",
    description: "Generate then validate, retry if needed.",
    useCase: "Content generation, code review loops",
    preview: "START → Generate ↔ Validate → END",
    color: "bg-teal-500",
    graph: () => {
      const s = startNode("tpl-val-start", 50, 250);
      const gen = nodeFactory("tpl-val-gen", "Generator", 230, 250, { systemPrompt: "Generate the requested output." });
      const val = toolNode("tpl-val-validator", "Validator", 470, 250);
      const e = endNode("tpl-val-end", 710, 250);
      return {
        nodes: [s, gen, val, e],
        edges: [
          flowEdge(s.id, gen.id),
          flowEdge(gen.id, val.id),
          conditionalEdge(val.id, e.id, "passed"),
          loopEdge(val.id, gen.id, 3),
        ],
        entryPoint: s.id, exitPoint: e.id,
      };
    },
  },
  {
    id: "orchestrator",
    label: "Orchestrator",
    description: "Central coordinator dispatches to specialists.",
    useCase: "Complex tasks requiring multiple skills",
    preview: "START → Orch ↔ [Specialists] → END",
    color: "bg-indigo-500",
    graph: () => {
      const s = startNode("tpl-orch-start", 50, 250);
      const orch = nodeFactory("tpl-orch-main", "Orchestrator", 230, 250, {
        systemPrompt: "Coordinate the task. Decide which specialist to dispatch to next, or if the task is complete.",
      });
      const researcher = nodeFactory("tpl-orch-research", "Researcher", 480, 100, { systemPrompt: "Research the topic thoroughly." });
      const writer = nodeFactory("tpl-orch-writer", "Writer", 480, 250, { systemPrompt: "Write the content." });
      const coder = nodeFactory("tpl-orch-coder", "Coder", 480, 400, { systemPrompt: "Write or review code." });
      const e = endNode("tpl-orch-end", 730, 250);
      return {
        nodes: [s, orch, researcher, writer, coder, e],
        edges: [
          flowEdge(s.id, orch.id),
          conditionalEdge(orch.id, researcher.id, "needs research"),
          conditionalEdge(orch.id, writer.id, "needs writing"),
          conditionalEdge(orch.id, coder.id, "needs code"),
          conditionalEdge(orch.id, e.id, "all done"),
          loopEdge(researcher.id, orch.id), loopEdge(writer.id, orch.id), loopEdge(coder.id, orch.id),
        ],
        entryPoint: s.id, exitPoint: e.id,
      };
    },
  },
  {
    id: "tool_pipeline",
    label: "Tool Pipeline (No LLM)",
    description: "Pure tool chain, zero AI.",
    useCase: "Data pipelines, ETL, automation",
    preview: "START → Fetch → Transform → Write → END",
    color: "bg-slate-500",
    graph: () => {
      const s = startNode("tpl-pipe-start", 50, 250);
      const fetch = toolNode("tpl-pipe-fetch", "Fetch Data", 220, 250);
      const transform = toolNode("tpl-pipe-transform", "Transform", 420, 250);
      const write = toolNode("tpl-pipe-write", "Write Output", 620, 250);
      const e = endNode("tpl-pipe-end", 810, 250);
      return {
        nodes: [s, fetch, transform, write, e],
        edges: [flowEdge(s.id, fetch.id), flowEdge(fetch.id, transform.id), flowEdge(transform.id, write.id), flowEdge(write.id, e.id)],
        entryPoint: s.id, exitPoint: e.id,
      };
    },
  },
];
