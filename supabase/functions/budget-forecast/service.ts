import { z } from "zod";
import { blankDocument, dateSchema, documentSchema, todayLocal, type ForecastDocument } from "../_shared/financeForecast/model.ts";
import { applyImport, previewQbo, previewTable } from "../_shared/financeForecast/imports.ts";
import { preserveBoardHistory } from "../_shared/financeForecast/board-reports.ts";
import { isVerifiedForecastUser } from "../_shared/financeForecast/access.js";

export class ForecastError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export interface State { document: ForecastDocument; revision: number; updatedAt?: string | null; audit?: unknown[]; }
export interface ForecastRepository {
  load(): Promise<State>;
  save(userId: string, document: ForecastDocument, revision: number, action: string, summary: string): Promise<State>;
}
export interface ForecastServices {
  verifyToken(token: string): Promise<any>;
  repository: ForecastRepository;
  origin: string;
  qbo: {
    status(): Promise<any>;
    connect(userId: string): Promise<string>;
    sync(document: ForecastDocument, throughDate?: string): Promise<any>;
    disconnect(): Promise<void>;
    callback(url: URL): Promise<string>;
  };
}

const revisionSchema = z.number().int().nonnegative();
const saveSchema = z.object({ document: documentSchema, revision: revisionSchema });
const importSchema = z.object({
  type: z.enum(["pnl", "cashflow", "balance", "tuition"]), filename: z.string().min(1).max(240),
  basis: z.enum(["Cash", "Accrual"]), revision: revisionSchema,
  rows: z.array(z.array(z.union([z.string().max(5000), z.number().finite(), z.null()])).max(150)).max(20000).optional(),
  report: z.record(z.any()).optional(), commit: z.boolean().default(false),
  selectedBanks: z.array(z.string().max(180)).max(100).default([]),
  balanceDateConfirmed: z.boolean().default(false), actualsThrough: dateSchema.optional(),
});
async function requestJson(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 8_000_000) throw new ForecastError(413, "Choose a smaller report.");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 8_000_000) throw new ForecastError(413, "Choose a smaller report.");
  try { return JSON.parse(raw); } catch { throw new ForecastError(400, "The request could not be read."); }
}
function json(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), { status, headers: {
    "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  } });
}
export async function handleForecastRequest(request: Request, services: ForecastServices): Promise<Response> {
  if (request.method === "OPTIONS") return json({}, 200, services.origin);
  try {
    const url = new URL(request.url);
    // Intuit's server cannot supply a Supabase JWT. The callback consumes a hashed,
    // short-lived nonce created by one of the two authenticated users instead.
    if (request.method === "GET" && url.searchParams.has("state")) {
      return Response.redirect(await services.qbo.callback(url), 303);
    }
    if (request.method !== "POST") throw new ForecastError(405, "Use the forecast workspace to make this request.");
    const origin = request.headers.get("Origin");
    if (origin && origin !== services.origin) throw new ForecastError(403, "Open the forecast from WVCS Hub.");
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
    if (!token) throw new ForecastError(401, "Sign in to WVCS Hub to open the forecast.");
    const user = await services.verifyToken(token);
    if (!user) throw new ForecastError(401, "Your session expired. Sign in again.");
    if (!isVerifiedForecastUser(user)) throw new ForecastError(403, "You do not have access to the budget forecast.");
    const body = z.object({ action: z.string().min(1).max(40) }).passthrough().parse(await requestJson(request));
    if (body.action === "qbo.status") return json(await services.qbo.status(), 200, services.origin);
    if (body.action === "qbo.connect") return json({ url: await services.qbo.connect(user.id) }, 200, services.origin);
    if (body.action === "qbo.disconnect") { await services.qbo.disconnect(); return json({ disconnected: true }, 200, services.origin); }

    const state = await services.repository.load();
    if (body.action === "load") return json(state, 200, services.origin);
    if (body.action === "qbo.sync") {
      const input = z.object({ throughDate: dateSchema.optional() }).parse(body);
      if (input.throughDate && input.throughDate > todayLocal()) throw new ForecastError(400, "The report date cannot be in the future.");
      return json({ reports: await services.qbo.sync(state.document, input.throughDate) }, 200, services.origin);
    }
    if (body.action === "save") {
      const input = saveSchema.parse(body);
      if (input.revision !== state.revision) throw new ForecastError(409, "The forecast changed in another window. Reload before saving.");
      let document: ForecastDocument;
      try { document = documentSchema.parse(preserveBoardHistory(state.document, input.document)); }
      catch (error) { throw new ForecastError(409, (error as Error).message); }
      return json(await services.repository.save(user.id, document, input.revision,
        state.revision === 0 ? "workspace.created" : "workspace.saved", "Forecast inputs or monthly reports updated"), 200, services.origin);
    }
    if (body.action !== "import") throw new ForecastError(400, "Unknown forecast operation.");
    const input = importSchema.parse(body);
    if (input.revision !== state.revision) throw new ForecastError(409, "The forecast changed. Reload before importing.");
    if (!state.document.initialized) throw new ForecastError(400, "Create the school workspace before importing reports.");
    if (!input.rows && !input.report) throw new ForecastError(400, "Choose a report to import.");
    if (input.report?.Header?.ReportBasis && input.report.Header.ReportBasis !== input.basis) throw new ForecastError(400, "The accounting basis does not match the report.");
    if (input.type === "balance" && input.report?.Header?.EndPeriod?.slice(0, 7) !== undefined
      && input.report.Header.EndPeriod.slice(0, 7) !== state.document.settings.cutoffMonth) throw new ForecastError(400, "The balance date does not match the reviewed month.");
    let preview;
    try { preview = input.report ? previewQbo(input.type, input.report, state.document) : previewTable(input.type, input.rows!, state.document); }
    catch (error) { throw new ForecastError(400, (error as Error).message); }
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ type: input.type, basis: input.basis, rows: input.rows, report: input.report, actualsThrough: input.actualsThrough })));
    const digest = Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, "0")).join("");
    if (!input.commit) return json({ preview, digest }, 200, services.origin);
    if (input.type === "balance" && !input.balanceDateConfirmed) throw new ForecastError(400, "Confirm the balance report date before applying it.");
    if (input.type === "pnl" && (!input.actualsThrough || input.actualsThrough > todayLocal())) throw new ForecastError(400, "Confirm the actuals-through date. It cannot be in the future.");
    let document;
    try { document = applyImport(state.document, preview, digest, input.filename, input.basis, input.selectedBanks, input.actualsThrough); }
    catch (error) { throw new ForecastError(400, (error as Error).message); }
    return json(await services.repository.save(user.id, document, input.revision, "report.imported", `${input.type}: ${preview.count} entries imported`), 200, services.origin);
  } catch (error) {
    if (error instanceof ForecastError) return json({ error: error.message }, error.status, services.origin);
    if (error instanceof z.ZodError) return json({ error: "Review the entered forecast values and report format." }, 400, services.origin);
    // Provider payloads, SQL errors, tokens, and school financial data stay off responses/logs.
    return json({ error: "The shared forecast is unavailable. Please try again." }, 500, services.origin);
  }
}

