# AI Product Studio

## What This Is
A configurable workbench for AI Product Managers to make product-level decisions about agentic AI systems visible, testable, and evidence-based. PMs configure domains, workflows, tools, prompts, guardrails, and configurations — then run tasks to see how different settings affect AI output.

## Tech Stack
- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Python FastAPI, Pydantic v2 for validation
- **Database**: Supabase (PostgreSQL), accessed via supabase-py
- **Workflow Canvas**: React Flow (@xyflow/react)
- **State Management**: Zustand
- **Auth**: Supabase Auth (email + password for v1)

## Project Structure
ai-product-studio/
├── CLAUDE.md
├── frontend/
│   ├── src/
│   │   ├── app/                    # Next.js App Router pages
│   │   │   ├── layout.tsx
│   │   │   │   │   ├── domains/
│   │   │   │   ├── page.tsx        # Domain list
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx    # Domain settings
│   │   │   ├── workflows/
│   │   │   │   ├── page.tsx        # Workflow list
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx    # Workflow canvas editor
│   │   │   ├── tools/
│   │   │   │   └── page.tsx        # Tool Registry
│   │   │   ├── knowledge/
│   │   │   │   └── page.tsx        # Knowledge Base
│   │   │   ├── prompts/
│   │   │   │   ├── page.tsx        # Prompt Lab list
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx    # Prompt editor
│   │   │   ├── guardrails/
│   │   │   │   └── page.tsx        # Guardrail Priorities
│   │   │   └── configurations/
│   │   │       └── page.tsx    # Configuration list + detail
│   │   ├── components/
│   │   │   ├── ui/                 # shadcn/ui components
│   │   │   ├── layout/             # Shell, Sidebar, Topbar
│   │   │   ├── domains/            # Domain-specific components
│   │   │   ├── workflows/          # Canvas, NodeInspector, Toolbar
│   │   │   ├── tools/              # ToolCard, ToolRegistry
│   │   │   ├── knowledge/          # KBManager, DocumentList
│   │   │   ├── prompts/            # PromptEditor, VersionList, DiffView
│   │   │   ├── guardrails/         # PriorityList, DragReorder
│   │   │   └── configurations/     # ConfigForm, ConfigDetail
│   │   ├── lib/
│   │   │   ├── supabase.ts         # Supabase client
│   │   │   ├── api.ts              # API client wrapper
│   │   │   └── utils.ts
│   │   ├── stores/                 # Zustand stores
│   │   │   ├── domain-store.ts
│   │   │   ├─ tailwind.config.ts
│   └── tsconfig.json
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI app entry
│   │   ├── config.py               # Environment config
│   │   ├── database.py             # Supabase client setup
│   │   ├── models/                 # Pydantic models
│   │   │   ├── domain.py
│   │   │   ├── workflow.py
│   │   │   ├── tool.py
│   │   │   ├── knowledge.py
│   │   │   ├── prompt.py
│   │   │   ├── guardrail.py
│   │   │   └── configuration.py
│   │   ├── routers/                # API route handlers
│   │   │   ├── domains.py
│   │   │   ├── workflows.py
│   │   │   ├── tools.py
│   │   │   ├── knowledge.py
│   │   │   ├── prompts.py
│   │   │   ├── guardrails.py
│   │   │   └── configurations.py
│   │   └── services/  └── configuration_service.py
│   ├── requirements.txt
│   └── .env
└── supabase/
    └── schema.sql                  # Database schema

## Core Architecture Rules (DO NOT VIOLATE)

1. **Configuration is IMMUTABLE** — Once created, a configuration cannot be edited or deleted. To change settings, create a new configuration. This is enforced at the API level — no PUT/PATCH/DELETE endpoints for configurations.

2. **Domain is a NAMESPACE** — Domain does NOT filter tools, knowledge, or capabilities. It exists only for memory isolation and enterprise-level settings (base prompt, enterprise KB, enterprise guardrails file). All registered tools are available in every domain.

3. **Tool binding happens PER-NODE** — Tools are registered globally in the Tool Registry. They are bound to specific workflow nodes via the Node Inspector in the Workflow Canvas. There is no separate "tool configuration" screen.

4. **Knowledge retrieval is DYNAMIC** — The system decides what knowledge bases are not locked to domains. The Knowledge Base tool manages what knowledge exists; the Configuration defines how retrieval behaves.

5. **Behavioral settings live in Configuration** — Tool behavior (timeout, retry, result handling), guardrail ordering, persona parameters, RAG settings, missing info strategy — ALL of these are in the Configuration, not scattered across individual tools.

6. **Prompt Lab is FREE-TEXT** — The system prompt is a free-text editor, not a structured form with persona templates. PMs write prompts in natural language. Presets exist as starting points only.

## API Patterns

- All list endpoints return paginated results: `{ data: [...], count: number, page: number }`
- All create endpoints return the created object with its ID
- Use Supabase RLS (Row Level Security) for multi-tenancy
- Timestamps use ISO 8601 format
- IDs are UUIDs generated by Supabase

## Naming Conventions

- **Python**: snake_case for variables, functions, files. PascalCase for Pydantic models.
- **TypeScript**: camelCase for variables/functions. PascalCase for components and types.
- **Database**: snake_case for tables and columns.
- **API routes**: kebab-case for URLs, e.g., `/api/v1/knowledge-base`
- **Components**: PascalCase files, one component per file.

## Key Data Relationships

