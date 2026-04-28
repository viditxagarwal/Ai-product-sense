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
