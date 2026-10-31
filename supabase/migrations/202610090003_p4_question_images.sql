-- P4: optional question images.
-- One image per question, max 1MB, jpg/png. Stored in Supabase Storage under
-- the `question-images` bucket; only the URL is kept in the questions table.
--
-- Run AFTER P3 and BEFORE deploying the image-upload code.

begin;

-- --- Storage bucket -----------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('question-images', 'question-images', true)
on conflict (id) do nothing;

-- Only authenticated users can upload; anyone can read (public bucket).
create policy if not exists "Authenticated users can upload question images"
on storage.objects for insert
to authenticated
with check (bucket_id = 'question-images');

create policy if not exists "Anyone can view question images"
on storage.objects for select
to public
using (bucket_id = 'question-images');

-- Only the uploader (or service role) can delete; we handle deletion server-side
-- when a question is removed, so browser delete is not exposed.
create policy if not exists "Authenticated users can delete their own question images"
on storage.objects for delete
to authenticated
using (bucket_id = 'question-images' and (storage.folder_name(name))[1] = auth.uid()::text);

-- --- Questions table: optional image URL --------------------------------------
alter table public.questions
  add column if not exists image_url text;

commit;

notify pgrst, 'reload schema';
