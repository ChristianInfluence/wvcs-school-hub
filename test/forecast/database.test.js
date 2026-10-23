import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

let db;
const matt = "11111111-1111-4111-8111-111111111111";
const miller = "22222222-2222-4222-8222-222222222222";
const outsider = "33333333-3333-4333-8333-333333333333";
const document = { schemaVersion: 1, initialized: true, budgetPlans: [{ id: "plan-original", month: "2026-10", lines: [] }], boardReports: [{ id: "report-original", notes: "Presented to board" }] };
before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
    insert into auth.users values
      ('${matt}','mconniry@wvcs.org',now()), ('${miller}','hmiller@wvcs.org',now()),
      ('${outsider}','admin@wvcs.org',now());
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb; $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid; $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on function auth.jwt(), auth.uid() to anon, authenticated, service_role;
  `);
  await db.exec(await readFile(new URL("../../supabase/migrations/20261023120000_add_budget_forecast.sql", import.meta.url), "utf8"));
});
after(async () => { await db?.close(); });
async function asRole(role, userId, email, fn) {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: userId, email })]);
  try { return await fn(); } finally { await db.exec("reset role"); }
}
async function save(actor, next, revision) {
  return db.query("select public.save_budget_forecast($1,$2::jsonb,$3) as saved", [actor, JSON.stringify(next), revision]);
}
test("service save creates one shared row and one audit entry atomically", async () => {
  const result = await asRole("service_role", null, null, () => save(matt, document, 0));
  assert.equal(result.rows[0].saved.revision, 1);
  assert.equal((await db.query("select count(*)::int as n from budget_forecast_workspaces")).rows[0].n, 1);
  assert.equal((await db.query("select count(*)::int as n from budget_forecast_audit")).rows[0].n, 1);
});
test("RLS lets only Matt and hmiller read the same financial records", async () => {
  for (const [id, email] of [[matt, "mconniry@wvcs.org"], [miller, "hmiller@wvcs.org"]]) {
    await asRole("authenticated", id, email, async () => {
      const result = await db.query("select scope, revision from budget_forecast_workspaces");
      assert.deepEqual(result.rows, [{ scope: "wvcs", revision: 1 }]);
      assert.equal((await db.query("select count(*)::int as n from budget_forecast_audit")).rows[0].n, 1);
    });
  }
  await asRole("authenticated", outsider, "admin@wvcs.org", async () => {
    assert.equal((await db.query("select * from budget_forecast_workspaces")).rows.length, 0);
    assert.equal((await db.query("select * from budget_forecast_audit")).rows.length, 0);
  });
  await assert.rejects(asRole("anon", null, null, () => db.query("select * from budget_forecast_workspaces")), /permission denied/);
});
test("browser credentials cannot write or read tokens, including allowed users", async () => {
  await asRole("authenticated", matt, "mconniry@wvcs.org", async () => {
    await assert.rejects(db.query("delete from budget_forecast_workspaces"), /permission denied/);
    await assert.rejects(save(matt, document, 1), /permission denied/);
    await assert.rejects(db.query("select * from budget_forecast_qbo_connections"), /permission denied/);
    await assert.rejects(db.query("select * from budget_forecast_oauth_states"), /permission denied/);
  });
});
test("an outsider cannot be supplied as the actor even by a service call", async () => {
  await assert.rejects(asRole("service_role", null, null, () => save(outsider, document, 1)), /Forecast access required/);
});
test("second user saves shared changes and a stale writer cannot overwrite them", async () => {
  await asRole("service_role", null, null, async () => {
    const result = await save(miller, { ...document, initialized: false }, 1);
    assert.equal(result.rows[0].saved.revision, 2);
    await assert.rejects(save(matt, document, 1), /changed in another window/);
  });
  assert.equal((await db.query("select revision, updated_by from budget_forecast_workspaces")).rows[0].updated_by, miller);
  assert.equal((await db.query("select count(*)::int as n from budget_forecast_audit")).rows[0].n, 2);
});
test("SQL rejects report edits and restores retain approved history", async () => {
  await asRole("service_role", null, null, async () => {
    await assert.rejects(save(matt, { ...document, boardReports: [{ id: "report-original", notes: "Rewritten" }] }, 2), /cannot be overwritten/);
    const result = await save(matt, { ...document, boardReports: [], budgetPlans: [] }, 2);
    assert.deepEqual(result.rows[0].saved.document.boardReports, document.boardReports);
    assert.deepEqual(result.rows[0].saved.document.budgetPlans, document.budgetPlans);
    assert.equal(result.rows[0].saved.revision, 3);
  });
});
