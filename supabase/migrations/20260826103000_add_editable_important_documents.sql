alter table public.important_documents
  add column if not exists document_type text not null default 'file',
  add column if not exists content_html text not null default '',
  add column if not exists content_text text not null default '',
  add column if not exists version_history jsonb not null default '[]'::jsonb,
  add column if not exists published_at timestamptz,
  add column if not exists published_by_email text;

alter table public.important_documents
  alter column file_name drop not null,
  alter column storage_path drop not null;

update public.important_documents
set document_type = 'file'
where document_type is null or document_type = '';

alter table public.important_documents
  drop constraint if exists important_documents_document_type_check;

alter table public.important_documents
  add constraint important_documents_document_type_check
    check (document_type in ('file', 'editable'));
