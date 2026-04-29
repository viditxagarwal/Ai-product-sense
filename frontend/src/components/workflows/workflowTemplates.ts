import type { Node, Edge } from "@xyflow/react";
import type { LoopbackEdgeData } from "./LoopbackEdge";

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
  preview: string; // ASCII-style visual
  color: string;   // tailwind bg class
  graph: () => WorkflowTemplateGraph;
}

function ts() {
  return Date.now();
}

function stepNode(
  id: string,
  label: string,
  purpose: string,
  x: number,
  y: number,
  extra: Record<string, unknown> = {}
): Node {
  return {
    id,
    type: "step",
    position: { x, y },
    data: {
      label,
      nodeType: "step",
      purpose,
      boundTools: [],
      onMissingData: "flag",
      onToolFailure: "retry",
      onLowConfidence: "proceed",
      ...extra,
    },
  };
}

function decisionNode(
  id: string,
  label: string,
  purpose: string,
  x: number,
  y: number,
  extra: Record<string, unknown> = {}
): Node {
  return {
    id,
    type: "decision",
    position: { x, y },
    data: {
      label,
      nodeType: "decision",
      purpose,
      conditionType: "rule_based",
      conditionPrompt: "",
      pathMappings: "",
      boundTools: [],
      ...extra,
    },
  };
}

function parallelNode(
  id: string,
  label: string,
  purpose: string,
  x: number,
  y: number,
  extra: Record<string, unknown> = {}
): Node {
  return {
    id,
    type: "parallel",
    position: { x, y },
    data: {
      label,
      nodeType: "parallel",
      purpose,
      branchCount: 3,
      fanOutMethod: "by_subtask",
      mergeMethod: "synthesize",
      maxBranches: 5,
      ...extra,
    },
  };
}

function humanReviewNode(
  id: string,
  label: string,
  purpose: string,
  x: number,
  y: number,
  extra: Record<string, unknown> = {}
): Node {
  return {
    id,
    type: "human_review",
    position: { x, y },
    data: {
      label,
      nodeType: "human_review",
      purpose,
      displayContent: "",
      humanOptions: "approve, reject, edit",
      timeoutBehavior: "wait",
      timeoutMinutes: 0,
      ...extra,
    },
  };
}

function edge(
  source: string,
  target: string,
  suffix?: string
): Edge {
  return {
    id: `e-${source}-${target}-${suffix || ts()}`,
    source,
    target,
    type: "deletable",
    animated: true,
    style: { strokeWidth: 2 },
  };
}

function loopbackEdge(
  source: string,
  target: string,
  data: LoopbackEdgeData,
  suffix?: string
): Edge {
  return {
    id: `loopback-${source}-${target}-${suffix || ts()}`,
    source,
    target,
    type: "loopback",
    animated: false,
    data,
  };
}

