-- One shared school forecast. No general admin/Office & Finance access grant.
create or replace function public.can_access_budget_forecast()
returns boolean language sql stable security invoker set search_path = '' as $$
  select auth.uid() is not null and lower(auth.jwt() ->> 'email') in
    ('mconniry@wvcs.org', 'hmiller@wvcs.org');
$$;
revoke all on function public.can_access_budget_forecast() from public, anon;
grant execute on function public.can_access_budget_forecast() to authenticated, service_role;

create table public.budget_forecast_workspaces (
  scope text primary key check (scope = 'wvcs'),
  document jsonb not null check (jsonb_typeof(document) = 'object' and document->>'schemaVersion' = '1'),
  revision bigint not null check (revision > 0),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);
create table public.budget_forecast_audit (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope = 'wvcs'),
  actor_id uuid not null references auth.users(id),
  actor_email text not null,
  action text not null,
  summary text not null,
  revision bigint not null,
  created_at timestamptz not null default now()
);
create index budget_forecast_audit_latest on public.budget_forecast_audit (created_at desc);

-- Tokens, OAuth nonces, and locks are never readable via browser credentials.
create table public.budget_forecast_qbo_connections (
  scope text primary key check (scope = 'wvcs'),
  realm_id text not null,
  sealed_tokens text not null,
  expires_at timestamptz not null,
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  lock_token uuid,
  lock_until timestamptz not null default '1970-01-01'
);
create table public.budget_forecast_oauth_states (
  state_hash text primary key,
  actor_id uuid not null references auth.users(id),
  expires_at timestamptz not null
);

alter table public.budget_forecast_workspaces enable row level security;
alter table public.budget_forecast_audit enable row level security;
alter table public.budget_forecast_qbo_connections enable row level security;
alter table public.budget_forecast_oauth_states enable row level security;
revoke all on public.budget_forecast_workspaces, public.budget_forecast_audit,
  public.budget_forecast_qbo_connections, public.budget_forecast_oauth_states from anon, authenticated;
grant select on public.budget_forecast_workspaces, public.budget_forecast_audit to authenticated;
grant all on public.budget_forecast_workspaces, public.budget_forecast_audit,
  public.budget_forecast_qbo_connections, public.budget_forecast_oauth_states to service_role;
create policy budget_forecast_read on public.budget_forecast_workspaces for select to authenticated
  using (public.can_access_budget_forecast());
create policy budget_forecast_audit_read on public.budget_forecast_audit for select to authenticated
  using (public.can_access_budget_forecast());

-- Only the verified Edge Function can invoke saves. Identity is checked again here.
-- Workspace, immutable report history, revision, and audit update in one transaction.
create or replace function public.save_budget_forecast(
  p_actor_id uuid, p_document jsonb, p_expected_revision bigint,
  p_action text default 'workspace.saved', p_summary text default 'Forecast updated'
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_email text;
  previous public.budget_forecast_workspaces%rowtype;
  changed public.budget_forecast_workspaces%rowtype;
  merged jsonb := p_document;
  collection text;
  saved_item jsonb;
  incoming_item jsonb;
begin
  select lower(u.email) into actor_email from auth.users u
    where u.id = p_actor_id and u.email_confirmed_at is not null;
  if actor_email is null or actor_email not in ('mconniry@wvcs.org', 'hmiller@wvcs.org') then
    raise exception 'Forecast access required' using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 0
    or jsonb_typeof(p_document) is distinct from 'object'
    or p_document->>'schemaVersion' is distinct from '1'
    or jsonb_typeof(p_document->'budgetPlans') is distinct from 'array'
    or jsonb_typeof(p_document->'boardReports') is distinct from 'array'
    or p_action not in ('workspace.saved', 'workspace.created', 'report.imported')
    or p_summary is null or length(p_summary) > 500 then
    raise exception 'Invalid forecast document' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('wvcs-budget-forecast'));
  select * into previous from public.budget_forecast_workspaces where scope = 'wvcs' for update;
  if coalesce(previous.revision, 0) <> p_expected_revision then
    raise exception 'Forecast changed in another window. Reload before saving.' using errcode = '40001';
  end if;
  foreach collection in array array['budgetPlans', 'boardReports'] loop
    for saved_item in select value from jsonb_array_elements(coalesce(previous.document->collection, '[]'::jsonb)) loop
      select value into incoming_item from jsonb_array_elements(merged->collection)
        where value->>'id' = saved_item->>'id';
      if found and incoming_item is distinct from saved_item then
        raise exception 'Approved plans and saved board reports cannot be overwritten.' using errcode = '40001';
      elsif not found then
        merged := jsonb_set(merged, array[collection], (merged->collection) || jsonb_build_array(saved_item));
      end if;
    end loop;
  end loop;
  if octet_length(merged::text) > 1500000 or jsonb_array_length(merged->'budgetPlans') > 240
    or jsonb_array_length(merged->'boardReports') > 120 then
    raise exception 'Workspace history is too large.' using errcode = '22023';
  end if;
  insert into public.budget_forecast_workspaces (scope, document, revision, updated_by)
    values ('wvcs', merged, p_expected_revision + 1, p_actor_id)
    on conflict (scope) do update set document = excluded.document,
      revision = excluded.revision, updated_by = excluded.updated_by, updated_at = now()
    returning * into changed;
  insert into public.budget_forecast_audit (scope, actor_id, actor_email, action, summary, revision)
    values ('wvcs', p_actor_id, actor_email, p_action, p_summary, changed.revision);
  return jsonb_build_object('document', changed.document, 'revision', changed.revision, 'updatedAt', changed.updated_at);
end;
$$;
revoke all on function public.save_budget_forecast(uuid,jsonb,bigint,text,text) from public, anon, authenticated;
grant execute on function public.save_budget_forecast(uuid,jsonb,bigint,text,text) to service_role;
