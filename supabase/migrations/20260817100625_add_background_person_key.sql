alter table public.parent_background_checks
  add column if not exists person_key text;

update public.parent_background_checks
set person_key = coalesce(
  nullif(person_key, ''),
  lower(regexp_replace(trim(parent_email), '\s+', '', 'g')) || ':' ||
    lower(regexp_replace(trim(coalesce(parent_name, 'person')), '[^a-z0-9]+', '-', 'g'))
)
where person_key is null or person_key = '';

alter table public.parent_background_checks
  alter column person_key set not null;

drop index if exists parent_background_checks_family_email_uidx;

create unique index if not exists parent_background_checks_family_person_uidx
  on public.parent_background_checks (family_key, person_key);

create index if not exists parent_background_checks_family_email_idx
  on public.parent_background_checks (family_key, parent_email);
