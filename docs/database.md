# Database

Production target: PostgreSQL on Supabase, managed by Prisma migrations (`prisma/schema.prisma`), with RLS applied from `supabase/rls-policies.sql`. The demo build uses an in-memory repository with identical semantics behind the `Repository` interface (`src/lib/store.ts`).

## Conventions

- UUID primary keys; `created_at` / `updated_at` on every table; soft deletion (`deleted_at`) where history matters
- `organization_id` on every tenant-owned table (multi-tenancy + RLS)
- `created_by` / `reviewed_by` where authorship matters; `version` integers for optimistic concurrency on hot rows (programs, scenarios)
- Effective/expiration dates on guideline versions and rules

## Table inventory

Shipped in `schema.prisma` today: `organizations`, `organization_settings`, `users`, `user_profiles`, `memberships`, `lenders`, `programs`, `guideline_versions`, `rules`, `scenarios`, `documents`, `document_extractions`, `program_evaluations`, `reports`, `shared_links`, `audit_logs`, `ai_requests`, `feature_flags`.

JSON-columned substructures (typed by `src/domain/types`, validated by Zod at the boundary): scenario borrowers/properties/income sources/assets/liabilities/credit events/housing history inside `scenarios.data`; rule condition trees inside `rules.definition`; program constraint matrices inside `programs.config`; extraction fields with page-level provenance inside `document_extractions.fields`.

**Normalization path** (add when relational querying of substructures is needed): `scenario_borrowers`, `scenario_properties`, `scenario_income_sources`, `scenario_assets`, `scenario_liabilities`, `scenario_credit_events`, `scenario_housing_history`, `rule_groups`, `rule_conditions`, `calculations`, `calculation_inputs`, `rule_evaluations`, `program_matches`, `restructuring_options`, `needs_lists`, `needs_list_items`, `comments`, `internal_notes`, `activity_events`, `notifications`, `brokers`, `contacts`, `lender_contacts`, `program_documents`, `program_states`, `guideline_documents`, `guideline_sources`, `roles`, `permissions`. Each follows the same conventions above; migrating a JSON substructure out is a additive migration plus a backfill.

## Multi-tenancy enforcement

Two independent layers:
1. **RLS** — deny-by-default policies keyed on `memberships` (see `supabase/rls-policies.sql`), enforced by Postgres for any JWT-scoped connection.
2. **Application scoping** — the server resolves `organization_id` from the session and passes it explicitly to every repository call; the repository throws on unknown orgs. Client-supplied org IDs are never accepted.

Service-role connections bypass RLS (Supabase behavior), so layer 2 is mandatory, not optional.

## Migration policy

- Reversible migrations where practical; destructive changes require an explicit down-path plan and backup verification
- Database constraints preferred over app-only validation (FKs, unique keys, enums-as-checks)
- Transactions for multi-record writes (e.g. publishing a guideline version with its rules)
