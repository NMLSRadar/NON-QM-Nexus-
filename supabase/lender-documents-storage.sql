-- Storage bucket for admin-uploaded lender guideline/matrix PDFs.
-- Private bucket — no public URL access; every read goes through
-- Supabase Storage's signed-URL / RLS-checked download path.

insert into storage.buckets (id, name, public)
values ('lender-documents', 'lender-documents', false)
on conflict (id) do nothing;

-- Only platform admins may upload, read, or delete objects in this bucket.
-- (public.is_platform_admin() is defined in supabase/membership-rls.sql.)
drop policy if exists lender_documents_admin_select on storage.objects;
drop policy if exists lender_documents_admin_insert on storage.objects;
drop policy if exists lender_documents_admin_delete on storage.objects;

create policy lender_documents_admin_select on storage.objects
  for select using (bucket_id = 'lender-documents' and public.is_platform_admin());

create policy lender_documents_admin_insert on storage.objects
  for insert with check (bucket_id = 'lender-documents' and public.is_platform_admin());

create policy lender_documents_admin_delete on storage.objects
  for delete using (bucket_id = 'lender-documents' and public.is_platform_admin());
