# Workflow Canvas Revamp --- Dependency & Impact Map

> **Purpose**: Every file, type, constant, and code path that touches workflow node types, edge types, or graph_data. Use this as a checklist when writing revamp prompts to ensure nothing breaks.

---

## Table of Contents

1. [Type System (source of truth)](#1-type-system)
2. [Zustand Stores](#2-zustand-stores)
3. [Workflow Canvas Files (being replaced)](#3-workflow-canvas-files)
4. [Workspace / Execution UI (consumers --- NOT being replaced)](#4-workspace-execution-ui)
5. [Backend Execution Pipeline (consumers --- MUST update)](#5-backend-execution-pipeline)
6. [Backend Models & Routers (schema layer)](#6-backend-models--routers)
7. [Database Schema](#7-database-schema)
8. [Current Node Type String Map](#8-current-node-type-string-map)
9. [Current Edge Type Strings](#9-current-edge-type-strings)
10. [File-by-File Exact References](#10-file-by-file-exact-references)
11. [Critical Execution Paths](#11-critical-execution-paths)
12. [What Breaks If Only Frontend Changes](#12-what-breaks-if-only-frontend-changes)
13. [Compatibility Contract](#13-compatibility-contract)

---

## 1. Type System

### Frontend Types (`frontend/src/types/index.ts`)

```
Lines 58-61   GraphData           { nodes: Record<string,unknown>[]; edges: Record<string,unknown>[] }
Lines 63-77   WorkflowResponse    has graph_data: GraphData
Lines 79-86   WorkflowCreate      has graph_data?: GraphData
Lines 88-97   WorkflowUpdate      has graph_data?: GraphData
Lines 387-406 ExecutionStep       has node_type: string  (raw string, no enum)
Lines 372-383 ExecutionRun        has step_count, status, total_duration_ms, etc.
```

**Key**: `ExecutionStep.node_type` is an untyped `string`. Whatever the backend writes to `execution_steps.node_type` shows up here. The workspace UI reads this to pick colors and render traces.

### Frontend Node Data Interface (`frontend/src/components/workflows/CustomNodes/WorkflowNode.tsx`)

```typescript
// Lines 7-40 --- current WorkflowNodeData
interface WorkflowNodeData {
  label: string;
  nodeType: string;               // <-- drives canvas rendering via resolveNodeType()
  purpose?: string;
  boundTools?: string[];
  onMissingData?: string;
  onToolFailure?: string;
  onLowConfidence?: string;
  modelOverride?: string;
  guardrailOverride?: string;
  // Decision-specific
  conditionType?: string;
  conditionPrompt?: string;
  pathMappings?: string;
  // Parallel-specific
  branchCount?: number;
  fanOutMethod?: string;
  mergeMethod?: string;
  maxBranches?: number;
  // Human Review-specific
  displayContent?: string;
  humanOptions?: string;
  timeoutBehavior?: string;
  timeoutMinutes?: number;
  // Retriever-specific
  retrievalSource?: string;
  topK?: number;
  rerankingEnabled?: boolean;
  knowledgeLayers?: string;
  // Template hints
  systemPromptHint?: string;
  [key: string]: unknown;
}
```

**Two separate type fields exist on every node in graph_data:**
| Field | Where | Purpose | Who reads it |
|---|---|---|---|
| `node.type` | Top-level React Flow field | React Flow component routing + backend execution dispatch | `WorkflowCanvas.tsx` nodeTypes map, `workflow_executor.py`, `execution_simulator.py` |
| `node.data.nodeType` | Inside node data | Canvas rendering (color, icon, inspector form) | `WorkflowNode.tsx`, `NodeInspector.tsx` via `resolveNodeType()` |

Both are always set to the same string by template factories and the onDrop handler.

### Backend Pydantic Models (`backend/app/models/workflow.py`)

```python
class GraphData(BaseModel):
    nodes: list[dict[str, Any]] = []    # No node type validation
    edges: list[dict[str, Any]] = []    # No edge type validation

class WorkflowBase(BaseModel):
    graph_data: GraphData = Field(default_factory=GraphData)
```

**Key**: `GraphData` is fully schema-agnostic. It stores whatever React Flow gives it. No server-side node type validation exists today.

### Backend Execution Models (`backend/app/models/execution.py`)

```python
# Line 31 --- ExecutionStepCreate
node_type: str       # untyped string

# Line 44 --- ExecutionStepResponse
node_type: str       # untyped string
```

---

## 2. Zustand Stores

### `frontend/src/stores/workflow-store.ts`

| Export | Type | What it does |
|---|---|---|
| `useWorkflowStore` | Zustand store | CRUD for workflows, holds `currentWorkflow: WorkflowResponse` |

**Actions that touch graph_data:**
| Action | API Call | Notes |
|---|---|---|
| `createWorkflow(data)` | `POST /workflows` | `data.graph_data` comes from templates or empty `{nodes:[],edges:[]}` |
| `updateWorkflow(id, data)` | `PATCH /workflows/<id>` | `data.graph_data` contains full React Flow state (nodes+edges) |
| `fetchWorkflow(id)` | `GET /workflows/<id>` | Response includes `graph_data` which canvas loads |

**Consumers of this store:**
- `WorkflowCanvas.tsx` --- reads `currentWorkflow`, calls `updateWorkflow` on auto-save
- `WorkflowList.tsx` --- calls `createWorkflow`, reads `workflows[]`
- `ConfigGate.tsx` --- reads workflow name and `graph_data.nodes.length` for display

### `frontend/src/stores/execution-store.ts`

| Export | Type | What it does |
|---|---|---|
| `useExecutionStore` | Zustand store | Holds streaming execution state, step progress, config snapshot |

**Fields that carry node_type:**
- `activeSteps: ExecutionStep[]` --- each step has `node_type: string` from WebSocket events
- `inspectorSteps: ExecutionStep[]` --- fetched via REST, same shape

**Who writes node_type into execution steps:**
- Backend `workflow_executor.py` line 415: `"node_type": node_type` (reads from `node.get("type", "step")`)
- Backend `execution_simulator.py` line 771: `"node_type": node_type` (reads from `node.get("type", "agent_node")`)

### `frontend/src/stores/tool-store.ts`

Used by `NodeInspector.tsx` to list available tools for binding. Not directly affected by node type changes, but the inspector form structure will change.

---

## 3. Workflow Canvas Files (being replaced)

These files ARE the revamp target. Listed here with their exports so prompts know what to replace.

### `frontend/src/components/workflows/nodeTypes.ts`

```
Export: NODE_TYPE_CONFIGS     Array of 4 canonical types: step, decision, parallel, human_review
Export: NODE_TYPE_MAP         Record<string, NodeTypeConfig> keyed by type string
Export: LEGACY_MAP            Maps 9 old types to 4 canonical types
Export: resolveNodeType()     Returns canonical type for any input string
```

**Imported by:** `WorkflowCanvas.tsx`, `NodeInspector.tsx`, `WorkflowNode.tsx`, `NodeToolbar.tsx`

### `frontend/src/components/workflows/NodeToolbar.tsx`

```
Export: default NodeToolbar
Props:  { onAddNode: (nodeType: string) => void }
```

Iterates `NODE_TYPE_CONFIGS` to render 4 toolbar items. Sets drag data as `"application/workflow-node-type"`.

### `frontend/src/components/workflows/CustomNodes/WorkflowNode.tsx`

```
Export: WorkflowNodeData (interface)
Export: default WorkflowNode (React Flow node component)
```

**Imported by:** `WorkflowCanvas.tsx` (nodeTypes map), `NodeInspector.tsx` (type import)

Single component renders ALL node types. Uses `resolveNodeType(data.nodeType)` to pick color/icon.

### `frontend/src/components/workflows/NodeInspector.tsx`

```
Export: default NodeInspector
Props:  { node, edges, onUpdate, onUpdateEdge, onClose, onDeleteNode }
```

Has 8 conditional blocks gated on `nodeType === "step" | "decision" | "parallel" | "human_review"`.

**Imports from workflow files:** `NODE_TYPE_MAP`, `resolveNodeType`, `WorkflowNodeData`, `LoopbackEdgeData`, `useToolStore`, `ModelSelect`, `useAvailableModels`

### `frontend/src/components/workflows/WorkflowCanvas.tsx`

```
Export: default WorkflowCanvas (wrapped in ReactFlowProvider)
```

**The hub file. Imports from:**
- `workflow-store` (Zustand)
- `NodeToolbar`, `NodeInspector`, `EdgeInspector`
- `WorkflowNode` (custom node component)
- `DeletableEdge`, `LoopbackEdge` (custom edge components)
- `NODE_TYPE_MAP` from `nodeTypes.ts`
- `TemplatePicker`, `ReActOnboarding`
- `workflowTemplates` types

**nodeTypes registration map (line 279-296):** Maps 13 type strings to `WorkflowNode`:
```
step, decision, parallel, human_review,
retriever, agent_node, route, parallelization,
loop, plan_and_execute, human_checkpoint, classifier, validator
```

**edgeTypes registration:** `deletable: DeletableEdge`, `loopback: LoopbackEdge`

**onDrop handler:** Reads `"application/workflow-node-type"` from drag data, creates node with `data.nodeType` set.

**onConnect handler:** Detects loopback (target.y < source.y) vs normal edge.

**graph_data read:** `currentWorkflow.graph_data.nodes/edges` -> React Flow state
**graph_data write:** `nodesRef.current/edgesRef.current` -> `updateWorkflow({ graph_data: {...} })`

### `frontend/src/components/workflows/workflowTemplates.ts`

```
Export: WorkflowTemplateGraph (interface)
Export: WorkflowTemplate (interface)
Export: WORKFLOW_TEMPLATES (array of 7 templates)
```

Factory functions create nodes with BOTH `type:` and `data.nodeType:` set to same string.

Node types used: `"step"`, `"decision"`, `"parallel"`, `"human_review"`
Edge types used: `"deletable"`, `"loopback"`

Templates: `react_agent`, `simple_chain`, `parallel_analysis`, `chain_with_validation`, `human_in_the_loop`, `classifier_router`, `blank`

### `frontend/src/components/workflows/EdgeInspector.tsx`

Edge configuration panel. Will be replaced by edge inspector in Prompt 5.

### `frontend/src/components/workflows/LoopbackEdge.tsx`

```
Export: LoopbackEdgeData (interface: { label, loopCondition, maxIterations, exitThreshold, exitNodeId })
Export: default LoopbackEdge (custom React Flow edge component)
```

Dashed cyan line with loop icon. Will be replaced by SmartEdge in Prompt 4.

### `frontend/src/components/workflows/CustomEdge.tsx` (DeletableEdge)

Standard edge with delete button on hover. Will be replaced by SmartEdge in Prompt 4.

### `frontend/src/components/workflows/TemplatePicker.tsx`

Template selection dialog. Reads `WORKFLOW_TEMPLATES`. Will be updated in Prompt 2/6.

### `frontend/src/components/workflows/ReActOnboarding.tsx`

Onboarding overlay for ReAct template. May need updating if ReAct template structure changes.

### `frontend/src/components/workflows/WorkflowList.tsx`

Creates workflows with graph_data from templates. Reads `WORKFLOW_TEMPLATES`. Routes to canvas.

**Key code paths:**
- Template creation (line 89-114): `createWorkflow({ graph_data: { nodes: graph.nodes, edges: graph.edges } })`
- Quick Start (line 118-139): Same pattern using `react_agent` template
- Display (line 149): `wf.graph_data?.nodes?.length || 0` for node count

---

## 4. Workspace / Execution UI (consumers --- NOT being replaced)

These files display execution results. They read `node_type` from `ExecutionStep` objects (which come from the DB via backend). **They are NOT part of the canvas revamp but WILL break if node_type strings change without updating their color maps.**

### `frontend/src/components/workspace/TraceStep.tsx`

**NODE_COLORS map (lines 24-42):**
```typescript
const NODE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
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
};
const DEFAULT_COLOR = { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200" };
```

**Usage:** `NODE_COLORS[step.node_type] || DEFAULT_COLOR` (line 67)

**MISSING entries for new types:** `node`, `gate`, `split`, `start` --- will fall to gray DEFAULT_COLOR.

### `frontend/src/components/workspace/InspectorNode.tsx`

**NODE_BAR map (lines 28-42):**
```typescript
const NODE_BAR: Record<string, string> = {
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
  end: "bg-gray-300",
};
```

**Usage:** `NODE_BAR[step.node_type] || "bg-slate-400"` (line 74)

**Special conditional:** Line 243: `step.node_type === "retriever"` --- renders a "Knowledge Retrieved" section with documents.

**MISSING entries for new types:** `node`, `gate`, `split`, `start`, `step`, `decision`, `parallel`, `direct_llm`

### `frontend/src/components/workspace/TimingBar.tsx`

**NODE_BG map (lines 13-27):**
```typescript
const NODE_BG: Record<string, string> = {
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
  end: "bg-gray-300",
};
```

**Usage:** `NODE_BG[step.node_type] || "bg-slate-400"` (line 43)

**MISSING entries for new types:** same gap as InspectorNode.

### `frontend/src/components/workspace/ChatInput.tsx`

**Lines 256-262:** Reads `node_type` from WebSocket `step_started` event and stores it in local `ExecutionStep`:
```typescript
node_type: data.node_type as string,
```

**Lines 183-188:** Passes `node_type` in inspector context metadata:
```typescript
inspector_context: {
  step_id: selectedStep.id,
  step_number: selectedStep.step_number,
  node_name: selectedStep.node_name,
  node_type: selectedStep.node_type,    // <-- raw string passthrough
},
```

**Not type-sensitive** --- passes through whatever string the backend sends.

### `frontend/src/components/workspace/ExecutionTraceCard.tsx`

Reads `configSnapshot` for display mode. Renders `TraceStep` components. **Not type-sensitive** itself, but delegates to `TraceStep` which IS type-sensitive.

### `frontend/src/components/workspace/ConfigGate.tsx`

**Line 191:** `{wf.graph_data?.nodes?.length ?? 0} nodes` --- purely cosmetic node count. **Not type-sensitive.**

---

## 5. Backend Execution Pipeline (consumers --- MUST update)

### `backend/app/services/workflow_executor.py` (LIVE LLM execution)

**How it reads node types:**
```python
# Line 404 --- reads React Flow node.type from graph_data
node_type = node.get("type", "step")

# Lines 415, 425 --- writes to execution_steps DB table
"node_type": node_type,
```

**Type-specific execution branches:**
```python
# Line 446 --- Decision handling
if node_type == "decision":
    # Reads conditions from node.data, evaluates routing
    # If no conditions: pass through

# Line 471 --- Human Review handling
elif node_type == "human_review":
    # Auto-approves (simulated)

# Line 490 --- Parallel handling
elif node_type == "parallel":
    # Sends "process in parallel" prompt to LLM

# else: (line 496)
    # Treated as regular LLM step
```

**Fallback direct_llm path (lines 206, 216):**
```python
"node_type": "direct_llm",    # Hardcoded string for non-workflow fallback
"node_name": f"Direct Chat ({model})",
```

**WHAT MUST CHANGE:**
1. Skip `start` and `end` nodes during execution (currently iterates ALL nodes)
2. Map `"gate"` to the human_review logic
3. Map `"split"` to the parallel logic
4. Handle `"node"` type --- read `node.data.llmEnabled` to decide LLM call vs tool-only
5. Read conditional edge data for routing (replaces Decision node logic)

### `backend/app/services/execution_simulator.py` (simulated execution)

**Registered simulators via `@_reg` decorators:**
```
@_reg("agent_node")       Lines 496-503    LLM agent simulation
@_reg("route")            Lines 505-517    Routing/decision simulation
@_reg("retriever")        Lines 519-528    Document retrieval simulation
@_reg("calculator")       Lines 530-538    Calculation simulation
@_reg("validator")        Lines 540-550    Validation simulation
@_reg("file_writer")      Lines 552-588    File operation simulation
@_reg("parallelization")  Lines 590-598    Parallel branch simulation
@_reg("loop")             Lines 600-608    Loop iteration simulation
@_reg("human_review")     Lines 610-617    Auto-approve simulation
@_reg("end")              Lines 619-625    End node simulation
```

**Dispatch (line 805):**
```python
node_type = node.get("type", "agent_node")      # default is "agent_node"
simulator = NODE_SIMULATORS.get(node_type, _default_sim)
```

**MISSING simulators for:** `node`, `gate`, `split`, `start`, `step`, `decision`, `parallel`, `direct_llm`

All of these fall through to `_default_sim` which returns generic "Step completed" output.

**WHAT MUST CHANGE:**
1. Add `@_reg("node")` --- check `llmEnabled` in node data
2. Add `@_reg("gate")` --- reuse human_review logic
3. Add `@_reg("split")` --- reuse parallelization logic
4. Add `@_reg("start")` and `@_reg("end")` --- passthrough/no-op
5. Consider adding aliases for canonical types: `@_reg("step")`, `@_reg("decision")`, `@_reg("parallel")`

### `backend/app/services/prompt_injector.py`

Reads config dict to build system prompt injections. **Not type-sensitive.** No changes needed.

### `backend/app/routers/stream.py`

```python
# Line 9
from app.services.workflow_executor import execute_workflow

# Line 140 --- invokes the executor
task = asyncio.create_task(execute_workflow(thread_id, user_message, send_event))
```

**Not type-sensitive** --- just passes through to executor. No changes needed unless WebSocket event schema changes.

---

## 6. Backend Models & Routers

### `backend/app/models/workflow.py`

```python
class GraphData(BaseModel):
    nodes: list[dict[str, Any]] = []    # Accepts anything
    edges: list[dict[str, Any]] = []    # Accepts anything
```

**No node type validation.** Prompt 9 should add optional validation here.

### `backend/app/models/execution.py`

```python
class ExecutionStepCreate(BaseModel):
    node_type: str      # Accepts any string

class ExecutionStepResponse(BaseModel):
    node_type: str      # Returns any string
```

**No enum constraint.** Safe for any new type strings.

### `backend/app/routers/workflows.py`

Standard CRUD router. Stores/returns graph_data as-is. **Not type-sensitive.**

### `backend/app/services/workflow_service.py`

If it exists, may have validation logic. Prompt 9 should add `validate_graph()` here.

---

## 7. Database Schema

### `execution_steps` table (`backend/database/supabase/phase2_schema.sql`, line 56)

```sql
node_type TEXT NOT NULL
```

**No CHECK constraint.** Accepts any string. Old execution records will keep old type strings (`"agent_node"`, `"route"`, etc.) forever. New records will have new type strings (`"node"`, `"gate"`, `"split"`).

The workspace UI must handle BOTH old and new strings in color maps.

### `workflows` table (`backend/database/supabase/schema.sql`, line 51)

```sql
graph_data JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}'
```

**Schema-agnostic.** Stores whatever React Flow gives it. No migration needed.

### `configurations` table (`backend/database/supabase/schema.sql`, line 175)

```sql
routing_fallback TEXT NOT NULL DEFAULT 'default_path'
    CHECK (routing_fallback IN ('default_path', 'error_node', 'human_review', 'retry_with_primary'))
```

Contains `"human_review"` as a config VALUE (routing fallback option), NOT a node type. **No change needed** --- this is a configuration concept, not a canvas concept.

---

## 8. Current Node Type String Map

### Where each string appears across the codebase

| Type String | Canvas (nodeTypes.ts) | Templates | Executor | Simulator | TraceStep Colors | InspectorNode Colors | TimingBar Colors |
|---|---|---|---|---|---|---|---|
| `"step"` | CANONICAL | YES | default fallback | MISSING | YES | MISSING | MISSING |
| `"decision"` | CANONICAL | YES | if-branch | MISSING | YES | MISSING | MISSING |
| `"parallel"` | CANONICAL | YES | elif-branch | MISSING | YES | MISSING | MISSING |
| `"human_review"` | CANONICAL | YES | elif-branch | `@_reg` | YES | YES | YES |
| `"agent_node"` | LEGACY->step | no | no | `@_reg` | YES | YES | YES |
| `"route"` | LEGACY->decision | no | no | `@_reg` | YES | YES | YES |
| `"parallelization"` | LEGACY->parallel | no | no | `@_reg` | YES | YES | YES |
| `"retriever"` | LEGACY->step | no | no | `@_reg` | YES | YES (+ special) | YES |
| `"classifier"` | LEGACY->decision | no | no | no | YES | YES | YES |
| `"loop"` | LEGACY->step | no | no | `@_reg` | YES | YES | YES |
| `"validator"` | LEGACY->step | no | no | `@_reg` | YES | YES | YES |
| `"calculator"` | no | no | no | `@_reg` | YES | YES | YES |
| `"code_interpreter"` | no | no | no | no | YES | YES | YES |
| `"file_writer"` | no | no | no | `@_reg` | YES | YES | YES |
| `"summarizer"` | no | no | no | no | YES | YES | YES |
| `"end"` | no | no | no | `@_reg` | YES | YES | YES |
| `"direct_llm"` | no | no | hardcoded | no | YES | MISSING | MISSING |

### NEW type strings (after revamp)

| New Type | Replaces | Canvas | Executor needs | Simulator needs | TraceStep needs | InspectorNode needs | TimingBar needs |
|---|---|---|---|---|---|---|---|
| `"node"` | step, agent_node, classifier, retriever, validator | YES | LLM vs tool-only branch | `@_reg("node")` | color entry | color entry | color entry |
| `"gate"` | human_review, human_checkpoint | YES | human review branch | `@_reg("gate")` | color entry | color entry | color entry |
| `"split"` | parallel, parallelization | YES | parallel branch | `@_reg("split")` | color entry | color entry | color entry |
| `"start"` | (new) | YES | SKIP during execution | `@_reg("start")` no-op | color entry | color entry | color entry |
| `"end"` | end | YES | SKIP during execution | already has `@_reg` | already has entry | already has entry | already has entry |

---

## 9. Current Edge Type Strings

### Frontend edge types stored in graph_data

| Edge `type` field | Component | Description |
|---|---|---|
| `"deletable"` | `DeletableEdge` (`CustomEdge.tsx`) | Standard edge with hover delete |
| `"loopback"` | `LoopbackEdge` (`LoopbackEdge.tsx`) | Dashed cyan backward edge |
| (default) | React Flow default | Edges loaded from old data with no type |

### New edge types (after revamp)

| New Edge `type` | Replaces | `data.edgeType` | Visual |
|---|---|---|---|
| `"smart"` | `"deletable"` + `"loopback"` + default | `"flow"` | Solid gray line |
| `"smart"` | (same component) | `"conditional"` | Solid amber line + label pill |
| `"smart"` | (same component) | `"loop"` | Dashed cyan line + loop icon |

### LoopbackEdge data shape (current)

```typescript
interface LoopbackEdgeData {
  label: string;
  loopCondition: string;
  maxIterations: number;
  exitThreshold: number;
  exitNodeId: string;
}
```

### Backend edge handling

**The backend currently IGNORES all edge data.** `workflow_executor.py` only reads `graph_data.edges` for topological sorting (source/target), never reads edge type or data.

After the revamp, the backend MUST read conditional edge data to evaluate routing (since Decision nodes are being removed and routing moves to edges).

---

## 10. File-by-File Exact References

### Files that MUST change (part of the revamp)

| File | Path | What changes |
|---|---|---|
| Type definitions | `frontend/src/types/index.ts` | Add `WorkflowComponentType`, `WorkflowEdgeType`, new interfaces |
| Workflow store | `frontend/src/stores/workflow-store.ts` | Add `addNode`, `updateNodeData`, `addEdge`, etc. |
| Node type config | `frontend/src/components/workflows/nodeTypes.ts` | Replace entirely with new 5-type system |
| Toolbar | `frontend/src/components/workflows/NodeToolbar.tsx` | Replace with 3-item toolbar |
| Canvas | `frontend/src/components/workflows/WorkflowCanvas.tsx` | New nodeTypes map, onConnect, onDrop |
| Custom node | `frontend/src/components/workflows/CustomNodes/WorkflowNode.tsx` | Split into WorkflowNode, GateNode, SplitNode, StartEndNode |
| Inspector | `frontend/src/components/workflows/NodeInspector.tsx` | Split into per-type form components |
| Edge inspector | `frontend/src/components/workflows/EdgeInspector.tsx` | Replace with new edge forms |
| Templates | `frontend/src/components/workflows/workflowTemplates.ts` | Rewrite all 7 templates + add 3 new ones |
| Deletable edge | `frontend/src/components/workflows/CustomEdge.tsx` | Replace with SmartEdge |
| Loopback edge | `frontend/src/components/workflows/LoopbackEdge.tsx` | Replace with SmartEdge |
| Template picker | `frontend/src/components/workflows/TemplatePicker.tsx` | Update to show 10 templates |
| Workflow list | `frontend/src/components/workflows/WorkflowList.tsx` | Update template creation code |
| Backend workflow model | `backend/app/models/workflow.py` | Add optional graph_data validation |
| Backend executor | `backend/app/services/workflow_executor.py` | Handle new types + edge-based routing |
| Backend simulator | `backend/app/services/execution_simulator.py` | Register new type simulators |

### Files that MUST be updated as a SIDE EFFECT (not part of canvas, but will break)

| File | Path | What to add | Why |
|---|---|---|---|
| TraceStep | `frontend/src/components/workspace/TraceStep.tsx` | Add `node`, `gate`, `split`, `start` to `NODE_COLORS` | Execution traces will show gray for new types |
| InspectorNode | `frontend/src/components/workspace/InspectorNode.tsx` | Add `node`, `gate`, `split`, `start`, `step`, `decision`, `parallel`, `direct_llm` to `NODE_BAR` | Inspector sidebar will show gray bars |
| TimingBar | `frontend/src/components/workspace/TimingBar.tsx` | Add same entries to `NODE_BG` | Timing visualization will lose color coding |

### Files that are SAFE (no changes needed)

| File | Path | Why safe |
|---|---|---|
| ChatInput | `frontend/src/components/workspace/ChatInput.tsx` | Passes `node_type` through as raw string, no branching |
| ExecutionTraceCard | `frontend/src/components/workspace/ExecutionTraceCard.tsx` | Delegates to TraceStep, not type-sensitive itself |
| ConfigGate | `frontend/src/components/workspace/ConfigGate.tsx` | Only reads `nodes.length`, not types |
| ConfigForm | `frontend/src/components/configurations/ConfigForm.tsx` | `"human_review"` here is a config value, not a node type |
| ToolCard | `frontend/src/components/tools/ToolCard.tsx` | `"validator"` here is a tool name |
| stream.py | `backend/app/routers/stream.py` | Just invokes executor, no type logic |
| prompt_injector.py | `backend/app/services/prompt_injector.py` | Config-driven, not type-sensitive |
| execution-store.ts | `frontend/src/stores/execution-store.ts` | Stores steps as-is, no type branching |
| workspace-store.ts | `frontend/src/stores/workspace-store.ts` | No workflow type references |

---

## 11. Critical Execution Paths

### Path A: User sends message -> Live LLM execution

```
ChatInput.tsx (WebSocket)
  -> stream.py (WebSocket handler)
    -> workflow_executor.py: execute_workflow()
      -> _get_thread_context()          reads workflow.graph_data
      -> _get_nodes_in_order()          topological sort of graph_data.nodes
      -> _execute_workflow_graph()      iterates nodes
        -> node.get("type", "step")     <-- READS NODE TYPE STRING
        -> if "decision": ...           <-- TYPE-SPECIFIC BRANCH
        -> elif "human_review": ...     <-- TYPE-SPECIFIC BRANCH
        -> elif "parallel": ...         <-- TYPE-SPECIFIC BRANCH
        -> else: LLM call              <-- DEFAULT BRANCH
        -> execution_steps.insert(node_type=...)  <-- WRITES TO DB
      -> send_event(step_started, node_type=...)  <-- SENDS VIA WEBSOCKET
  <- ChatInput.tsx handleWsEvent()
    <- addStep({ node_type: data.node_type })     <-- STORED IN ZUSTAND
      <- TraceStep renders with NODE_COLORS[step.node_type]  <-- COLORS
```

**Breakage point**: If canvas saves `"node"` but executor only handles `"step"/"decision"/"human_review"/"parallel"`, new-type nodes all execute as plain LLM calls.

### Path B: Execution trace in Inspector (post-hoc)

```
ExecutionInspector.tsx
  -> fetchRunSteps(runId) via REST
    -> GET /runs/:id/steps
      -> execution_steps table (node_type column)  <-- READS FROM DB
  -> InspectorNode.tsx renders with NODE_BAR[step.node_type]  <-- COLORS
  -> TimingBar.tsx renders with NODE_BG[step.node_type]        <-- COLORS
```

**Breakage point**: Old execution records have old type strings. New records have new type strings. Color maps must handle BOTH.

### Path C: Workflow created/saved

```
WorkflowList.tsx or WorkflowCanvas.tsx
  -> createWorkflow/updateWorkflow (Zustand action)
    -> POST/PATCH /workflows (REST)
      -> workflows table graph_data JSONB  <-- STORES FULL REACT FLOW STATE
```

**No breakage** --- JSONB stores anything.

### Path D: Workflow loaded into canvas

```
WorkflowCanvas.tsx
  -> fetchWorkflow(id) (Zustand action)
    -> GET /workflows/:id (REST)
      -> workflows table graph_data JSONB
  -> graph_data.nodes cast to Node[]
  -> migrateLoopNodes() applied         <-- MIGRATION FUNCTION (currently only handles "loop")
  -> nodes rendered via nodeTypes map   <-- REACT FLOW COMPONENT LOOKUP
```

**Breakage point**: Old workflows have old type strings. The nodeTypes map must include entries for old types (or migration must convert them first).

---

## 12. What Breaks If Only Frontend Changes

If the revamp ONLY changes frontend files and does NOT update backend:

| Scenario | What happens | Severity |
|---|---|---|
| New workflow with `"node"` type node | Executor treats as plain LLM step (no special logic) | MEDIUM --- works but loses gate/split behavior |
| New workflow with `"gate"` type node | Executor treats as plain LLM step (skips auto-approve logic) | HIGH --- gate does nothing |
| New workflow with `"split"` type node | Executor treats as plain LLM step (no parallel fan-out) | HIGH --- split does nothing |
| New workflow with `"start"` node | Executor calls LLM on START node (wastes tokens) | MEDIUM --- unnecessary LLM call |
| New workflow with `"end"` node | Executor calls LLM on END node (wastes tokens) | MEDIUM --- unnecessary LLM call |
| New workflow with conditional edges | Executor ignores edge data entirely (no routing) | HIGH --- all edges treated as flow |
| New workflow with loop edges | Executor ignores edge data (no looping) | HIGH --- no iteration |
| Execution traces for new types | TraceStep shows gray (DEFAULT_COLOR) | LOW --- cosmetic |
| Inspector for new types | InspectorNode shows gray bar | LOW --- cosmetic |
| Old workflows loaded | Migration (Prompt 8) converts on load, re-saves | OK if migration is correct |

---

## 13. Compatibility Contract

### What the revamp prompts MUST guarantee

1. **Frontend migration (Prompt 8) must convert old graph_data before canvas renders it.**
   - Old `node.type` strings -> new `node.type` strings
   - Old edge types -> new `"smart"` edge with `data.edgeType`
   - Add START/END if missing
   - Re-save migrated data to backend so it doesn't re-migrate

2. **Backend executor (Prompt 9) must handle new type strings.**
   - `"start"` and `"end"` -> skip (no LLM call)
   - `"node"` -> check `node.data.llmEnabled` (true = LLM call, false = tool-only)
   - `"gate"` -> human review logic
   - `"split"` -> parallel execution logic
   - Read `edge.data.edgeType` and `edge.data.conditionMethod` for routing
   - Keep handling old type strings during transition (or rely on frontend migration)

3. **Backend simulator must register new types.**
   - `@_reg("node")`, `@_reg("gate")`, `@_reg("split")`, `@_reg("start")`

4. **Workspace UI color maps must include new types.**
   - `TraceStep.tsx` NODE_COLORS: add `node`, `gate`, `split`, `start`
   - `InspectorNode.tsx` NODE_BAR: add `node`, `gate`, `split`, `start`, `step`, `decision`, `parallel`, `direct_llm`
   - `TimingBar.tsx` NODE_BG: add same as InspectorNode

5. **Both old AND new type strings must be in color maps** because:
   - Old execution records in the DB keep old type strings forever
   - New execution records will have new type strings
   - Both may be viewed in the same session

### Suggested color assignments for new types

```typescript
// For TraceStep, InspectorNode, TimingBar
node:     blue-500   (when llmEnabled) / green-500 (when tool-only) --- or just blue as default
gate:     amber-500
split:    purple-500
start:    gray-400
end:      gray-300   (already exists)
```

### React Flow nodeTypes map must include old types during transition

```typescript
const nodeTypes = {
  // New types
  node: WorkflowNode,
  gate: GateNode,
  split: SplitNode,
  start: StartEndNode,
  end: StartEndNode,
  // Old types (for un-migrated workflows loaded before migration runs)
  step: WorkflowNode,
  decision: WorkflowNode,
  parallel: WorkflowNode,
  human_review: WorkflowNode,
  agent_node: WorkflowNode,
  route: WorkflowNode,
  // ... etc
};
```

---

## Appendix: Import/Export Dependency Graph

```
nodeTypes.ts
  exports: NODE_TYPE_CONFIGS, NODE_TYPE_MAP, LEGACY_MAP, resolveNodeType
  imported by: WorkflowCanvas, NodeInspector, WorkflowNode, NodeToolbar

WorkflowNode.tsx
  exports: WorkflowNodeData (interface), WorkflowNode (component)
  imported by: WorkflowCanvas (nodeTypes map), NodeInspector (type import)

workflowTemplates.ts
  exports: WorkflowTemplate, WORKFLOW_TEMPLATES
  imported by: WorkflowCanvas, WorkflowList, TemplatePicker

LoopbackEdge.tsx
  exports: LoopbackEdgeData (interface), LoopbackEdge (component)
  imported by: WorkflowCanvas (edgeTypes map), NodeInspector (edge editing)

CustomEdge.tsx
  exports: DeletableEdge (component)
  imported by: WorkflowCanvas (edgeTypes map)

NodeToolbar.tsx
  exports: NodeToolbar
  imported by: WorkflowCanvas

NodeInspector.tsx
  exports: NodeInspector
  imported by: WorkflowCanvas

EdgeInspector.tsx
  exports: EdgeInspector
  imported by: WorkflowCanvas

workflow-store.ts
  exports: useWorkflowStore
  imported by: WorkflowCanvas, WorkflowList, ConfigGate

execution-store.ts
  exports: useExecutionStore
  imported by: ChatInput, ExecutionTraceCard, TraceStep, InspectorNode, TimingBar

tool-store.ts
  exports: useToolStore
  imported by: NodeInspector (tool binding list)
```