export function makeRepository(client: any): ForecastRepository {
  return {
    async load() {
      const { data, error } = await client.from("budget_forecast_workspaces").select("document,revision,updated_at").eq("scope", "wvcs").maybeSingle();
      if (error) throw new ForecastError(503, "The shared forecast is not ready yet. Please try again after setup.");
      const { data: audit, error: auditError } = await client.from("budget_forecast_audit").select("summary,actor_email,created_at,revision").eq("scope", "wvcs").order("created_at", { ascending: false }).limit(12);
      if (auditError) throw new ForecastError(503, "Forecast activity could not be loaded. Please try again.");
      return { document: data ? documentSchema.parse(data.document) : blankDocument(), revision: Number(data?.revision || 0), updatedAt: data?.updated_at || null, audit: (audit || []).map((item: any) => ({ ...item, at: item.created_at })) };
    },
    async save(userId, document, revision, action, summary) {
      const { data, error } = await client.rpc("save_budget_forecast", { p_actor_id: userId, p_document: document, p_expected_revision: revision, p_action: action, p_summary: summary });
      if (error) {
        if (error.code === "40001") throw new ForecastError(409, "The forecast changed or a saved report was edited. Reload before saving. Saved reports must keep their original figures.");
        if (error.code === "42501") throw new ForecastError(403, "You do not have access to the budget forecast.");
        if (error.code === "22023") throw new ForecastError(400, "The workspace is too large or contains invalid values.");
        throw new ForecastError(503, "The school forecast could not be saved. Please try again.");
      }
      return { ...data, revision: Number(data.revision) };
    },
  };
}
