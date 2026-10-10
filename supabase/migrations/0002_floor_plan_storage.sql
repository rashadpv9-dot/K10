-- Private storage for floor plan images, and a marker for demo/sample rows.

-- Images only, 5 MB each. Files live under "<outlet id>/<file name>".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('floor-plans', 'floor-plans', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- The first folder of the path must be an outlet the user works at.
-- The regex guard keeps the uuid cast from failing on unexpected paths.
create function public.storage_outlet(p_name text) returns uuid
language sql immutable set search_path = ''
as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then split_part(p_name, '/', 1)::uuid
  end
$$;
revoke execute on function public.storage_outlet(text) from public, anon;
grant execute on function public.storage_outlet(text) to authenticated;

create policy floor_plans_files_read on storage.objects for select to authenticated
  using (bucket_id = 'floor-plans' and public.is_staff(public.storage_outlet(name)));
create policy floor_plans_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'floor-plans' and public.is_manager(public.storage_outlet(name)));
create policy floor_plans_files_update on storage.objects for update to authenticated
  using (bucket_id = 'floor-plans' and public.is_manager(public.storage_outlet(name)))
  with check (bucket_id = 'floor-plans' and public.is_manager(public.storage_outlet(name)));
create policy floor_plans_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'floor-plans' and public.is_manager(public.storage_outlet(name)));

-- Sample rows created for demos can be found and cleared in one go.
alter table public.customers add column is_sample boolean not null default false;
alter table public.bookings add column is_sample boolean not null default false;