- Domain → has many Workflows
- Domain → has one Base Prompt
- Domain → has many Enterprise Documents (Layer 2 KB)
- Domain → has one Enterprise Guardrails File
- Workflow → has many Nodes, each node can have bound Tools
- Tool Registry → global, tools are referenced by nodes
- Prompt Lab → has many PromptVersions (named, versioned)
- Configuration → references a PromptVersion, contains ALL behavioral settings
- Configuration → IMMUTABLE after creation
- A Task Run (Phase 2) selects: Domain + Workflow + Configuration

## Phase 2: Task Execution & Working Screen

### What Phase 2 Adds
Phase 2 is the "use it" screen. Phase 1 configured everything. Phase 2 is where the PM selects a Domain + Workflow + Configuration, starts a thread, runs tasks via chat, watches the AI execute workflows in real-time, inspects execution traces, reviews file changes, and cross-questions the AI's decisions.

### Phase 2 Architecture: Three-Panel Layout
- **Left Panel** (~240px, collapsible): Domain selector, thread list (T tab), project files (F tab)
- **Center Panel** (flexible): Config bar, instructions bar, chat messages, embedded execution trace cards, chat input
- **Right Panel** (~340px, collapsible): Three tabs — Artifacts (file viewer), Inspector (execution timeline), Changes (targeted diff review)

### Phase 2 New Database Tables
- threads: conversation thread, locks domain + workflow + configuration
- thread_messages: individual messages (user/assistant/system), message_type (text/execution_trace/file_attachment)
- execution_runs: one agent execution per user message, tracks status/duration/tokens/cost
- execution_steps: one step per workflow node in a run, tracks inputs/outputs/routing/guardrails/file_operation_type
- thread_files: files in a thread's project folder (AI-generated or user-uploaded)
- file_versions: version history per file, each version has operation_type (creation/targeted_edit/append/bulk_rewrite)
- file_changes: individual changes within a targeted_edit version ONLY, for accept/reject tracking
- pm_annotations: PM notes on execution steps

### Key Design Principles (Phase 2)

1. **Surface Separation** — each surface has one job, zero overlap:
   - Chat + streaming traces = "what is happening now" (creation, additions, calculations)
   - Inspector = "what happened and why" (post-hoc analysis at own pace)
   - Changes tab = "what was modified in something that already existed" (targeted edits only)

2. **Diff is a review gate for modifications, not a creation log.** The Changes tab activates ONLY for targeted modifications to existing artifacts. New file creation, appends, and bulk rewrites do NOT trigger the Changes tab — those are visible in the chat stream and Inspector.

3. **File Operation Taxonomy** — every file operation is classified:
   - creation: new file from scratch → Changes tab dormant
   - targeted_edit: specific cells/lines changed in existing file → Changes tab ACTIVE
   - append: new content added without modifying existing → Changes tab dormant
   - bulk_rewrite: >50% of file rewritten → Changes tab dormant

4. **Configuration is immutable and locked at thread start.** Same Phase 1 rule extends to threads.

5. **Threads are scoped per domain.** Memory isolation enforced at thread level.

### Communication Patterns
- **WebSocket**: Execution trace streaming (bidirectional, during runs)
- **REST API**: CRUD operations, inspector data, accept/reject changes, annotations
- **Supabase Realtime**: Database change notifications for cascade updates after accept/reject
- **Event Queue**: Async cascade recalculation, file diff computation, operation classification

### Phase 2 API Routes (all under /api/v1/)
- POST /threads — create thread (locks config)
- GET /threads — list threads by domain
- GET /threads/:id — get thread with messages
- GET /threads/:id/messages — paginated messages
- GET /threads/:id/files — list project files
- POST /threads/:id/files — upload file to thread
- WS /threads/:id/stream — WebSocket for execution streaming
- GET /runs/:id — get execution run
- GET /runs/:id/steps — get execution steps (for Inspector)
- POST /steps/:id/annotations — add PM annotation
- GET /files/:id/versions — file version history
- GET /files/:id/changes — pending changes (for Changes tab)
- PATCH /changes/:id — accept/reject a change
- PATCH /changes/bulk — bulk accept/reject changes

### Phase 2 Frontend Routes
- /workspace — the three-panel working screen (main Phase 2 page)
- /workspace/[threadId] — specific thread loaded

### Key Component Structure
```
frontend/src/
  app/
    workspace/
      page.tsx                    # Main workspace layout
      [threadId]/
        page.tsx                  # Thread-specific view
  components/
    workspace/
      LeftPanel.tsx               # Thread list + file explorer
      DomainSelector.tsx
      ThreadList.tsx
      ThreadItem.tsx
      FileExplorer.tsx
      ConfigGate.tsx              # New thread setup (dropdowns)
      CenterPanel.tsx             # Chat + execution traces
      ConfigBar.tsx               # Collapsed/expanded config display
      InstructionsBar.tsx
      ChatMessage.tsx
      ExecutionTraceCard.tsx      # Inline trace in chat
      TraceStep.tsx
      ChatInput.tsx
      RightPanel.tsx              # Three-tab container
      ArtifactViewer.tsx          # Tab 1: file viewer
      ExcelViewer.tsx
      MarkdownViewer.tsx
      PdfViewer.tsx
      CsvViewer.tsx
      ExecutionInspector.tsx      # Tab 2: execution timeline
      InspectorNode.tsx
      TimingBar.tsx
      AnnotationInput.tsx
      ChangesTab.tsx              # Tab 3: targeted diff review
      ChangeCard.tsx
      DiffViewExcel.tsx
      DiffViewText.tsx
  stores/
    thread-store.ts
    workspace-store.ts
    execution-store.ts
```
