# Workflow Canvas Revamp — Claude Code Prompts

Run these prompts in order. Each one builds on the previous. The existing app has a working workflow canvas with React Flow, a toolbar, and a basic Node Inspector. These prompts revamp that into the hybrid component model.

**Critical**: This is NOT a frontend-only change. The backend executor, simulator, and workspace UI all consume node type strings from graph_data. Prompts 9a–12 handle these dependencies. Do not skip them or execution will break.

**v3 changes** (from second analysis pass — 15 issues addressed):
- P1: Graph manipulation helpers stay canvas-local (not Zustand) to avoid dual-state desync. nodeType→componentType transition plan added. Auto-save location clarified.
- P6: File stays as `workflowTemplates.ts` (no rename). All template nodes now require `data.componentType`. ReActOnboarding.tsx updated here instead of deferred.
- P7: Existing `useHistory()` undo/redo wired to shortcuts — not reimplemented.
- P8: `entry_point`/`exit_point` DB field handling added.
- P9: Split into 9a (type dispatch, low risk) and 9b (edge routing + traversal, high risk). `systemPromptHint` fallback added. Split fan-out special case added. `_evaluate_with_llm` implementation guidance added.
- P10: Simulator functions corrected to sync with `**kwargs` (matching actual codebase pattern).
- P12: Noted as zero-dependency — recommended to run first.
- P13: ConfigGate.tsx node count fix added. Undo/redo references corrected.

---

## Prompt 1: Update TypeScript Types and Zustand Store

```
Read CLAUDE.md for context. I'm revamping the workflow canvas to use a new component model. Update the TypeScript types in frontend/src/types/index.ts and the Zustand workflow store.

### New Component Model

There are 3 draggable component types (plus START and END which are auto-created):

1. **Node** (universal) — Has an LLM toggle. When LLM is ON (blue #3b82f6), it calls an LLM with prompt + optional tools. When LLM is OFF (green #22c55e), it runs a tool directly without LLM. This one type replaces both "Agent" and "Action" concepts.

2. **Gate** (amber #f59e0b) — Pauses for human review/approval.

3. **Split** (purple #8b5cf6) — Fan-out into parallel branches, merge results.

4. **START** (gray #6b7280) — Entry point. Always present. Cannot be deleted. Auto-created with every new workflow.

5. **END** (gray #6b7280) — Exit point. Always present. Cannot be deleted. Auto-created with every new workflow.

### Edge Types

3 edge types (stored in graph_data):
- **flow** — Always follows this path. Solid gray line.
- **conditional** — Follows if condition met. Solid amber line with label.
- **loop** — Backward edge with iteration control. Dashed cyan line with ↻ icon.

### TypeScript Types to Create/Update

```typescript
// Component types on canvas
type WorkflowComponentType = 'node' | 'gate' | 'split' | 'start' | 'end';

// Edge types
type WorkflowEdgeType = 'flow' | 'conditional' | 'loop';

// Condition evaluation methods
type ConditionMethod = 'rule_based' | 'llm_evaluation' | 'score_comparison' | 'regex_match' | 'always';

// The universal Node's data
interface WorkflowNodeData {
  label: string;
  componentType: WorkflowComponentType;

  // === Node-specific (componentType === 'node') ===
  llmEnabled?: boolean;                // LLM toggle — true = blue, false = green
  systemPrompt?: string;               // Only when llmEnabled
  promptVersionId?: string;            // Optional link to Prompt Lab
  modelOverride?: string;              // Override config default model
  temperature?: number;
  maxOutputTokens?: number;
  boundTools?: string[];               // Array of tool IDs from Tool Registry
  inputContext?: 'user_message' | 'previous_step' | 'full_history' | 'custom';
  customContextTemplate?: string;
  // When llmEnabled is false (tool-only node):
  selectedToolId?: string;             // Single tool to execute
  toolConfig?: Record<string, any>;    // Tool-specific configuration
  inputMapping?: string;               // Where to get tool input from

  // === Gate-specific (componentType === 'gate') ===
  reviewDisplay?: string[];            // What to show reviewer
  reviewInstructions?: string;
  displayFormat?: 'full_text' | 'summary_detail' | 'side_by_side';
  availableActions?: {
    approve: boolean;
    rejectWithReason: boolean;
    editAndApprove: boolean;
    sendBackForRevision: boolean;
    addCommentAndContinue: boolean;
  };
  onReject?: 'stop' | 'route_to_fallback' | 'retry_previous';
  waitDuration?: string;
  onTimeout?: 'auto_approve' | 'auto_reject' | 'escalate' | 'stop';
  escalateTo?: string;
  notifyVia?: string[];
  notificationTemplate?: string;

  // === Split-specific (componentType === 'split') ===
  branchCount?: number;
  fanOutMethod?: 'same_input' | 'split_input' | 'custom_per_branch';
  branchPrompts?: string[];            // One per branch if custom_per_branch
  mergeMethod?: 'concatenate' | 'summarize' | 'best_of_n' | 'vote' | 'custom';
  mergePrompt?: string;
  mergeModel?: string;
  waitStrategy?: 'wait_all' | 'first_n' | 'timeout_best';
  branchTimeout?: number;
  maxConcurrent?: number;
  onBranchFailure?: 'continue' | 'retry' | 'stop_all';

  // === Error handling (all node types) ===
  timeoutSeconds?: number;
  onFailure?: 'retry_once' | 'skip_warning' | 'stop' | 'fallback';
  fallbackValue?: string;
}

// Edge data stored in graph_data
interface WorkflowEdgeData {
  edgeType: WorkflowEdgeType;
  label?: string;

  // === Conditional edge ===
  conditionMethod?: ConditionMethod;
  // Rule-based:
  ruleField?: string;
  ruleOperator?: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'is_empty' | 'is_not_empty';
  ruleValue?: string;
  // LLM evaluation:
  conditionPrompt?: string;
  evaluatorModel?: string;
  confidenceThreshold?: number;
  // Score comparison:
  scoreField?: string;
  scoreOperator?: '>' | '>=' | '<' | '<=' | '==';
  scoreThreshold?: number;
  // Regex:
  regexPattern?: string;
  regexMatchField?: 'full_output' | 'specific_field';

  // === Loop edge ===
  maxIterations?: number;
  exitThreshold?: number;
  onMaxReached?: 'use_best' | 'use_last' | 'stop_error' | 'route_fallback';
}
```

### Zustand Store Updates

Update `frontend/src/stores/workflow-store.ts`:

1. Replace whatever node type system exists with the new `WorkflowComponentType`.
2. When a new workflow is created, auto-generate a START node (position: {x: 100, y: 300}) and an END node (position: {x: 800, y: 300}) in the graph_data. These cannot be deleted.
3. **IMPORTANT — DO NOT add graph manipulation helpers (addNode, deleteNode, addEdge, etc.) to the Zustand store.** The current architecture uses React Flow's local `useNodesState`/`useEdgesState` inside `WorkflowCanvas.tsx` for all graph manipulation. The Zustand `workflow-store.ts` is purely REST CRUD (fetch/create/update/delete workflows via API). Adding graph helpers to Zustand creates dual-state (React Flow state vs Zustand state) which WILL desync. Instead:
   - Keep graph manipulation as canvas-local functions or a custom hook (e.g., `useCanvasActions.ts`)
   - The Zustand store should only hold: workflow metadata, the `selectedElement` tracker, and REST operations
   - The canvas `onNodesChange`/`onEdgesChange` callbacks feed into the existing `scheduleSave`/`performSave` debounce that persists to backend
4. **Auto-save location**: The existing auto-save logic lives in `WorkflowCanvas.tsx` (the `scheduleSave`/`performSave` debounce, approximately lines 338-386), NOT in the Zustand store. Do NOT move it. The canvas collects current nodes/edges from React Flow state and calls the store's `updateWorkflow()` REST action to persist. Keep this pattern.
5. Add ONLY these to the Zustand store:
   - `selectedElement: { type: 'node' | 'edge', id: string } | null` — tracks what's selected for the Inspector
   - `setSelectedElement(el)` — setter
   - Any new REST-level fields if needed

### nodeType → componentType Transition (CRITICAL)

The current `WorkflowNodeData` interface has a `nodeType: string` field. The new model introduces `componentType: WorkflowComponentType`. Here is the precise migration plan:

1. **Keep `nodeType` as a deprecated alias.** Do NOT delete it from the interface yet — too much code reads `data.nodeType`. Add `componentType` alongside it:
   ```typescript
   interface WorkflowNodeData {
     label: string;
     componentType: WorkflowComponentType;
     /** @deprecated Use componentType instead. Kept for backward compat. */
     nodeType?: string;
     // ... rest of fields
   }
   ```
2. **Invariant: `node.type` (React Flow) and `node.data.componentType` must ALWAYS be identical.** If they diverge, the canvas renders one thing but the backend executes another. Enforce this:
   - When creating a node, set both: `{ type: 'node', data: { componentType: 'node', ... } }`
   - When migrating (Prompt 8), set both fields
   - Add a helper `createNode(componentType, data)` that enforces this invariant
3. **Update `resolveNodeType()` and `NODE_TYPE_MAP`** (if they exist in the codebase) to read `data.componentType` first, falling back to `data.nodeType` for old data:
   ```typescript
   function resolveComponentType(node: Node): WorkflowComponentType {
     return node.data?.componentType || mapOldType(node.data?.nodeType || node.type);
   }
   ```
4. Any canvas functions that currently read `data.nodeType` should be updated to read `data.componentType` with a fallback to `data.nodeType`.

Remove any references to old node types like 'step', 'decision', 'route', 'loop', 'plan_execute', 'classifier', 'retriever', 'validator', 'human_review', 'human_checkpoint', 'parallel', 'parallelization' from NEW code paths. Old aliases remain only in backward-compat maps.
```

---

## Prompt 2: Build the New Toolbar

