alter table public.works
    add column if not exists source_file_path text,
    add column if not exists source_file_type text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'book-uploads',
    'book-uploads',
    false,
    52428800,
    array[
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
)
on conflict (id) do update
set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public)
values ('comic-pages', 'comic-pages', true)
on conflict (id) do update
set public = excluded.public;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'storage'
          and tablename = 'objects'
          and policyname = 'Authors upload private book sources'
    ) then
        create policy "Authors upload private book sources"
            on storage.objects
            for insert
            to authenticated
            with check (
                bucket_id = 'book-uploads'
                and (storage.foldername(name))[1] = (select auth.uid()::text)
            );
    end if;
end
$$;
