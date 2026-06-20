# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Téléops** — a French-language telecommunications operational tracking platform. Users manage *activities* (projects), each with dynamically-defined *attributes* (columns) and *instances* (data rows). Access is role-based: `admin`, `superviseur`, `operateur`, with per-activity permissions.

## Commands

```bash
npm run dev          # Vite dev server at http://localhost:8080
npm run build        # Production build
npm run build:dev    # Development build
npm run lint         # ESLint
npm run test         # Vitest (run once)
npm run test:watch   # Vitest (watch mode)
```

To run a single test file:
```bash
npx vitest run src/path/to/file.test.ts
```

### Local Supabase Backend

The app points to a local Supabase stack (see `.env`). Run `setup-local-fixed.sh` to initialize Docker-based Supabase, apply migrations, and generate the `.env`. Supabase Studio is at `http://localhost:8000` (admin/admin). PostgreSQL migrations live in `supabase/migrations/`.

## Architecture

### Data Model

Three core tables drive everything:

- **`activities`** — project containers (code, name, archived flag)
- **`attributes`** — dynamic column definitions per activity (`type`: text | number | date | enum | boolean; validation rules; lookup config)
- **`instances`** — data rows per activity (JSONB `data` field, `version` for optimistic locking, `status`)

Supporting tables: `profiles`, `user_roles`, `activity_permissions`.

The UI is schema-driven: the columns rendered in the data grid are generated at runtime from the `attributes` rows for the current activity.

### Frontend Structure

`src/App.tsx` wires up providers (QueryClientProvider, AuthProvider, TooltipProvider, Sonner) and the BrowserRouter with route guards (`ProtectedRoute`).

Routes:
- `/auth` — login/signup (public)
- `/` — Dashboard with KPI cards and Recharts visualizations
- `/activities` — activity list (create, clone, delete)
- `/activities/:id` — full data grid view for one activity
- `/users` — admin-only user/role management

### State & Data Fetching

All server state is managed through **TanStack React Query** (staleTime 30 s, no refetch-on-focus). Key hooks:

- `useAuth` (`src/hooks/useAuth.tsx`) — auth context, session, roles, `isAdmin` flag
- `useActivities` (`src/hooks/useActivities.ts`) — queries for activities, attributes, instances
- `useTableMutations` (`src/hooks/useTableMutations.ts`) — all CUD operations, including bulk-update with optimistic locking (version increment + conflict retry)
- `useLookupTools` (`src/hooks/useLookupTools.ts`) — lookup/enrichment rule management

### ActivityView & the Data Grid

`src/pages/ActivityView.tsx` is the most complex page. It:
1. Fetches the activity's `attributes` to build column definitions
2. Renders `HotGrid` (a Handsontable wrapper) or the custom `DataGrid` for spreadsheet-like inline editing
3. Uses Supabase Realtime subscriptions for live updates
4. Handles bulk edits via `BulkEditDialog` and Excel import/export via `ImportExportBar`
5. Enforces role visibility — consultants only see rows where they are the assigned `acteur`

### Supabase Integration

Client is in `src/integrations/supabase/client.ts`. Generated TypeScript types are in `src/integrations/supabase/types.ts` — regenerate them with `supabase gen types typescript` after schema changes.

RLS policies enforce access control at the database level; `activity_permissions` rows grant per-user read/write/admin on individual activities.

### Path Alias

`@/` maps to `src/` throughout. Use it for all internal imports.

## Key Conventions

- **Language**: All UI text, database fields, and comments are in French.
- **Dates**: Use `date-fns` with the `fr` locale for all formatting.
- **Notifications**: Use `sonner` (`toast.*`) for user feedback — never `alert()`.
- **Forms**: React Hook Form + Zod schemas for validation.
- **Styling**: Tailwind utility classes + CSS variables defined in `src/index.css`. Status colors (`Affecté`, `En cours`, `Réalisé`, `Bloqué`) are defined as Tailwind theme tokens — use those instead of hardcoded colours.
- **TypeScript**: `strictNullChecks` is off; `noImplicitAny` is off. Keep new code consistent with the existing loose-typed style unless tightening is the explicit goal.