```
Read CLAUDE.md for context. Revamp the workflow canvas toolbar (left panel).

Replace the current toolbar (which has too many node types) with this clean toolbar:

### Toolbar Layout

The toolbar is a narrow left panel (~64px wide, expanding to ~200px on hover or as a fixed narrow sidebar) with these items:

**Components Section (header: "Components")**

1. **Node** — icon: Box (lucide-react). Tooltip: "Processing step — toggle LLM on/off". Drag color preview: blue.
2. **Gate** — icon: ShieldCheck (lucide-react). Tooltip: "Human review checkpoint". Drag color preview: amber.
3. **Split** — icon: GitFork (lucide-react). Tooltip: "Parallel branches". Drag color preview: purple.

That's it — only 3 draggable items. START and END are auto-created and not in the toolbar.

**Templates Section (header: "Templates", below components)**

A dropdown or expandable list of pre-built workflow templates:
- ReAct Agent
- Simple Chain
- RAG Pipeline
- Human-in-the-Loop
- Parallel Analysis
- Classifier Router
- Plan and Execute
- Validator Loop
- Orchestrator
- Tool Pipeline (No LLM)

When a template is selected, it replaces the current canvas content (with a confirmation dialog if canvas is not empty: "Replace current workflow with template?"). Templates always include START and END nodes.

**Implementation:**

1. Update or replace `frontend/src/components/workflows/NodeToolbar.tsx`
2. Each toolbar item uses React Flow's drag-and-drop: `onDragStart` sets the component type in the drag data transfer.
3. The canvas `onDrop` handler reads the component type and creates the appropriate node with default data:
   - Node: `{ label: 'New Node', componentType: 'node', llmEnabled: true, boundTools: [] }`
   - Gate: `{ label: 'Review Gate', componentType: 'gate', availableActions: { approve: true, rejectWithReason: true, editAndApprove: true, sendBackForRevision: false, addCommentAndContinue: false }, waitDuration: '24h', onTimeout: 'auto_approve' }`
   - Split: `{ label: 'Parallel Split', componentType: 'split', branchCount: 3, fanOutMethod: 'same_input', mergeMethod: 'summarize', waitStrategy: 'wait_all', branchTimeout: 60 }`
4. Remove ALL old toolbar items: Node, Route, Parallelization, Loop, Plan-and-Execute, Human Checkpoint, Classifier, Retriever, Validator, Sequential Edge, Conditional Edge, and any others.
5. Style: clean, minimal. Each item shows icon + label. Use shadcn/ui Tooltip for hover descriptions.
```

---

## Prompt 3: Custom Node Components — Visual Design on Canvas

```
Read CLAUDE.md for context. Create custom React Flow node components for each component type. These replace whatever custom nodes exist currently.

Create these files in `frontend/src/components/workflows/CustomNodes/`:

### 1. StartEndNode.tsx
Used for both START and END nodes.
- Small rounded pill shape (not a full card), ~80px wide
- Gray background (#6b7280), white text
- Shows just "START" or "END" centered
- START has one output handle (right side). END has one input handle (left side).
- Cannot be selected for deletion (no delete affordance)
- Subtle pulsing border animation on START to indicate "entry point"

### 2. WorkflowNode.tsx (the universal Node)
The main workhorse. Visual appearance changes based on `llmEnabled`:

**When LLM is ON (blue mode):**
```
┌─────────────────────────────┐
│ 🧠  Research Agent      [⚡]│  ← header: brain icon, name, LLM indicator
│ "Analyze financial data..." │  ← first line of system prompt (truncated)
│ 🔧 3 tools · gpt-4o        │  ← tool count chip + model badge
└─────────────────────────────┘
```
- Blue left border (4px solid #3b82f6)
- White/light background
- Header row: 🧠 icon (or Brain from lucide), node name, small blue ⚡ badge
- Line 2: first ~40 chars of system prompt in muted text, or "No prompt set" in italic gray
- Line 3: tool chips showing count ("🔧 3 tools") + model name if overridden, or "config default"
- Tool chips are small rounded badges. If tools are bound, show up to 3 tool names as tiny pills, then "+N more"
- Input handle on left, output handle on right

**When LLM is OFF (green mode — tool-only):**
```
┌─────────────────────────────┐
│ 🔧  Fetch Documents     [⚙]│  ← header: wrench icon, name, tool indicator
│ Tool: Document Reader       │  ← which tool is selected
│ Source: Enterprise KB       │  ← key config from the tool
└─────────────────────────────┘
```
- Green left border (4px solid #22c55e)
- Header row: 🔧 icon (or Wrench from lucide), node name, small green ⚙ badge
- Line 2: selected tool name, or "No tool selected" in italic gray
- Line 3: one key config value from the tool, if set
- Input handle on left, output handle on right

**Both modes share:**
- Card width: ~220px
- Rounded corners (8px)
- Light shadow on hover
- Selected state: thicker colored border + subtle glow
- The node shows a small toggle icon in the top-right corner hinting at the LLM state (⚡ for LLM, ⚙ for tool-only) — but the actual toggle is in the Inspector, not on the card

### 3. GateNode.tsx
```
┌─────────────────────────────┐
│ 👤  Manager Approval        │  ← header with person icon
│ Review: prev step output    │  ← what's shown to reviewer
│ ⏱ 24h → auto-approve       │  ← timeout behavior
└─────────────────────────────┘
```
- Amber left border (4px solid #f59e0b)
- Person icon (UserCheck from lucide)
- Shows review target and timeout summary
- Input handle on left, output handle on right

### 4. SplitNode.tsx
```
┌─────────────────────────────┐
│ ⫘  Parallel Analysis        │  ← header with split icon
│ 3 branches · summarize      │  ← branch count + merge method
│ Wait for all                │  ← wait strategy
└─────────────────────────────┘
```
- Purple left border (4px solid #8b5cf6)
- GitFork icon from lucide
- Shows branch count, merge method, wait strategy
- Input handle on left, output handle on right (the branching is conceptual — edges fan out from the single output handle to multiple downstream nodes)

### Implementation notes:

- Register all custom node types with React Flow's `nodeTypes` prop. **CRITICAL: Include BOTH new types AND old types as aliases for backward compatibility during transition.** The migration function (Prompt 8) converts types on load, but to be safe:
  ```typescript
  const nodeTypes = {
    // New types (primary)
    node: WorkflowNode,
    gate: GateNode,
    split: SplitNode,
    start: StartEndNode,
    end: StartEndNode,
    // Old types (aliases — map to closest new component so un-migrated workflows don't crash)
    step: WorkflowNode,
    decision: WorkflowNode,
    parallel: SplitNode,
    human_review: GateNode,
    agent_node: WorkflowNode,
    route: WorkflowNode,
    parallelization: SplitNode,
    human_checkpoint: GateNode,
    retriever: WorkflowNode,
    classifier: WorkflowNode,
    validator: WorkflowNode,
    loop: WorkflowNode,
  };
  ```
- Each node reads its config from `data` prop (which is `WorkflowNodeData`)
- All nodes should have consistent width (~220px) for visual alignment
- Use Tailwind for styling. shadcn/ui compatible colors.
- Each card should show 3 lines of MEANINGFUL summary — never show generic text like "Your first processing step"

- Similarly register edge types with old aliases:
  ```typescript
  const edgeTypes = {
    smart: SmartEdge,       // New unified edge
    deletable: SmartEdge,   // Old alias
    loopback: SmartEdge,    // Old alias
  };
  ```
```

---

## Prompt 4: Smart Edge System

```
Read CLAUDE.md for context. Implement the smart edge system that replaces the old Decision node. All routing now lives on edges.

### Auto-Detection Logic

When a user draws a new edge (connects two nodes), auto-detect the edge type:

1. **Loop detection**: If the target node appears BEFORE the source node in the graph topology (i.e., the edge points backward/upstream), default to `loop` type. Check by comparing node positions or by doing a simple reachability check — if target can already reach source through existing edges, it's a backward edge.

2. **Conditional detection**: If the source node already has one or more outgoing edges, the new edge defaults to `conditional` type (because the user is creating a branch — multiple paths from one node).

3. **Flow default**: If it's the first outgoing edge from the source and it's not backward, default to `flow` type.

The user can always override by clicking the edge and changing the type in the Edge Inspector.

### Edge Visual Rendering

Create a custom edge component at `frontend/src/components/workflows/CustomEdges/SmartEdge.tsx`:

- **Flow edge**: Solid gray line (#94a3b8), standard arrow marker. No label unless user adds one.
- **Conditional edge**: Solid amber line (#f59e0b), arrow marker. Shows the edge label on a small white pill/badge at the midpoint of the edge. If no label set, shows "condition?" in italic gray as a hint.
- **Loop edge**: Dashed cyan line (#06b6d4), arrow marker. Shows a ↻ icon at the midpoint and "Loop (max N)" label. Uses `strokeDasharray: "6 4"` for the dash pattern.

All edges:
- Show a small clickable zone at the midpoint for selection
- When selected, highlight with thicker stroke + glow
- When hovered, show a subtle × icon for quick deletion
- Register as custom edge type with React Flow: `edgeTypes: { smart: SmartEdge }`
- All new edges use the 'smart' type

### Edge Inspector Integration

When an edge is clicked/selected, the right panel (Inspector) switches to show the Edge Inspector (built in Prompt 5). Pass the edge ID and data to the inspector via the workflow store's selectedElement state.

### Multi-Output Support

Allow multiple edges from the same source handle. React Flow may need `connectOnDrop` and custom connection validation:
- A node can have unlimited outgoing edges
- When multiple outgoing edges exist from one node, they are evaluated in order (first created = highest priority). The last edge should typically be the fallback ("always" condition).
- START can only have outgoing edges. END can only have incoming edges.
- Prevent edges from END to anywhere. Prevent edges from anywhere to START.

### onConnect Handler

Update the canvas `onConnect` handler to:
1. Determine edge type using auto-detection logic above
2. Create the edge with appropriate default data:
   - Flow: `{ edgeType: 'flow' }`
   - Conditional: `{ edgeType: 'conditional', conditionMethod: 'llm_evaluation', confidenceThreshold: 0.7 }`
   - Loop: `{ edgeType: 'loop', maxIterations: 3, exitThreshold: 0.85, onMaxReached: 'use_best' }`
3. Add it to the store
4. If it's conditional or loop, auto-select the edge so the Edge Inspector opens immediately for configuration

Remove any old edge handling code that used Decision nodes for routing.
```

