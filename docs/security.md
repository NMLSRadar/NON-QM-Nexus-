# Security

## Multi-tenancy model

- Every tenant-owned table carries `organization_id`; PostgreSQL **row-level security** (see `supabase/rls-policies.sql`) denies by default and grants only rows in organizations where the user holds an active membership.
- The application server resolves the organization from the authenticated session — **client-supplied organization IDs are never trusted** (see `src/app/scenarios/new/actions.ts`).
- Role-restricted writes: guideline/program/rule management requires `underwriter`/`org_admin`; audit logs are org-admin-read-only; users see only their own profile.

## Controls implemented in this MVP

- Strict server-side input validation (shared Zod schemas)
- No secrets in the client bundle; API keys read from server env only
- Anonymized borrower references in the data model; no SSN/account-number fields exist anywhere
- Deterministic results carry rule/citation provenance (auditability)
- AI audit design: prompt version, model, facts supplied, response, accept/edit status (`ai_requests`)
- Shared-link design stores only a **token hash** with expiry and revocation
- Health endpoint exposes no sensitive data; errors are not surfaced with stack traces
- CI runs lint, typecheck, tests, and build on every push

## Production-readiness checklist (required before real consumer data)

**Application**
- [ ] Wire Supabase Auth (sessions, MFA adapter, session timeout) and replace the demo organization
- [ ] Enable the Prisma repository and apply RLS; add cross-tenant integration tests against a live database
- [ ] CSRF protection on all mutating routes (Next.js server actions include origin checks; verify configuration)
- [ ] Rate limiting on auth, analysis, upload, and shared-link endpoints
- [ ] File uploads: MIME/type validation, size limits (`FILE_MAX_SIZE_MB`), virus-scanning adapter, signed URLs
- [ ] Secure cookies (`HttpOnly`, `Secure`, `SameSite`), strict CSP and security headers
- [ ] Structured logging with PII redaction; Sentry with scrubbing enabled
- [ ] Data-retention jobs; account-deletion and document-deletion workflows

**Organizational / legal (not code)**
- [ ] Legal review: decision-support positioning, disclaimers, state licensing implications
- [ ] Vendor data-processing agreements (Supabase, AI providers, email) and retention documentation
- [ ] Fair-lending review of ranking factors by compliance counsel
- [ ] Penetration test and formal security audit
- [ ] Incident-response plan, backup/restore drills, access reviews

**No certification claim:** implementing these controls does not by itself constitute SOC 2, GLBA, CCPA, HIPAA, or any other compliance. Certification requires the audits, contracts, and operational processes above.

## Fair-lending and decision-support controls

- No protected-class information (race, religion, ethnicity, sex, sexual orientation, etc.) is collected by the scenario matcher, and none may be added to the evaluation context. If legally required monitoring data is ever collected, it must live in an isolated store with no read path from the eligibility engine.
- No black-box approval predictions: every classification is traceable to named rules, and no statistical approval percentage is shown (none exists without validated historical outcome data).
- Every result states: rules-based, guidelines change, overlays may apply, exceptions not guaranteed, human verification required, pricing not included, final approval remains with the lender.
