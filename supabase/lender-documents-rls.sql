-- Lender-guideline documents (documents.lender_id is not null) are
-- platform-admin only — distinct from scenario-attached borrower
-- documents (bank statements, P&L), which stay visible to org members
-- per the original policies in supabase/rls-policies.sql.
--
-- Postgres RLS combines multiple permissive policies with OR, so the
-- original org-member policies must be narrowed to exclude lender-linked
-- rows, and new admin-only policies added for those rows specifically.

drop policy if exists documents_select on documents;
drop policy if exists documents_write on documents;

create policy documents_select on documents
  for select using (organization_id in (select user_org_ids()) and lender_id is null);
create policy documents_write on documents
  for all using (organization_id in (select user_org_ids()) and lender_id is null)
  with check (organization_id in (select user_org_ids()) and uploaded_by = auth.uid() and lender_id is null);

create policy lender_documents_admin_select on documents
  for select using (lender_id is not null and public.is_platform_admin());
create policy lender_documents_admin_write on documents
  for all using (lender_id is not null and public.is_platform_admin())
  with check (lender_id is not null and public.is_platform_admin());

-- document_extractions: same split. Existing policies are org-member for
-- the document's org; lender-linked extractions are admin-only.
drop policy if exists extractions_select on document_extractions;
drop policy if exists extractions_write on document_extractions;

create policy extractions_select on document_extractions
  for select using (
    organization_id in (select user_org_ids())
    and not exists (select 1 from documents d where d.id = document_extractions.document_id and d.lender_id is not null)
  );
create policy extractions_write on document_extractions
  for all using (
    organization_id in (select user_org_ids())
    and not exists (select 1 from documents d where d.id = document_extractions.document_id and d.lender_id is not null)
  )
  with check (organization_id in (select user_org_ids()));

create policy lender_extractions_admin_select on document_extractions
  for select using (
    public.is_platform_admin()
    and exists (select 1 from documents d where d.id = document_extractions.document_id and d.lender_id is not null)
  );
create policy lender_extractions_admin_write on document_extractions
  for all using (
    public.is_platform_admin()
    and exists (select 1 from documents d where d.id = document_extractions.document_id and d.lender_id is not null)
  )
  with check (public.is_platform_admin());
