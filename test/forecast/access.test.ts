import test from "node:test";
import assert from "node:assert/strict";
import { canUseForecast, isVerifiedForecastUser } from "../../supabase/functions/_shared/financeForecast/access.js";
import { handleForecastRequest } from "../../supabase/functions/budget-forecast/service.ts";
import { blankDocument } from "../../supabase/functions/_shared/financeForecast/model.ts";

const matt = { id: "matt-user", email: "mconniry@wvcs.org", email_confirmed_at: "2026-01-01" };
const miller = { id: "miller-user", email: "hmiller@wvcs.org", email_confirmed_at: "2026-01-01" };
const origin = "https://wvcshub.org";
function fixture(user: any) {
  let reads = 0, writes = 0, qboCalls = 0, actor = "";
  const document = blankDocument(); document.initialized = true;
  return {
    counts: () => ({ reads, writes, qboCalls, actor }),
    services: {
      origin, verifyToken: async (token: string) => token === "valid-session" ? user : null,
      repository: {
        load: async () => { reads++; return { document, revision: 1 }; },
        save: async (id: string, next: any, revision: number) => { writes++; actor = id; return { document: next, revision: revision + 1 }; },
      },
      qbo: {
        status: async () => { qboCalls++; return { connected: false }; },
        connect: async () => { qboCalls++; return "https://appcenter.intuit.com/"; },
        sync: async () => { qboCalls++; return {}; },
        disconnect: async () => { qboCalls++; },
        callback: async () => `${origin}/#/office-finance/forecast?qbo=error`,
      },
    },
  };
}
function request(body: any, token = "valid-session", requestOrigin = origin) {
  return new Request("https://example.supabase.co/functions/v1/budget-forecast", { method: "POST", headers: { Authorization: `Bearer ${token}`, Origin: requestOrigin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
test("only the two exact school accounts are allowed, regardless of admin status", () => {
  assert.ok(canUseForecast(" MCONNIRY@WVCS.ORG "));
  assert.ok(canUseForecast("hmiller@wvcs.org"));
  for (const email of ["", "admin@wvcs.org", "teacher@wvcs.org", "hmiller@wvcs.org.attacker.com", "mconniry+alias@wvcs.org"]) assert.equal(canUseForecast(email), false);
  assert.equal(isVerifiedForecastUser({ ...matt, email_confirmed_at: null }), false);
});
test("both accounts load the same shared school workspace", async () => {
  for (const user of [matt, miller]) {
    const f = fixture(user), response = await handleForecastRequest(request({ action: "load" }), f.services);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).document.settings.name, "Willamette Valley Christian School");
    assert.equal(f.counts().reads, 1);
  }
});
test("every financial operation rejects a verified outsider before accessing data", async () => {
  for (const action of ["load", "save", "import", "qbo.status", "qbo.connect", "qbo.sync", "qbo.disconnect"]) {
    const f = fixture({ ...matt, email: "admin@wvcs.org", user_metadata: { role: "admin" } });
    const response = await handleForecastRequest(request({ action, email: matt.email, userId: matt.id, canManageUsers: true }), f.services);
    assert.equal(response.status, 403, action);
    assert.deepEqual(f.counts(), { reads: 0, writes: 0, qboCalls: 0, actor: "" });
  }
});
test("missing, invalid and unconfirmed sessions cannot read the forecast", async () => {
  let f = fixture(matt);
  assert.equal((await handleForecastRequest(request({ action: "load" }, "expired-session"), f.services)).status, 401);
  assert.equal(f.counts().reads, 0);
  f = fixture({ ...matt, email_confirmed_at: null });
  assert.equal((await handleForecastRequest(request({ action: "load" }), f.services)).status, 403);
  assert.equal(f.counts().reads, 0);
});
test("save identity comes from the verified token, never the request body", async () => {
  const f = fixture(miller), document = blankDocument(); document.initialized = true;
  const response = await handleForecastRequest(request({ action: "save", document, revision: 1, actorId: matt.id, email: matt.email }), f.services);
  assert.equal(response.status, 200);
  assert.equal(f.counts().actor, miller.id);
});
test("stale saves, invalid documents and cross-origin requests fail without writes", async () => {
  const f = fixture(matt), document = blankDocument(); document.initialized = true;
  assert.equal((await handleForecastRequest(request({ action: "save", document, revision: 0 }), f.services)).status, 409);
  assert.equal((await handleForecastRequest(request({ action: "save", document: { ...document, schemaVersion: 99 }, revision: 1 }), f.services)).status, 400);
  assert.equal((await handleForecastRequest(request({ action: "save", document, revision: 1 }, "valid-session", "https://elsewhere.example"), f.services)).status, 403);
  assert.equal(f.counts().writes, 0);
});
test("monthly P&L preview is read-only, and importing requires a valid coverage date", async () => {
  const f = fixture(matt);
  const input = { action: "import", type: "pnl", filename: "monthly.csv", basis: "Accrual", revision: 1, rows: [["Account", "September 2026"], ["Income", ""], ["Tuition", 1000], ["Expenses", ""], ["Utilities", 100]] };
  assert.equal((await handleForecastRequest(request(input), f.services)).status, 200);
  assert.equal(f.counts().writes, 0);
  assert.equal((await handleForecastRequest(request({ ...input, commit: true }), f.services)).status, 400);
  assert.equal((await handleForecastRequest(request({ ...input, commit: true, actualsThrough: "2099-09-30" }), f.services)).status, 400);
  const response = await handleForecastRequest(request({ ...input, commit: true, actualsThrough: "2026-09-30" }), f.services);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.document.actualCoverage.map((row: any) => row.throughDate), ["2026-09-30"]);
  assert.equal(f.counts().writes, 1);
});