---

## Prompt 5: Inspector Panel — Unique Forms Per Component Type

```
Read CLAUDE.md for context. Revamp the Node Inspector (right panel) to show different forms based on what's selected: a Node, a Gate, a Split, or an Edge.

The inspector should be at `frontend/src/components/workflows/NodeInspector.tsx` (or rename to `Inspector.tsx`). It shows different content based on the selected element.

### Detection Logic

The workflow store tracks `selectedElement: { type: 'node' | 'edge', id: string } | null`. When:
- A node is clicked → show the appropriate node form
- An edge is clicked → show the edge form
- Nothing selected → show a hint: "Select a node or edge to configure it"
- START/END selected → show a read-only info card: "This is the [start/end] point of the workflow. It cannot be configured or deleted."

### Node Inspector (componentType === 'node')

This is the most complex form. It has a prominent LLM toggle at the top that changes which fields are shown below.

```
┌─ Node Inspector ─────────────────────┐
│                                       │
│ IDENTITY                              │
│ [Node Name input]                     │
│                                       │
│ LLM MODE                              │
│ ┌─────────────────────────────────┐   │
│ │  🧠 LLM Enabled    [TOGGLE ON] │   │
│ └─────────────────────────────────┘   │
│                                       │
│ === If LLM ON: show these sections == │
│                                       │
│ PROMPT                                │
│ [System Prompt — large textarea]      │
│ Prompt Lab: [dropdown: None | v1..]   │
│                                       │
│ MODEL                                 │
│ Model: [dropdown: config default|..]  │
│ Temperature: [slider 0.0-2.0]         │
│ Max Tokens: [number input]            │
│                                       │
│ TOOLS (bind to this LLM)              │
│ [Toggle list of all enabled tools]    │
│ Each row: icon, name, on/off toggle   │
│ Summary: "3 tools bound"              │
│                                       │
│ CONTEXT                               │
│ Input: [dropdown of context options]  │
│                                       │
│ === If LLM OFF: show these instead == │
│                                       │
│ TOOL SELECTION                        │
│ Tool: [dropdown of all tools]         │
│                                       │
│ TOOL CONFIGURATION (dynamic form)     │
│ [Fields change based on selected tool]│
│ Uses the tool's config_schema from    │
│ the Tool Registry to render fields    │
│                                       │
│ INPUT MAPPING                         │
│ Input: [dropdown: user_message,       │
│   previous_step, custom]              │
│                                       │
│ ERROR HANDLING                        │
│ Timeout: [seconds]                    │
│ On Failure: [dropdown]                │
│                                       │
│ ──────────────────────                │
│ [🗑 Delete Node] (red button)         │
└───────────────────────────────────────┘
```

**Dynamic tool config**: When a tool is selected in the LLM-OFF mode dropdown, fetch that tool's `config_schema` from the store (loaded from the Tool Registry API) and dynamically render form fields. For example, if the tool is "Document Reader" with config_schema `{ extraction_mode: { type: "enum", values: ["full_text", "key_sections", "summary"] }, metadata_extraction: { type: "boolean" } }`, render a dropdown for extraction_mode and a toggle for metadata_extraction.

**Tool binding in LLM-ON mode**: Show a list of all enabled tools from the Tool Registry. Each tool row has: tool icon, tool display_name, short description, and a toggle switch. Bound tools are ON (colored), unbound are OFF (gray). Show bound tools first. This list is loaded from the Zustand store (which fetches from GET /api/v1/tools).

### Gate Inspector (componentType === 'gate')

```
┌─ Gate Inspector ─────────────────────┐
│                                       │
│ IDENTITY                              │
│ [Gate Name input]                     │
│                                       │
│ REVIEW DISPLAY                        │
│ Show to reviewer: [multi-select:      │
│   prev step, full convo, specific     │
│   step, custom summary]               │
│ Instructions: [textarea]              │
│ Format: [dropdown: full, summary,     │
│   side-by-side]                       │
│                                       │
│ REVIEWER ACTIONS                      │
│ ✅ Approve           [always on]      │
│ ❌ Reject w/reason   [toggle]         │
│ ✏️ Edit & approve    [toggle]         │
│ 🔄 Send back        [toggle]         │
│ 💬 Comment & continue [toggle]        │
│ On reject: [dropdown]                 │
│                                       │
│ TIMEOUT                               │
│ Wait: [dropdown: 1h, 4h, 24h, etc.]  │
│ If no response: [dropdown]            │
│ Escalate to: [email input]            │
│                                       │
│ NOTIFICATION                          │
│ Notify via: [multi-select: email,     │
│   in-app, webhook]                    │
│ Template: [textarea with {{vars}}]    │
│                                       │
│ ──────────────────────                │
│ [🗑 Delete Gate] (red button)         │
└───────────────────────────────────────┘
```

### Split Inspector (componentType === 'split')

```
┌─ Split Inspector ────────────────────┐
│                                       │
│ IDENTITY                              │
│ [Split Name input]                    │
│                                       │
│ BRANCHING                             │
│ Branches: [number 2-10, default 3]    │
│ Fan-out: [dropdown: same input,       │
│   split input, custom per branch]     │
│ If custom: show N textareas           │
│   Branch 1: [textarea]               │
│   Branch 2: [textarea]               │
│   Branch 3: [textarea]               │
│                                       │
│ MERGE STRATEGY                        │
│ Method: [dropdown: concatenate,       │
│   summarize, best of N, vote, custom] │
│ If summarize/best/custom:             │
│   Merge prompt: [textarea]            │
│   Merge model: [dropdown]             │
│ Wait: [dropdown: all, first N,        │
│   timeout + best]                     │
│ Branch timeout: [seconds]             │
│                                       │
│ ADVANCED                              │
│ Max concurrent: [number]              │
│ On branch failure: [dropdown]         │
│                                       │
│ ──────────────────────                │
│ [🗑 Delete Split] (red button)        │
└───────────────────────────────────────┘
```

### Edge Inspector (when an edge is selected)

```
┌─ Edge Inspector ─────────────────────┐
│                                       │
│ CONNECTION                            │
│ From: [source node name] (read-only)  │
│ To: [target node name] (read-only)    │
│                                       │
│ EDGE TYPE                             │
│ [dropdown: Flow | Conditional | Loop] │
│ (changing type resets type-specific   │
│  fields to defaults)                  │
│                                       │
│ === If Conditional ===                │
│                                       │
│ CONDITION                             │
│ Method: [dropdown: rule, LLM eval,    │
│   score, regex, always]               │
│                                       │
│ If rule-based:                        │
│   Field: [text input]                 │
│   Operator: [dropdown]                │
│   Value: [text input]                 │
│                                       │
│ If LLM evaluation:                    │
│   Prompt: [textarea]                  │
│   Model: [dropdown, hint: "Use a      │
│     lighter model for routing"]       │
│   Confidence: [slider 0.5-1.0]       │
│                                       │
│ If score comparison:                  │
│   Field: [text], Op: [dropdown],      │
│   Threshold: [number]                 │
│                                       │
│ If regex: Pattern: [text input]       │
│                                       │
│ Edge Label: [text, auto-fills from    │
│   condition, editable, shows on       │
│   canvas]                             │
│                                       │
│ === If Loop ===                       │
│                                       │
│ LOOP CONTROL                          │
│ Condition: [same options as above]    │
│ Max iterations: [number, default 3]   │
│ Exit threshold: [slider 0.5-1.0]     │
│ On max reached: [dropdown: use best,  │
│   use last, stop error, fallback]     │
│                                       │
│ ──────────────────────                │
│ [🗑 Delete Edge] (red, no confirm)    │
└───────────────────────────────────────┘
```

### Implementation Notes:

1. Create separate form components for cleanliness:
   - `frontend/src/components/workflows/inspectors/NodeInspectorForm.tsx`
   - `frontend/src/components/workflows/inspectors/GateInspectorForm.tsx`
   - `frontend/src/components/workflows/inspectors/SplitInspectorForm.tsx`
   - `frontend/src/components/workflows/inspectors/EdgeInspectorForm.tsx`
   - `frontend/src/components/workflows/inspectors/EmptyInspector.tsx` (hint state)

2. The parent `Inspector.tsx` component reads `selectedElement` from the store and renders the appropriate form.

3. All form changes immediately update the node/edge data in the Zustand store (which triggers auto-save). Use `onChange` handlers, not a submit button.

4. For the tool toggle list in Node Inspector, fetch tools from the API on mount and cache in the store. Show only `is_enabled: true` tools.

5. Use shadcn/ui form components: Input, Textarea, Select, Switch, Slider, Badge, Separator, Label.

6. Delete button should be at the very bottom of every inspector. Clicking it on a node shows a confirmation dialog. Clicking it on an edge deletes immediately (no confirmation). START and END nodes do not show a delete button.

7. The LLM toggle on the Node Inspector is the most important UX element — make it prominent. Use a large Switch component with clear labels: "🧠 LLM Enabled" when on, "🔧 Tool Only" when off. Changing it should animate the node card color change on the canvas (blue ↔ green).
```

---

## Prompt 6: Workflow Templates

```
Read CLAUDE.md for context. Create the pre-built workflow templates that use the new component model. Every template must include START and END nodes.

**IMPORTANT: Do NOT rename the file.** The current file is `frontend/src/components/workflows/workflowTemplates.ts`. Keep this filename. `WorkflowList.tsx`, `WorkflowCanvas.tsx`, and `TemplatePicker.tsx` all import from `./workflowTemplates`. Renaming it without updating ALL three imports will break the build. Update the existing file in place.

Export an array of template objects. Each template has: `id`, `name`, `description`, `icon` (lucide icon name), and a `generate()` function that returns `{ nodes: Node[], edges: Edge[] }` with positions already laid out.

### Template Definitions

Use these exact canvas positions (x, y) for clean layouts. Nodes are ~220px wide, leave ~120px horizontal gaps. START at x:50, END at the right edge.

**CRITICAL: Every template node MUST set `data.componentType` matching its `type` field.** The `WorkflowNodeData` interface requires `componentType` and custom node components read it for rendering logic. If `componentType` is missing, nodes will render with `componentType: undefined` and break. For example:
```typescript
// CORRECT — every node sets both type AND data.componentType
{ id: 'start-1', type: 'start', data: { label: 'START', componentType: 'start' }, position: { x: 50, y: 250 } }
{ id: 'agent-1', type: 'node',  data: { label: 'ReAct Agent', componentType: 'node', llmEnabled: true, ... }, position: { x: 250, y: 250 } }
{ id: 'gate-1',  type: 'gate',  data: { label: 'Review', componentType: 'gate', ... }, position: { x: 450, y: 250 } }
{ id: 'split-1', type: 'split', data: { label: 'Fan Out', componentType: 'split', ... }, position: { x: 450, y: 250 } }
{ id: 'end-1',   type: 'end',   data: { label: 'END', componentType: 'end' }, position: { x: 700, y: 250 } }
```

**1. ReAct Agent** — "LLM reasons and uses tools iteratively"
```
START (50, 250) →[flow]→ Agent (250, 250) →[conditional: "answer complete"]→ END (550, 250)
                                ↻ loop back to self (condition: "not done", max: 5)
Agent config: componentType: 'node', llmEnabled: true, label: "ReAct Agent", systemPrompt: "You are a helpful assistant. Reason step by step, use tools when needed, provide a complete answer."
boundTools: [] (user will bind their own)
```

**2. Simple Chain** — "Sequential processing pipeline"
```
START (50, 250) →[flow]→ Analyzer (230, 250) →[flow]→ Synthesizer (470, 250) →[flow]→ Formatter (710, 250) →[flow]→ END (930, 250)
All nodes: llmEnabled: true, no tools bound
```

**3. RAG Pipeline** — "Retrieve context then generate answer"
```
START (50, 250) →[flow]→ Retriever (230, 250) →[flow]→ Generator (470, 250) →[flow]→ END (700, 250)
Retriever: llmEnabled: false, label: "Retrieve Context", selectedToolId: (leave empty, user picks)
Generator: llmEnabled: true, label: "Generate Answer", systemPrompt: "Using the retrieved context, answer the user's question accurately. Cite your sources."
```

**4. Human-in-the-Loop** — "AI drafts, human reviews, AI finalizes"
```
START (50, 250) →[flow]→ Draft (230, 250) →[flow]→ Review (450, 250) →[conditional: "approved"]→ Finalize (670, 250) →[flow]→ END (890, 250)
                                                        ↻ loop back to Draft (condition: "rejected", max: 3)
Draft: llmEnabled: true, label: "Draft Response"
Review: componentType: gate, label: "Manager Review", waitDuration: "24h", onTimeout: "auto_approve"
Finalize: llmEnabled: true, label: "Finalize Response"
```

**5. Parallel Analysis** — "Analyze from multiple perspectives"
```
START (50, 250) →[flow]→ Split (230, 250)
  Split → Finance (450, 100)
  Split → Legal (450, 250)
  Split → Operations (450, 400)
  All three →[flow]→ Synthesize (670, 250) →[flow]→ END (890, 250)
Split: branchCount: 3, fanOutMethod: "custom_per_branch", mergeMethod: "summarize"
  branchPrompts: ["Analyze from financial perspective", "Analyze from legal perspective", "Analyze from operational perspective"]
Finance/Legal/Ops: llmEnabled: true, individual system prompts matching the perspective
Synthesize: llmEnabled: true, label: "Synthesize", systemPrompt: "Combine the analyses into a unified report."
```

**6. Classifier Router** — "Route to specialist based on input"
```
START (50, 250) →[flow]→ Classifier (230, 250)
  →[conditional: "financial question"]→ Finance Agent (480, 100)
  →[conditional: "legal question"]→ Legal Agent (480, 250)
  →[conditional: "always/default"]→ General Agent (480, 400)
  All three →[flow]→ Format (700, 250) →[flow]→ END (920, 250)
Classifier: llmEnabled: true, label: "Classify Intent", systemPrompt: "Determine the category of the user's question."
Finance/Legal/General: llmEnabled: true with domain-specific prompts
```

**7. Plan and Execute** — "Create a plan, execute steps iteratively"
```
START (50, 250) →[flow]→ Planner (230, 250) →[flow]→ Executor (470, 250)
  →[conditional: "plan complete"]→ END (710, 250)
  Executor →[loop: "more steps", max: 10]→ Planner
Planner: llmEnabled: true, label: "Planner", systemPrompt: "Break the task into numbered steps. Output the next step to execute."
Executor: llmEnabled: true, label: "Executor", systemPrompt: "Execute the current step from the plan."
```

**8. Validator Loop** — "Generate then validate, retry if needed"
```
START (50, 250) →[flow]→ Generator (230, 250) →[flow]→ Validator (470, 250)
  →[conditional: "passed"]→ END (710, 250)
  Validator →[loop: "failed", max: 3]→ Generator
Generator: llmEnabled: true, label: "Generator"
Validator: llmEnabled: false, label: "Validator", selectedToolId: (leave empty, user picks validator tool)
```

**9. Orchestrator** — "Central coordinator dispatches to specialists"
```
START (50, 250) →[flow]→ Orchestrator (230, 250)
  →[conditional: "needs research"]→ Researcher (480, 100)
  →[conditional: "needs writing"]→ Writer (480, 250)
  →[conditional: "needs code"]→ Coder (480, 400)
  Researcher →[loop]→ Orchestrator
  Writer →[loop]→ Orchestrator
  Coder →[loop]→ Orchestrator
  →[conditional: "all done"]→ END (730, 250)
Orchestrator: llmEnabled: true, label: "Orchestrator", systemPrompt: "Coordinate the task. Decide which specialist to dispatch to next, or if the task is complete."
```

**10. Tool Pipeline (No LLM)** — "Pure tool chain, zero AI"
```
START (50, 250) →[flow]→ Fetch (220, 250) →[flow]→ Transform (420, 250) →[flow]→ Write (620, 250) →[flow]→ END (810, 250)
All nodes: llmEnabled: false
Fetch: label: "Fetch Data"
Transform: label: "Transform"
Write: label: "Write Output"
```

### Implementation:

1. Each template's `generate()` function returns React Flow compatible nodes and edges with all positions, data, and IDs pre-set. **Every node must have `data.componentType` set to match its `type` field** (see CRITICAL note above).
2. Node IDs should be deterministic per template (e.g., `template-react-start`, `template-react-agent`) so they're stable.
3. Edge IDs: `edge-{source}-{target}`.
4. The template selector in the toolbar calls the generate function and replaces the store's nodes/edges.
5. After loading a template, auto-fit the view using React Flow's `fitView()`.
6. Update ALL files that import from the templates file — the file stays as `workflowTemplates.ts` (not renamed):
   - `WorkflowList.tsx` — update template references, "Quick Start" button uses ReAct Agent template
   - `WorkflowCanvas.tsx` — update any template imports
   - `TemplatePicker.tsx` — update to show all 10 templates
7. **ReActOnboarding.tsx**: This component is imported by `WorkflowCanvas.tsx` and shows an onboarding overlay when `?onboarding=react` URL param is present. It references old template structure. Update it IN THIS PROMPT (not deferred) to reflect the new ReAct template: START → Agent Node (LLM ON, with tools) → END with a loopback edge. Update any copy, visuals, or node-type references to match the new model.
```

---

## Prompt 7: Canvas Interactions — Delete, Context Menu, Keyboard Shortcuts

```
Read CLAUDE.md for context. Add interaction features to the workflow canvas.

### Delete Functionality

1. **Keyboard**: Pressing `Delete` or `Backspace` when a node or edge is selected:
   - If node: show confirmation dialog "Delete [node name]? All connected edges will also be removed."
   - If edge: delete immediately, no confirmation
   - If START or END: show toast "Cannot delete START/END nodes"

2. **Node delete button**: Already in the Inspector (from Prompt 5). Wire it to the same delete logic.

3. **Edge hover delete**: When hovering over an edge, show a small × icon at the edge midpoint. Clicking it deletes the edge instantly.

### Context Menu (Right-Click)

On right-click on a node:
- "Delete Node" (disabled for START/END)
- "Duplicate Node" → creates a copy offset by (30, 30) with the same config but new ID
- "Disconnect All Edges" → removes all connected edges, keeps the node

On right-click on an edge:
- "Delete Edge"
- "Change to Flow" / "Change to Conditional" / "Change to Loop" (quick type switch)

On right-click on empty canvas:
- "Add Node" → sub-menu: Node, Gate, Split (adds at click position)
- "Fit View" → calls fitView()
- "Select All"

### Auto-Reconnect on Delete

When a node B is deleted and it sits between exactly one incoming edge (A→B) and one outgoing edge (B→C), offer to auto-connect A→C:
- Show a toast: "Node deleted. Auto-connected [A] → [C]" with an "Undo" button (5 second timeout)
- If the deleted node had multiple incoming or outgoing edges, don't auto-reconnect — just remove the node and all its edges

### Connection Validation

Prevent invalid connections:
- Cannot connect FROM END
- Cannot connect TO START
- Cannot create self-loops on START or END
- Cannot create duplicate edges (same source + same target)
- Self-loops on other nodes are allowed (they become loop edges)

### Undo/Redo — Use Existing System (DO NOT REIMPLEMENT)

`WorkflowCanvas.tsx` already has a working `useHistory()` hook (approximately lines 161-223) with `pushHistory`, `undo`, `redo`, `canUndo`, `canRedo`, and a 20-step history stack. **Do NOT reimplement or duplicate this.** Wire the existing `useHistory()` to keyboard shortcuts:
- `Cmd/Ctrl + Z` → call existing `undo()`
- `Cmd/Ctrl + Shift + Z` → call existing `redo()`
- Wire `canUndo`/`canRedo` to enable/disable toolbar undo/redo buttons if present

### Canvas Top Bar

Update the top bar above the canvas:
- Left: Workflow name (editable inline text)
- Center: breadcrumb showing Domain > Workflow name
- Right: "Save" button (for manual save), "Auto-saved ✓" indicator, zoom controls (+, -, fit)

Use React Flow's `useReactFlow()` hook for `fitView()`, `zoomIn()`, `zoomOut()`.
```

---

## Prompt 8: Migration of Existing Workflows

```
Read CLAUDE.md for context. Existing workflows stored in Supabase use old node types. Add a migration function that converts them on load.

Create a utility at `frontend/src/lib/workflow-migration.ts`:

### Migration Function

```typescript
function migrateWorkflowData(graphData: any): { nodes: Node[], edges: Edge[], migrated: boolean }
```

This function runs when a workflow is loaded from the API. It checks if the data uses old types and converts:

### Node Type Mapping

Old type → New type:
- 'step' | 'node' → componentType: 'node', llmEnabled: true
- 'agent_node' → componentType: 'node', llmEnabled: true
- 'decision' | 'route' → DELETE the node, convert to conditional edges (see below)
- 'human_review' | 'human_checkpoint' → componentType: 'gate'
- 'parallel' | 'parallelization' → componentType: 'split'
- 'classifier' → componentType: 'node', llmEnabled: true (it's just an LLM node that classifies)
- 'retriever' → componentType: 'node', llmEnabled: false (it's a tool-only node)
- 'validator' → componentType: 'node', llmEnabled: false (it's a tool-only node doing validation)
- 'loop' → DELETE the node, convert to loop edge (see below)
- 'plan_execute' | 'plan_and_execute' → convert to two nodes: Planner + Executor with a loop edge

### Decision Node Conversion

When a Decision node is found:
1. Find all incoming edges to the Decision node
2. Find all outgoing edges from the Decision node
3. For each incoming source → for each outgoing target: create a conditional edge directly from source to target
4. Copy the Decision node's condition/purpose as the edge's conditionPrompt
5. Delete the Decision node

### Loop Node Conversion

When a Loop node is found:
1. Find the node BEFORE the loop (source of the edge into the Loop node)
2. Find the node the loop was supposed to go back to (target of the loop's outgoing backward edge, or the node before it)
3. Create a loop edge from the node before → the loop target
4. Copy max_iterations and exit conditions from the Loop node data
5. Delete the Loop node

### Add Missing START/END

If the loaded workflow has no START node, add one at position (50, middle_y) where middle_y is the average Y of all existing nodes. Connect it to the first node (the one with no incoming edges, i.e. entry point).

If no END node, add one at position (max_x + 200, middle_y). Connect the last node (exit point or node with no outgoing edges) to it.

### Edge Type Inference

Old edges have no `edgeType` in their data. Infer:
- Old edge type `"loopback"` → data.edgeType = 'loop', copy LoopbackEdgeData fields (loopCondition → conditionPrompt, maxIterations, exitThreshold)
- Old edge type `"deletable"` → data.edgeType = 'flow'
- If the edge was connected to/from a Decision node → data.edgeType = 'conditional'
- If the edge points backward (target.position.x < source.position.x) → data.edgeType = 'loop'
- Otherwise → data.edgeType = 'flow'
- Set ALL edge types to `"smart"` (the new unified React Flow edge type)

### Handle entry_point / exit_point Fields

The current canvas tracks `entry_point` and `exit_point` as separate workflow fields saved to the DB alongside `graph_data`. With START/END nodes now embedded in `graph_data`, these become redundant. Handle as follows:

1. **On migration**: After adding START/END nodes, auto-set `entry_point = START_node_id` and `exit_point = END_node_id` in the workflow record. This keeps the DB fields consistent for any backend code that reads them.
2. **On new workflow creation**: Set `entry_point` and `exit_point` to the auto-generated START/END node IDs.
3. **In the executor** (Prompt 9a): When finding the start node, check `graph_data` nodes for `type === "start"` first. If not found, fall back to `workflow.entry_point` as a secondary lookup. This ensures backward compat.
4. **Do NOT delete these fields** from the backend model yet — they're a cheap safety net.

### Implementation:

1. Call `migrateWorkflowData()` in the workflow store's `loadWorkflow`/`fetchWorkflow` action, right after fetching from the API.
2. If `migrated === true`, auto-save the migrated data back to the API so it doesn't re-migrate next time.
3. Show a toast: "Workflow upgraded to new format" when migration runs.
4. Log migration details to console for debugging.

### Old node data preservation:

When converting old nodes, preserve these fields if they exist:
- `purpose` or `systemPromptHint` → copy to `systemPrompt` (for LLM nodes)
- `boundTools` or `bound_tools` or `tools` → copy to `boundTools`
- `modelOverride` or `model_override` → copy to `modelOverride`
- `label` or `name` → copy to `label`
- `branchCount`, `fanOutMethod`, `mergeMethod` → copy to split node data
- `displayContent`, `humanOptions`, `timeoutBehavior`, `timeoutMinutes` → map to gate node data
- `retrievalSource`, `topK`, `rerankingEnabled` → copy to tool config for retriever nodes
```

---

## Prompt 9a: Backend — Executor Node Type Dispatch (Low Risk)

```
Read CLAUDE.md for context. The backend workflow executor currently handles old node types (step, decision, human_review, parallel). It must be updated to ALSO handle new types (node, gate, split, start, end). This prompt covers type dispatch only — edge-based routing is in Prompt 9b.

### Update `backend/app/services/workflow_executor.py`

This is the LIVE execution pipeline that runs when a user sends a message in the workspace.

#### 1. Node Execution Dispatch

Find the section where `node_type = node.get("type", "step")` is read and the if/elif/else branches execute different logic. Replace with:

```python
node_type = node.get("type", "step")
node_data = node.get("data", {})

# START and END are passthrough — do NOT call LLM, do NOT create execution steps
if node_type in ("start", "end"):
    # Just pass context through to next node
    # Do NOT write an execution_step record for these
    continue  # or skip to next node in iteration

# GATE — human review checkpoint
elif node_type == "gate":
    # Reuse existing human_review logic
    # Read gate config from node_data: waitDuration, onTimeout, reviewInstructions
    # For now (v1): auto-approve like current human_review
    # Write execution_step with node_type="gate"
    ...

# SPLIT — parallel execution
elif node_type == "split":
    # Reuse existing parallel logic
    # Read split config: branchCount, fanOutMethod, mergeMethod, branchPrompts
    # Fan out to downstream nodes (connected via outgoing edges)
    # Merge results based on mergeMethod
    # Write execution_step with node_type="split"
    ...

# NODE (universal) — check llmEnabled
elif node_type == "node":
    llm_enabled = node_data.get("llmEnabled", True)

    if llm_enabled:
        # LLM-powered node: call LLM with system prompt + bound tools
        # CRITICAL: Old nodes use "systemPromptHint" (line 432 of executor), new nodes use "systemPrompt".
        # Read BOTH — prefer new field, fall back to old field. Without this, new nodes silently execute with no prompt.
        system_prompt = node_data.get("systemPrompt") or node_data.get("systemPromptHint", "")
        bound_tools = node_data.get("boundTools", [])
        model_override = node_data.get("modelOverride")
        temperature = node_data.get("temperature")
        # Proceed with existing LLM call logic, using these values
        # Write execution_step with node_type="node"
        ...
    else:
        # Tool-only node: execute the selected tool directly, NO LLM call
        selected_tool_id = node_data.get("selectedToolId")
        tool_config = node_data.get("toolConfig", {})
        input_mapping = node_data.get("inputMapping", "previous_step")
        # Look up the tool from tool registry
        # Execute it with the input from previous step or user message
        # Write execution_step with node_type="node"
        # IMPORTANT: Do NOT waste tokens on an LLM call
        ...

# BACKWARD COMPATIBILITY — old types still work during transition
elif node_type == "decision":
    # Old Decision node — evaluate conditions from node_data
    # This path is only hit if frontend migration hasn't run yet
    ...

elif node_type in ("human_review", "human_checkpoint"):
    # Old human review — map to gate logic
    ...

elif node_type in ("parallel", "parallelization"):
    # Old parallel — map to split logic
    ...

# Default: treat as LLM step (handles 'step', 'agent_node', and any unknown types)
else:
    # Existing LLM call logic
    ...
```

Keep old type handling during transition — don't remove the old `if node_type == "decision"` branches. Keep them as fallbacks so any un-migrated workflow still works. But log a deprecation warning.
```

---

## Prompt 9b: Backend — Edge-Based Routing + Graph Traversal (High Risk)

```
Read CLAUDE.md for context. This prompt replaces the executor's linear topological-sort iteration with edge-following traversal, and adds conditional/loop edge evaluation. This is the highest-risk change in the revamp — it changes how the executor decides which node runs next.

### Update `backend/app/services/workflow_executor.py`

#### 1. Edge-Based Routing (CRITICAL — replaces Decision node)

After a node executes, the executor currently either goes to the next node in sequence or follows a Decision node's routing. Now routing lives on edges. Add this logic:

```python
def _get_next_nodes(current_node_id: str, execution_result: dict, graph_data: dict, config: dict) -> list[str]:
    """
    Determine which node(s) to execute next based on outgoing edges.
    Replaces the old Decision node routing.
    """
    edges = graph_data.get("edges", [])
    nodes_by_id = {n["id"]: n for n in graph_data.get("nodes", [])}
    outgoing = [e for e in edges if e.get("source") == current_node_id]

    if not outgoing:
        return []  # Terminal node (should be END)

    # SPLIT NODE SPECIAL CASE: fan-out to ALL outgoing edges simultaneously
    current_node = nodes_by_id.get(current_node_id, {})
    if current_node.get("type") == "split":
        # Split nodes need ALL outgoing edges followed, not just the first match
        return [e["target"] for e in outgoing]

    # If only one outgoing edge, just follow it (regardless of type)
    if len(outgoing) == 1:
        return [outgoing[0]["target"]]

    # Multiple outgoing edges — evaluate conditions in order
    edge_data_list = [(e, e.get("data", {})) for e in outgoing]

    for edge, data in edge_data_list:
        edge_type = data.get("edgeType", "flow")

        if edge_type == "flow":
            # Flow edges are always followed
            return [edge["target"]]

        elif edge_type in ("conditional", "loop"):
            condition_method = data.get("conditionMethod", "always")

            if condition_method == "always":
                # Fallback/default edge — always matches
                return [edge["target"]]

            elif condition_method == "rule_based":
                field = data.get("ruleField", "")
                operator = data.get("ruleOperator", "equals")
                value = data.get("ruleValue", "")
                if _evaluate_rule(execution_result, field, operator, value):
                    return [edge["target"]]

            elif condition_method == "llm_evaluation":
                prompt = data.get("conditionPrompt", "")
                model = data.get("evaluatorModel")  # None = use config routing model
                threshold = data.get("confidenceThreshold", 0.7)
                if _evaluate_with_llm(execution_result, prompt, model, threshold, config):
                    return [edge["target"]]

            elif condition_method == "score_comparison":
                field = data.get("scoreField", "")
                operator = data.get("scoreOperator", ">")
                threshold = data.get("scoreThreshold", 0.5)
                if _evaluate_score(execution_result, field, operator, threshold):
                    return [edge["target"]]

            elif condition_method == "regex_match":
                pattern = data.get("regexPattern", "")
                match_field = data.get("regexMatchField", "full_output")
                if _evaluate_regex(execution_result, pattern, match_field):
                    return [edge["target"]]

    # No condition matched — log warning and follow last edge as fallback
    if outgoing:
        return [outgoing[-1]["target"]]
    return []
```

Add helper functions:
- `_evaluate_rule(result, field, operator, value) -> bool` — simple field comparison on result dict
- `_evaluate_score(result, field, operator, threshold) -> bool` — numeric comparison
- `_evaluate_regex(result, pattern, match_field) -> bool` — regex match
- `_evaluate_with_llm(result, prompt, model, threshold, config) -> bool` — **Implementation guidance:**
  1. The existing `call_llm_streaming()` in `llm_service.py` is async and yields chunks. For a yes/no routing decision you do NOT want streaming — you need a single complete response.
  2. **Preferred approach**: Add a non-streaming helper `call_llm_sync(messages, model, config) -> str` to `llm_service.py` that collects the full response into a string. This is a thin wrapper: call the LLM provider API without streaming, return `response.content[0].text`.
  3. **Model selection**: Use the edge's `evaluatorModel` field if set. If not set, fall back to `config.get("routing_model")` or a lightweight default like `"gpt-4o-mini"`. Routing decisions should use the cheapest adequate model — not the primary model.
  4. **Prompt format**: Send a system message asking for a JSON response `{"decision": true/false, "confidence": 0.0-1.0}`, include the execution result as context, and include the edge's `conditionPrompt` as the evaluation criteria. Parse the JSON response and check `confidence >= threshold`.
  5. **Error handling**: If LLM call fails or JSON parsing fails, return `False` (don't follow this edge, fall through to next).

#### 3. Loop Edge Handling

When following a loop edge, track iteration count:

```python
# In the main execution loop, maintain a dict of loop counters
loop_counters = {}  # edge_id -> current iteration count

# When _get_next_nodes returns a target via a loop edge:
edge = matched_edge
edge_data = edge.get("data", {})
if edge_data.get("edgeType") == "loop":
    edge_id = edge["id"]
    max_iterations = edge_data.get("maxIterations", 3)
    loop_counters[edge_id] = loop_counters.get(edge_id, 0) + 1

    if loop_counters[edge_id] > max_iterations:
        on_max = edge_data.get("onMaxReached", "use_last")
        if on_max == "stop_error":
            # Raise/log error
            break
        elif on_max in ("use_best", "use_last"):
            # Skip the loop, proceed to next non-loop edge
            continue
        # ... handle other cases
```

#### 4. Graph Traversal Update

Replace the current linear node iteration (`_get_nodes_in_order` doing topological sort and iterating) with an edge-following traversal:

```python
async def _execute_workflow_graph(self, graph_data, context, config, send_event):
    nodes_by_id = {n["id"]: n for n in graph_data.get("nodes", [])}

    # Find START node
    start_node = next((n for n in graph_data["nodes"] if n.get("type") == "start"), None)
    if not start_node:
        # Backward compat: find node with no incoming edges
        ...

    current_node_ids = _get_next_nodes(start_node["id"], {}, graph_data, config)
    loop_counters = {}
    execution_count = 0
    max_executions = config.get("max_total_node_executions", 50)

    while current_node_ids and execution_count < max_executions:
        node_id = current_node_ids.pop(0)
        node = nodes_by_id.get(node_id)
        if not node:
            continue

        node_type = node.get("type", "node")
        if node_type in ("start", "end"):
            if node_type == "end":
                break  # Reached the end
            current_node_ids = _get_next_nodes(node_id, {}, graph_data, config)
            continue

        # Execute the node
        result = await _execute_node(node, context, config, send_event)
        execution_count += 1

        # Determine next node(s) via edge evaluation
        next_ids = _get_next_nodes(node_id, result, graph_data, config)
        current_node_ids.extend(next_ids)
```

### Update the `"direct_llm"` fallback path

The executor has a fallback path (around line 206) for when there's no workflow — it creates a "direct_llm" execution step. Keep this unchanged — it's the no-workflow chat mode.

### Keep old type handling during transition

Don't remove the old `if node_type == "decision"` branches immediately. Keep them as fallbacks so any un-migrated workflow that somehow reaches the executor still works. But log a deprecation warning.

### Old parallel/split nodes

The old `parallel`/`parallelization` type branches in the executor also need to be kept as fallback. The new `split` handler and the old `parallel` handler should share logic where possible.
```

---

## Prompt 10: Backend — Execution Simulator Handles New Types

```
Read CLAUDE.md for context. Update the execution simulator to handle new node types. This prompt has no dependency on Prompt 9b (edge routing) — it only needs the type definitions from Prompt 1.

The simulator is at `backend/app/services/execution_simulator.py`. It uses a `@_reg("type_name")` decorator pattern to register simulation functions per node type. The dispatch reads `node.get("type", "agent_node")` and looks up the registered simulator. **The dispatch call is `simulator(node, context=context)` at line 806 — all registered functions must be SYNC and accept `**kwargs`.**

### Add New Type Registrations

**CRITICAL: Match the existing function signature pattern.** The actual codebase uses SYNC functions with keyword args: `def _sim(node, **_)`. The dispatch call at line 806 is `simulator(node, context=context)`. Using async functions with positional args will crash at runtime. Match the existing pattern exactly.

Add these new registered simulators alongside the existing ones (do NOT remove old registrations — they're needed for backward compatibility with old workflows):

```python
@_reg("start")
def _sim_start(node, **_):
    """START node — passthrough, no simulation needed."""
    return {
        "response_text": "",
        "status": "passthrough",
        "tokens_used": 0,
    }

@_reg("end")
# The existing @_reg("end") should already exist. If not, add:
def _sim_end(node, **_):
    """END node — passthrough, marks completion."""
    return {
        "response_text": "",
        "status": "completed",
        "tokens_used": 0,
    }

@_reg("node")
def _sim_node(node, **kwargs):
    """Universal node — behavior depends on llmEnabled."""
    node_data = node.get("data", {})
    llm_enabled = node_data.get("llmEnabled", True)

    if llm_enabled:
        # LLM-powered: reuse existing agent_node simulation logic
        bound_tools = node_data.get("boundTools", [])
        # Read system prompt from BOTH new and old field names
        system_prompt = node_data.get("systemPrompt") or node_data.get("systemPromptHint", "")
        model = node_data.get("modelOverride") or kwargs.get("context", {}).get("config", {}).get("primary_model", "gpt-4o")

        # Call the same LLM simulation that @_reg("agent_node") uses
        return _sim_agent_node(node, **kwargs)
    else:
        # Tool-only: simulate tool execution without LLM
        selected_tool = node_data.get("selectedToolId", "")
        tool_config = node_data.get("toolConfig", {})

        # Check if there's a registered simulator for this tool type
        tool_simulator = NODE_SIMULATORS.get(selected_tool)
        if tool_simulator:
            return tool_simulator(node, **kwargs)

        # Default tool simulation
        return {
            "response_text": f"Tool '{selected_tool}' executed successfully.",
            "status": "completed",
            "tool_called": selected_tool,
            "tool_config": tool_config,
            "tokens_used": 0,  # No LLM tokens for tool-only
        }

@_reg("gate")
def _sim_gate(node, **kwargs):
    """Gate node — simulates human review. Auto-approves in simulation."""
    # Reuse existing human_review simulation
    return _sim_human_review(node, **kwargs)

@_reg("split")
def _sim_split(node, **kwargs):
    """Split node — simulates parallel branch execution."""
    # Reuse existing parallelization simulation
    return _sim_parallelization(node, **kwargs)
```

### Add Backward-Compat Aliases

If not already present, add aliases so old type strings also resolve. **Same pattern: sync, keyword args.**

```python
@_reg("step")
def _sim_step(node, **kwargs):
    return _sim_agent_node(node, **kwargs)

@_reg("decision")
def _sim_decision(node, **kwargs):
    return _sim_route(node, **kwargs)

@_reg("parallel")
def _sim_parallel(node, **kwargs):
    return _sim_parallelization(node, **kwargs)

@_reg("human_checkpoint")
def _sim_human_checkpoint(node, **kwargs):
    return _sim_human_review(node, **kwargs)

@_reg("classifier")
def _sim_classifier(node, **kwargs):
    return _sim_agent_node(node, **kwargs)

@_reg("direct_llm")
def _sim_direct_llm(node, **kwargs):
    return _sim_agent_node(node, **kwargs)
```

### Update Default Fallback

Change the default node type from `"agent_node"` to `"node"`:
```python
# Old:
node_type = node.get("type", "agent_node")
# New:
node_type = node.get("type", "node")
```

### Simulator also needs edge-based routing

The simulator's graph traversal logic (around the dispatch loop) must be updated to follow edges like the executor (Prompt 9). If the simulator has its own `_get_nodes_in_order` or iteration logic, update it to:
1. Start from the START node
2. Follow edges, evaluating conditions on conditional edges
3. Track loop counters for loop edges
4. Stop at END node

If the simulator currently does a simple linear iteration of all nodes, it MUST be changed to edge-following traversal. Otherwise conditional routing and loop edges won't work in simulation mode.
```

---

## Prompt 11: Backend — Workflow Validation

```
Read CLAUDE.md for context. Update the backend to validate the new workflow graph_data format.

### Update Pydantic Models

In `backend/app/models/workflow.py`, keep `GraphData` permissive (accepts any dict) but add a separate validation function.

### Add `validate_graph()` to `workflow_service.py`

```python
def validate_graph(graph_data: dict) -> list[str]:
    """
    Validate a workflow graph. Returns list of warning messages.
    Called on save but does NOT block saving — just returns warnings.
    """
    warnings = []
    nodes = graph_data.get("nodes", [])
    edges = graph_data.get("edges", [])
    node_ids = {n.get("id") for n in nodes}

    # Check for START/END
    start_nodes = [n for n in nodes if n.get("type") == "start"]
    end_nodes = [n for n in nodes if n.get("type") == "end"]

    if len(start_nodes) != 1:
        warnings.append(f"Expected exactly 1 START node, found {len(start_nodes)}")
    if len(end_nodes) != 1:
        warnings.append(f"Expected exactly 1 END node, found {len(end_nodes)}")

    # Check node types
    valid_types = {"start", "end", "node", "gate", "split",
                   # Old types (still valid during transition)
                   "step", "decision", "parallel", "human_review",
                   "agent_node", "route", "parallelization",
                   "human_checkpoint", "classifier", "retriever",
                   "validator", "loop", "plan_and_execute"}
    for node in nodes:
        ntype = node.get("type")
        if ntype not in valid_types:
            warnings.append(f"Unknown node type: {ntype}")

    # Check edge references
    for edge in edges:
        source = edge.get("source")
        target = edge.get("target")
        if source not in node_ids:
            warnings.append(f"Edge references missing source node: {source}")
        if target not in node_ids:
            warnings.append(f"Edge references missing target node: {target}")

    # Check no edges FROM end
    if end_nodes:
        end_id = end_nodes[0].get("id")
        outgoing_from_end = [e for e in edges if e.get("source") == end_id]
        if outgoing_from_end:
            warnings.append("END node should not have outgoing edges")

    # Check no edges TO start
    if start_nodes:
        start_id = start_nodes[0].get("id")
        incoming_to_start = [e for e in edges if e.get("target") == start_id]
        if incoming_to_start:
            warnings.append("START node should not have incoming edges")

    # Check disconnected nodes
    connected_ids = set()
    for edge in edges:
        connected_ids.add(edge.get("source"))
        connected_ids.add(edge.get("target"))
    for node in nodes:
        nid = node.get("id")
        ntype = node.get("type")
        if nid not in connected_ids and ntype not in ("start", "end"):
            warnings.append(f"Node '{node.get('data', {}).get('label', nid)}' is disconnected")

    return warnings
```

### Wire validation into the PATCH endpoint

In `backend/app/routers/workflows.py`, after a successful save, run validation and return warnings in the response:

```python
# In the PATCH handler:
if data.graph_data:
    warnings = validate_graph(data.graph_data.model_dump())
    # Return warnings in the response so frontend can show them
```

### Backward Compatibility

The PATCH endpoint accepts BOTH old and new format graph_data. Don't reject old format — the frontend migration (Prompt 8) handles conversion. The validation function accepts old types in the valid_types set.
```

---

## Prompt 12: Workspace UI — Update Color Maps for Execution Traces

```
Read CLAUDE.md for context. The workspace execution UI displays execution traces, inspector panels, and timing bars. These all have hardcoded color maps keyed by node_type strings. They currently only know about OLD type strings. New type strings ("node", "gate", "split", "start") will fall through to gray defaults, making execution traces look broken.

Update these THREE files to support BOTH old and new type strings:

### 1. `frontend/src/components/workspace/TraceStep.tsx`

Find the `NODE_COLORS` map (around line 24). Add entries for new types while KEEPING all existing entries (old execution records in the DB keep old type strings forever):

```typescript
const NODE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  // === NEW types (from canvas revamp) ===
  node:             { bg: "bg-blue-50",    text: "text-blue-600",    border: "border-blue-200" },
  gate:             { bg: "bg-amber-50",   text: "text-amber-600",   border: "border-amber-200" },
  split:            { bg: "bg-purple-50",  text: "text-purple-600",  border: "border-purple-200" },
  start:            { bg: "bg-gray-50",    text: "text-gray-500",    border: "border-gray-200" },

  // === OLD types (keep for backward compat — old execution records) ===
  route:            { bg: "bg-orange-50",  text: "text-orange-600",  border: "border-orange-200" },
  retriever:        { bg: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-200" },
  calculator:       { bg: "bg-blue-50",    text: "text-blue-600",    border: "border-blue-200" },
  code_interpreter: { bg: "bg-indigo-50",  text: "text-indigo-600",  border: "border-indigo-200" },
  validator:        { bg: "bg-red-50",     text: "text-red-600",     border: "border-red-200" },
  file_writer:      { bg: "bg-amber-50",   text: "text-amber-600",   border: "border-amber-200" },
  summarizer:       { bg: "bg-purple-50",  text: "text-purple-600",  border: "border-purple-200" },
  agent_node:       { bg: "bg-slate-50",   text: "text-slate-600",   border: "border-slate-200" },
  classifier:       { bg: "bg-pink-50",    text: "text-pink-600",    border: "border-pink-200" },
  parallelization:  { bg: "bg-cyan-50",    text: "text-cyan-600",    border: "border-cyan-200" },
  loop:             { bg: "bg-violet-50",  text: "text-violet-600",  border: "border-violet-200" },
  human_review:     { bg: "bg-teal-50",    text: "text-teal-600",    border: "border-teal-200" },
  end:              { bg: "bg-gray-50",    text: "text-gray-500",    border: "border-gray-200" },
  step:             { bg: "bg-blue-50",    text: "text-blue-600",    border: "border-blue-200" },
  decision:         { bg: "bg-orange-50",  text: "text-orange-600",  border: "border-orange-200" },
  parallel:         { bg: "bg-cyan-50",    text: "text-cyan-600",    border: "border-cyan-200" },
  direct_llm:       { bg: "bg-violet-50",  text: "text-violet-600",  border: "border-violet-200" },
  human_checkpoint: { bg: "bg-teal-50",    text: "text-teal-600",    border: "border-teal-200" },
};
```

### 2. `frontend/src/components/workspace/InspectorNode.tsx`

Find the `NODE_BAR` map (around line 28). Add entries for ALL new AND old types:

```typescript
const NODE_BAR: Record<string, string> = {
  // New types
  node: "bg-blue-400",
  gate: "bg-amber-400",
  split: "bg-purple-400",
  start: "bg-gray-400",

  // Old types (keep all existing entries)
  route: "bg-orange-400",
  retriever: "bg-emerald-400",
  calculator: "bg-blue-400",
  code_interpreter: "bg-indigo-400",
  validator: "bg-red-400",
  file_writer: "bg-amber-400",
  summarizer: "bg-purple-400",
  agent_node: "bg-slate-400",
  classifier: "bg-pink-400",
  parallelization: "bg-cyan-400",
  loop: "bg-violet-400",
  human_review: "bg-teal-400",
  human_checkpoint: "bg-teal-400",
  end: "bg-gray-300",
  step: "bg-blue-400",
  decision: "bg-orange-400",
  parallel: "bg-cyan-400",
  direct_llm: "bg-violet-400",
};
```

Also check for any special conditional rendering based on node_type. There's a check around line 243: `if step.node_type === "retriever"` which renders a "Knowledge Retrieved" section. Add the equivalent for the new model:
```typescript
// Old: step.node_type === "retriever"
// New: also trigger for node type "node" where llmEnabled is false and tool is a retriever
// The safest approach: check for step.node_type === "retriever" || (step.node_type === "node" && step output contains retrieved documents)
```

### 3. `frontend/src/components/workspace/TimingBar.tsx`

Find the `NODE_BG` map (around line 13). Add the same entries:

```typescript
const NODE_BG: Record<string, string> = {
  // New types
  node: "bg-blue-400",
  gate: "bg-amber-400",
  split: "bg-purple-400",
  start: "bg-gray-400",

  // Old types (keep all existing)
  route: "bg-orange-400",
  retriever: "bg-emerald-400",
  calculator: "bg-blue-400",
  code_interpreter: "bg-indigo-400",
  validator: "bg-red-400",
  file_writer: "bg-amber-400",
  summarizer: "bg-purple-400",
  agent_node: "bg-slate-400",
  classifier: "bg-pink-400",
  parallelization: "bg-cyan-400",
  loop: "bg-violet-400",
  human_review: "bg-teal-400",
  human_checkpoint: "bg-teal-400",
  end: "bg-gray-300",
  step: "bg-blue-400",
  decision: "bg-orange-400",
  parallel: "bg-cyan-400",
  direct_llm: "bg-violet-400",
};
```

### Why BOTH old and new are needed:

Old execution records in the database have old type strings (`"agent_node"`, `"route"`, `"parallelization"`, etc.). These will NEVER be migrated — they're historical execution data. New executions will write new type strings (`"node"`, `"gate"`, `"split"`). Both will be displayed in the same workspace session. If old entries are missing from the color map, they'll show as gray, which looks broken to the user.
```

---

## Prompt 13: Polish and Verification

```
Read CLAUDE.md for context. Final polish pass on the workflow canvas.

### Visual Polish

1. **Minimap**: Enable React Flow's built-in Minimap component. Position it bottom-right. Node colors in minimap should match the component type colors (blue, green, amber, purple, gray).

2. **Background grid**: Use React Flow's Background component with subtle dots pattern.

3. **Connection lines**: When the user is dragging a new connection, the preview line should be animated (dashed, moving) to make it clear they're creating an edge.

4. **Empty state**: When a new workflow is created (only START and END), show a centered hint message on the canvas between them: "Drag components from the toolbar or pick a template to get started" with a subtle arrow pointing to the toolbar.

5. **Node snapping**: Enable snap-to-grid with a 20px grid. Nodes align neatly when dragged.

6. **Zoom controls**: Show current zoom level percentage next to the +/- buttons.

### Responsive Inspector

The Inspector panel should:
- Be collapsible (toggle with a side arrow or pressing `i`)
- Default to ~320px wide
- Scroll internally if content overflows
- Have section headers that are collapsible (Prompt/Model/Tools/etc.) so users can focus on one section
- Remember which sections are expanded (store in localStorage)

### Keyboard Shortcuts

- `Delete` / `Backspace`: Delete selected element
- `Cmd/Ctrl + C`: Copy selected node
- `Cmd/Ctrl + V`: Paste copied node at mouse position
- `Cmd/Ctrl + Z`: Undo — **wire to existing `useHistory().undo()`** (already implemented in WorkflowCanvas.tsx, see Prompt 7)
- `Cmd/Ctrl + Shift + Z`: Redo — **wire to existing `useHistory().redo()`**
- `Cmd/Ctrl + A`: Select all nodes
- `Cmd/Ctrl + S`: Manual save (triggers immediate save to backend)
- `i`: Toggle inspector panel
- `Space + drag`: Pan canvas (React Flow default)
- `Scroll`: Zoom (React Flow default)

Show a small "?" icon in the top-right corner of the canvas. Clicking it shows a modal with all keyboard shortcuts.

### ConfigGate.tsx — Fix Node Count Display

`ConfigGate.tsx` displays `wf.graph_data?.nodes?.length` which will now include START and END, inflating the count by 2. A 3-node workflow would show as "5 nodes." Fix this:
```typescript
// Replace:
wf.graph_data?.nodes?.length
// With:
wf.graph_data?.nodes?.filter(n => !['start', 'end'].includes(n.type)).length
```

### ReActOnboarding.tsx — Verify Update

ReActOnboarding.tsx should have been updated in Prompt 6. Verify it reflects the new model: START → Agent Node (LLM ON, with tools) → END with a loopback edge. If Prompt 6 missed it, update now.

### Full Verification Checklist

After completing all prompts, verify:

**Canvas & Toolbar:**
- [ ] Only 3 items in toolbar: Node, Gate, Split
- [ ] START and END nodes auto-created on new workflow, cannot be deleted
- [ ] Node card turns blue when LLM ON, green when LLM OFF
- [ ] LLM toggle in Inspector changes node appearance immediately
- [ ] Bound tools show as chips on blue (LLM ON) nodes
- [ ] Selected tool name shows on green (LLM OFF) nodes
- [ ] Gate shows reviewer actions and timeout
- [ ] Split shows branch count and merge strategy
- [ ] Each node card shows 3 lines of MEANINGFUL summary (not generic text)

**Smart Edges:**
- [ ] Drawing a backward edge auto-detects as Loop (dashed cyan + ↻)
- [ ] Drawing a second edge from same node auto-detects as Conditional (amber)
- [ ] Edge Inspector shows different forms for Flow/Conditional/Loop
- [ ] Conditional edges show labels on canvas
- [ ] Edge type dropdown in Inspector changes visual style immediately

**Templates:**
- [ ] All 10 templates load correctly with proper layout
- [ ] Every template has START and END nodes
- [ ] Template picker shows all 10 options
- [ ] Quick Start on workflow list uses ReAct template

**Templates:**
- [ ] All template nodes have `data.componentType` set matching `type`
- [ ] ReActOnboarding.tsx updated to reflect new template structure

**Migration & Backward Compat:**
- [ ] Old workflows migrate on load (Decision nodes → conditional edges)
- [ ] START/END added to migrated workflows that lack them
- [ ] React Flow nodeTypes map includes old type aliases (step, decision, etc.)
- [ ] React Flow edgeTypes map includes old type aliases (deletable, loopback)
- [ ] Migration auto-saves to prevent re-migration
- [ ] entry_point/exit_point DB fields set to START/END node IDs on migration
- [ ] node.type and node.data.componentType are always identical (invariant enforced)

**Backend Execution:**
- [ ] Executor skips START and END nodes (no LLM call, no execution step)
- [ ] Executor handles "node" type — checks llmEnabled for LLM vs tool-only
- [ ] Executor reads systemPrompt with fallback to systemPromptHint
- [ ] Executor handles "gate" type — runs human review logic
- [ ] Executor handles "split" type — runs parallel logic
- [ ] Split fan-out: _get_next_nodes returns ALL outgoing targets for split nodes
- [ ] Executor follows conditional edges for routing (no Decision node needed)
- [ ] Executor respects loop edge max iterations
- [ ] _evaluate_with_llm uses lightweight model + non-streaming call
- [ ] Old type strings still work in executor (backward compat)
- [ ] Simulator functions are SYNC with **kwargs (not async with positional args)
- [ ] Simulator has @_reg for: node, gate, split, start
- [ ] Simulator has backward compat aliases: step, decision, parallel, etc.

**Workspace UI (Execution Traces):**
- [ ] TraceStep shows correct colors for NEW types (node=blue, gate=amber, split=purple, start=gray)
- [ ] TraceStep still shows correct colors for OLD types (agent_node, route, etc.)
- [ ] InspectorNode sidebar bar colors work for all types
- [ ] TimingBar colors work for all types
- [ ] No type string falls through to gray default (unless truly unknown)

**Architecture & State:**
- [ ] Graph manipulation (addNode, deleteNode, addEdge) is canvas-local — NOT in Zustand store
- [ ] Zustand store only holds REST CRUD + selectedElement — no React Flow state duplication
- [ ] Auto-save still lives in WorkflowCanvas.tsx (scheduleSave/performSave) — not moved
- [ ] Undo/redo uses existing useHistory() hook — not reimplemented
- [ ] ConfigGate.tsx node count excludes START/END nodes

**Interactions:**
- [ ] Right-click context menu works on nodes, edges, and canvas
- [ ] Delete + keyboard shortcuts work
- [ ] Cmd+Z/Cmd+Shift+Z wired to existing useHistory() undo/redo
- [ ] Auto-save persists to backend
- [ ] Backend validates new graph_data format (warnings, not blocks)
- [ ] Inspector switches between Node/Gate/Split/Edge forms correctly
- [ ] workflowTemplates.ts file NOT renamed — all imports still work
```

---

## Execution Order Summary

| # | Prompt | What it does | Depends on | Layer | Risk |
|---|--------|-------------|------------|-------|------|
| 1 | Types + Store | Foundation — types, selectedElement, componentType invariant | Nothing | Frontend | Low |
| 2 | Toolbar | 3-item toolbar + template dropdown | Prompt 1 | Frontend | Low |
| 3 | Custom Nodes | Visual node cards on canvas + old type aliases | Prompt 1 | Frontend | Low |
| 4 | Smart Edges | Auto-detection, visual styles, multi-output | Prompt 1 | Frontend | Medium |
| 5 | Inspector Forms | Unique forms per component/edge type | Prompts 1, 3 | Frontend | Low |
| 6 | Templates + ReActOnboarding | 10 pre-built workflows + onboarding update | Prompts 1-5 | Frontend | Low |
| 7 | Interactions | Delete, context menu, wire existing undo/redo | Prompts 1-5 | Frontend | Low |
| 8 | Migration | Convert old workflows + set entry_point/exit_point | Prompt 1 | Frontend | Medium |
| 9a | Backend Executor — Type Dispatch | Handle new node types (node/gate/split/start/end) | Prompt 1 | Backend | Low |
| 9b | Backend Executor — Edge Routing | Edge-based routing + graph traversal rewrite | Prompt 9a | Backend | **High** |
| 10 | Backend Simulator | Register new type simulators (sync, **kwargs) | Prompt 9a | Backend | Low |
| 11 | Backend Validation | Validate graph_data on save | Prompt 1 | Backend | Low |
| 12 | Workspace UI Colors | Update color maps in TraceStep, InspectorNode, TimingBar | **Nothing** | Frontend | Low |
| 13 | Polish & Verify | ConfigGate fix, minimap, grid, full checklist | All above | Both | Low |

**Recommended execution order:**
- **Start with Prompt 12** (workspace UI colors) — it has ZERO dependencies and prevents cosmetic breakage while testing everything else
- Prompts 3 and 4 can run in parallel
- Prompts 8, 9a, 10, 11, 12 are independent of each other — they CAN run in parallel
- **Prompt 9b depends on 9a** — run them sequentially. 9b is the highest-risk change (graph traversal rewrite). Test thoroughly before moving on.
- Prompt 13 must be last (verification)