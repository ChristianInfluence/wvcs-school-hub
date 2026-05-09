alter table public.important_documents
  add column if not exists display_order integer;

with ranked_documents as (
  select
    id,
    row_number() over (order by uploaded_at desc, created_at desc) - 1 as row_order
  from public.important_documents
)
update public.important_documents
set display_order = ranked_documents.row_order
from ranked_documents
where important_documents.id = ranked_documents.id
  and important_documents.display_order is null;

alter table public.important_documents
  alter column display_order set default 0;

update public.important_documents
set display_order = 0
where display_order is null;

alter table public.important_documents
  alter column display_order set not null;

create index if not exists important_documents_display_order_idx
  on public.important_documents (display_order asc, uploaded_at desc);