// ─── Template Definitions ─────────────────────────────────

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "react_agent",
    label: "ReAct Agent",
    description:
      "The agent thinks, acts, observes, and repeats until done. The most common agentic pattern.",
    useCase: "General-purpose tool-using agent",
    preview: "Step ↔ Decision (loop)",
    color: "bg-blue-500",
    graph: () => {
      const s = String(ts());
      const agentId = `step_agent_${s}`;
      const decisionId = `decision_continue_${s}`;

      return {
        nodes: [
          stepNode(agentId, "Agent", "Reason about the task, decide which tool to use, observe results", 300, 100, {
            systemPromptHint:
              "This workflow uses the ReAct Agent pattern. The agent reasons, selects a tool, observes the result, and loops until it has a final answer. Bind your tools here.",
          }),
          decisionNode(decisionId, "Should Continue?", "Did the agent produce a final answer?", 300, 280, {
            conditionType: "llm_classification",
            conditionPrompt: "Does the agent output contain a final answer, or does it need more tool calls?",
            pathMappings: "final_answer → END\nneeds_more_work → Agent",
          }),
        ],
        edges: [
          edge(agentId, decisionId, s),
          loopbackEdge(decisionId, agentId, {
            label: "Needs more work",
            loopCondition: "max_iterations",
            maxIterations: 10,
            exitThreshold: 1.0,
            exitNodeId: "",
          }, s),
        ],
        entryPoint: agentId,
        exitPoint: decisionId,
      };
    },
  },
  {
    id: "simple_chain",
    label: "Simple Chain",
    description: "Sequential steps. Each step's output feeds into the next.",
    useCase: "Multi-step processing pipeline",
    preview: "Step → Step → Step",
    color: "bg-emerald-500",
    graph: () => {
      const s = String(ts());
      const step1 = `step_input_${s}`;
      const step2 = `step_process_${s}`;
      const step3 = `step_output_${s}`;

      return {
        nodes: [
          stepNode(step1, "Input", "Parse and prepare the input data", 300, 100, {
            systemPromptHint: "This workflow uses the Simple Chain pattern. Each step's output feeds into the next. Customize each step's tools and prompts.",
          }),
          stepNode(step2, "Process", "Apply the core transformation or analysis", 300, 260),
          stepNode(step3, "Output", "Format and return the final result", 300, 420),
        ],
        edges: [
          edge(step1, step2, s),
          edge(step2, step3, s),
        ],
        entryPoint: step1,
        exitPoint: step3,
      };
    },
  },
  {
    id: "parallel_analysis",
    label: "Parallel Analysis",
    description: "Split work into parallel branches, then merge results.",
    useCase: "Multi-perspective analysis, bulk processing",
    preview: "Step → Parallel → Step",
    color: "bg-purple-500",
    graph: () => {
      const s = String(ts());
      const inputId = `step_input_${s}`;
      const parallelId = `parallel_split_${s}`;
      const synthesizeId = `step_synthesize_${s}`;

      return {
        nodes: [
          stepNode(inputId, "Input", "Prepare the data for parallel processing", 300, 100, {
            systemPromptHint: "This workflow uses the Parallel Analysis pattern. Work is split into branches, processed in parallel, then merged. Customize the Parallel node's fan-out and merge settings.",
          }),
          parallelNode(parallelId, "Analyze", "Process each branch independently", 300, 260, {
            branchCount: 3,
            fanOutMethod: "by_perspective",
            mergeMethod: "synthesize",
          }),
          stepNode(synthesizeId, "Synthesize", "Merge branch outputs into a unified result", 300, 420),
        ],
        edges: [
          edge(inputId, parallelId, s),
          edge(parallelId, synthesizeId, s),
        ],
        entryPoint: inputId,
        exitPoint: synthesizeId,
      };
    },
  },
  {
    id: "chain_with_validation",
    label: "Chain with Validation",
    description: "Generate, validate, refine until quality threshold is met.",
    useCase: "Content generation, code review loops",
    preview: "Step → Step → Decision (loop)",
    color: "bg-teal-500",
    graph: () => {
      const s = String(ts());
      const generatorId = `step_generator_${s}`;
      const validatorId = `step_validator_${s}`;
      const decisionId = `decision_pass_${s}`;
      const outputId = `step_output_${s}`;

      return {
        nodes: [
          stepNode(generatorId, "Generator", "Produce the initial output (text, code, analysis, etc.)", 300, 100, {
            systemPromptHint: "This workflow uses the Chain with Validation pattern. The Generator produces output, the Validator checks it, and the Decision routes back for refinement or forward to the final output.",
          }),
          stepNode(validatorId, "Validator", "Check quality, correctness, and completeness of the generated output", 300, 260),
          decisionNode(decisionId, "Pass?", "Does the output meet the quality threshold?", 300, 420, {
            conditionType: "llm_classification",
            conditionPrompt: "Does the validator's assessment indicate the output passes all quality checks?",
            pathMappings: "pass → Output\nfail → Generator",
          }),
          stepNode(outputId, "Output", "Format and return the validated result", 300, 580),
        ],
        edges: [
          edge(generatorId, validatorId, s),
          edge(validatorId, decisionId, s),
          edge(decisionId, outputId, s),
          loopbackEdge(decisionId, generatorId, {
            label: "Needs refinement",
            loopCondition: "quality_threshold",
            maxIterations: 5,
            exitThreshold: 0.85,
            exitNodeId: outputId,
          }, s),
        ],
        entryPoint: generatorId,
        exitPoint: outputId,
      };
    },
  },
  {
    id: "human_in_the_loop",
    label: "Human-in-the-Loop",
    description: "AI does initial work, human reviews, AI finalizes.",
    useCase: "Approval workflows, sensitive decisions",
    preview: "Step → Human Review → Step",
    color: "bg-amber-500",
    graph: () => {
      const s = String(ts());
      const analysisId = `step_analysis_${s}`;
      const reviewId = `human_review_${s}`;
      const finalId = `step_final_${s}`;

      return {
        nodes: [
          stepNode(analysisId, "Analysis", "AI performs initial analysis and generates a draft", 300, 100, {
            systemPromptHint: "This workflow uses the Human-in-the-Loop pattern. AI drafts, human reviews and provides feedback, then AI finalizes. Configure what the human reviewer sees in the Human Review node.",
          }),
          humanReviewNode(reviewId, "Human Review", "Pause for human input, approval, or edits", 300, 280, {
            displayContent: "Show the AI's draft analysis, confidence scores, and sources used.",
            humanOptions: "approve, reject, edit, escalate",
          }),
          stepNode(finalId, "Finalize", "Incorporate human feedback and produce the final output", 300, 460),
        ],
        edges: [
          edge(analysisId, reviewId, s),
          edge(reviewId, finalId, s),
        ],
        entryPoint: analysisId,
        exitPoint: finalId,
      };
    },
  },
  {
    id: "classifier_router",
    label: "Classifier Router",
    description: "Route to different processing paths based on input type.",
    useCase: "Multi-domain intake, support ticket routing",
    preview: "Step → Decision → [A, B, C]",
    color: "bg-orange-500",
    graph: () => {
      const s = String(ts());
      const inputId = `step_input_${s}`;
      const routerId = `decision_router_${s}`;
      const pathA = `step_path_a_${s}`;
      const pathB = `step_path_b_${s}`;
      const pathC = `step_path_c_${s}`;
      const mergeId = `step_merge_${s}`;

      return {
        nodes: [
          stepNode(inputId, "Input", "Receive and preprocess the incoming request", 300, 80, {
            systemPromptHint: "This workflow uses the Classifier Router pattern. Input is classified, then routed to the appropriate specialized processing path. Customize the Decision node's classification prompt and the path mappings.",
          }),
          decisionNode(routerId, "Classify", "Determine the input type and route accordingly", 300, 240, {
            conditionType: "llm_classification",
            conditionPrompt: "Classify this input into one of: type_a, type_b, type_c",
            pathMappings: "type_a → Path A\ntype_b → Path B\ntype_c → Path C",
          }),
          stepNode(pathA, "Path A", "Process type A inputs", 80, 420),
          stepNode(pathB, "Path B", "Process type B inputs", 300, 420),
          stepNode(pathC, "Path C", "Process type C inputs", 520, 420),
          stepNode(mergeId, "Merge", "Combine outputs from all paths into a unified response", 300, 600),
        ],
        edges: [
          edge(inputId, routerId, s),
          edge(routerId, pathA, `${s}a`),
          edge(routerId, pathB, `${s}b`),
          edge(routerId, pathC, `${s}c`),
          edge(pathA, mergeId, `${s}ma`),
          edge(pathB, mergeId, `${s}mb`),
          edge(pathC, mergeId, `${s}mc`),
        ],
        entryPoint: inputId,
        exitPoint: mergeId,
      };
    },
  },
  {
    id: "blank",
    label: "Blank Canvas",
    description: "Start from scratch with a single empty Step node.",
    useCase: "Power users, custom patterns",
    preview: "Step",
    color: "bg-slate-400",
    graph: () => {
      const s = String(ts());
      const stepId = `step_start_${s}`;

      return {
        nodes: [
          stepNode(stepId, "Start", "Your first processing step", 300, 200),
        ],
        edges: [],
        entryPoint: stepId,
        exitPoint: stepId,
      };
    },
  },
];
