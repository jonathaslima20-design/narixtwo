import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.80.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PAGE_SIZE = 100;
const MAX_PAGES_INCREMENTAL = 2;
const MAX_PAGES_FULL = 20;
const BUDGET_MS_INCREMENTAL = 20_000;
const BUDGET_MS_FULL = 45_000;

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function onlyDigits(raw: string): string {
  return (raw || "").replace(/\D/g, "");
}

function normalizeBrPhone(raw: string): string {
  const digits = onlyDigits(raw);
  if (!digits) return "";
  if (digits.startsWith("55")) {
    const rest = digits.slice(2);
    if (rest.length === 10) {
      const ddd = rest.slice(0, 2);
      const first = rest.charAt(2);
      const subscriber = rest.slice(2);
      if (/[6-9]/.test(first)) return `55${ddd}9${subscriber}`;
    }
    return digits;
  }
  if (digits.length === 11) {
    const first = digits.charAt(2);
    if (/[6-9]/.test(first)) return `55${digits}`;
  }
  if (digits.length === 10) {
    const ddd = digits.slice(0, 2);
    const first = digits.charAt(2);
    const subscriber = digits.slice(2);
    if (/[6-9]/.test(first)) return `55${ddd}9${subscriber}`;
    return `55${digits}`;
  }
  return digits;
}

function extractText(msg: Record<string, unknown>): string {
  const m = (msg.message ?? {}) as Record<string, unknown>;
  if (typeof m.conversation === "string") return m.conversation;
  const ext = m.extendedTextMessage as Record<string, unknown> | undefined;
  if (ext && typeof ext.text === "string") return ext.text;
  const img = m.imageMessage as Record<string, unknown> | undefined;
  if (img && typeof img.caption === "string") return img.caption;
  const vid = m.videoMessage as Record<string, unknown> | undefined;
  if (vid && typeof vid.caption === "string") return vid.caption;
  const doc = m.documentMessage as Record<string, unknown> | undefined;
  if (doc && typeof doc.caption === "string") return doc.caption;
  return "";
}

function extractMediaType(msg: Record<string, unknown>): string {
  const m = (msg.message ?? {}) as Record<string, unknown>;
  if (m.imageMessage) return "image";
  if (m.videoMessage) return "video";
  if (m.audioMessage) return "audio";
  if (m.documentMessage) return "document";
  if (m.stickerMessage) return "sticker";
  return "";
}

function extractAudioSeconds(msg: Record<string, unknown>): number {
  const m = (msg.message ?? {}) as Record<string, unknown>;
  const a = m.audioMessage as Record<string, unknown> | undefined;
  if (!a) return 0;
  const s = a.seconds;
  return typeof s === "number" && s > 0 ? Math.round(s) : 0;
}

function parseEvolutionTimestamp(raw: unknown): string | null {
  const minMs = Date.UTC(2015, 0, 1);
  const maxMs = Date.now() + 5 * 60 * 1000;

  function fromNumber(n: number): string | null {
    if (!Number.isFinite(n) || n <= 0) return null;
    const ms = n < 1e12 ? n * 1000 : n;
    if (ms < minMs || ms > maxMs) return null;
    return new Date(ms).toISOString();
  }

  if (typeof raw === "number") return fromNumber(raw);
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) return fromNumber(Number(trimmed));
    const d = new Date(trimmed);
    const t = d.getTime();
    if (!Number.isNaN(t) && t >= minMs && t <= maxMs) return d.toISOString();
    return null;
  }
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const key of ["_seconds", "seconds", "low", "value"]) {
      const c = obj[key];
      if (typeof c === "number" || typeof c === "string") {
        const iso = parseEvolutionTimestamp(c);
        if (iso) return iso;
      }
    }
  }
  return null;
}

function pickMessageTimestamp(msg: Record<string, unknown>): string {
  const key = msg.key as Record<string, unknown> | undefined;
  const sources: unknown[] = [
    msg.messageTimestamp,
    key?.timestamp,
    msg.date,
    msg.t,
    msg.timestamp,
    msg.createdAt,
    msg.created_at,
  ];
  for (const s of sources) {
    if (s === undefined || s === null || s === "") continue;
    const iso = parseEvolutionTimestamp(s);
    if (iso) return iso;
  }
  return new Date().toISOString();
}

async function fetchJsonSafe(url: string, init: RequestInit): Promise<unknown> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch (_) {
    return null;
  }
}

function extractMessages(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === "object") {
    const anyData = data as Record<string, unknown>;
    if (Array.isArray(anyData.messages)) return anyData.messages as Record<string, unknown>[];
    const msgObj = anyData.messages as Record<string, unknown> | undefined;
    if (msgObj && Array.isArray(msgObj.records)) return msgObj.records as Record<string, unknown>[];
    if (Array.isArray(anyData.records)) return anyData.records as Record<string, unknown>[];
    if (Array.isArray(anyData.data)) return anyData.data as Record<string, unknown>[];
  }
  return [];
}

type BodyBuilder = (page: number) => Record<string, unknown>;

async function fetchPage(
  endpoint: string,
  headers: Record<string, string>,
  builder: BodyBuilder,
  page: number,
): Promise<Record<string, unknown>[]> {
  const data = await fetchJsonSafe(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(builder(page)),
  });
  return extractMessages(data);
}

async function fetchMessagesPaginated(
  evoUrl: string,
  apiKey: string,
  instance: string,
  remoteJid: string,
  beforeUnix: number | null,
  afterUnix: number | null,
  sinceUnix: number | null,
  maxPages: number,
  budgetMs: number,
): Promise<{ msgs: Record<string, unknown>[]; hasMore: boolean; reachedSince: boolean }> {
  const headers = { "Content-Type": "application/json", apikey: apiKey };
  const endpoint = `${evoUrl}/chat/findMessages/${encodeURIComponent(instance)}`;
  const deadline = Date.now() + budgetMs;

  const makeWhere = (): Record<string, unknown> => {
    const whereKey: Record<string, unknown> = { remoteJid };
    const where: Record<string, unknown> = { key: whereKey };
    const ts: Record<string, unknown> = {};
    if (beforeUnix) ts.lt = beforeUnix;
    if (afterUnix) ts.gt = afterUnix;
    if (Object.keys(ts).length) where.messageTimestamp = ts;
    return where;
  };

  const builders: BodyBuilder[] = [
    (p) => ({ where: makeWhere(), page: p, offset: PAGE_SIZE }),
    (p) => ({ where: makeWhere(), page: p, limit: PAGE_SIZE }),
    (p) => ({ remoteJid, page: p, limit: PAGE_SIZE }),
  ];

  let chosenBuilder: BodyBuilder | null = null;
  const firstPageResults: Record<string, unknown>[] = [];
  for (const b of builders) {
    const result = await fetchPage(endpoint, headers, b, 1);
    if (result.length > 0) {
      chosenBuilder = b;
      firstPageResults.push(...result);
      break;
    }
  }

  if (!chosenBuilder) {
    return { msgs: [], hasMore: false, reachedSince: true };
  }

  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  const push = (list: Record<string, unknown>[]): { filtered: number; kept: number } => {
    let filtered = 0;
    let kept = 0;
    for (const m of list) {
      const key = m.key as Record<string, unknown> | undefined;
      const id = typeof key?.id === "string" ? key.id : "";
      if (!id) continue;
      if (seen.has(id)) continue;
      const iso = pickMessageTimestamp(m);
      const t = new Date(iso).getTime() / 1000;
      if (beforeUnix && t >= beforeUnix) continue;
      if (afterUnix && t <= afterUnix) continue;
      if (sinceUnix && t < sinceUnix) {
        filtered += 1;
        continue;
      }
      seen.add(id);
      out.push(m);
      kept += 1;
    }
    return { filtered, kept };
  };

  let pagesFetched = 1;
  let lastBatchSize = firstPageResults.length;
  const firstStats = push(firstPageResults);
  let reachedSince = Boolean(sinceUnix) && firstStats.filtered > 0;

  while (
    pagesFetched < maxPages &&
    lastBatchSize >= PAGE_SIZE &&
    !reachedSince &&
    Date.now() < deadline
  ) {
    const nextPage = pagesFetched + 1;
    const batch = await fetchPage(endpoint, headers, chosenBuilder, nextPage);
    pagesFetched += 1;
    lastBatchSize = batch.length;
    if (batch.length === 0) break;
    const stats = push(batch);
    if (stats.filtered > 0 && sinceUnix) reachedSince = true;
    if (stats.kept === 0 && stats.filtered === 0) break;
  }

  const hasMore = lastBatchSize >= PAGE_SIZE && !reachedSince;
  return { msgs: out, hasMore, reachedSince };
}

interface HydrateResult {
  messages_added: number;
  has_more: boolean;
  oldest_synced_at: string | null;
  newest_synced_at: string | null;
  total_fetched: number;
  reached_since: boolean;
}

async function hydrate(
  admin: SupabaseClient,
  userId: string,
  leadId: string,
  remoteJid: string,
  instanceName: string,
  evoUrl: string,
  apiKey: string,
  opts: {
    before: string | null;
    after: string | null;
    sinceIso: string | null;
    mode: "incremental" | "full";
  },
): Promise<HydrateResult> {
  const beforeUnix = opts.before ? Math.floor(new Date(opts.before).getTime() / 1000) : null;
  const afterUnix = opts.after ? Math.floor(new Date(opts.after).getTime() / 1000) : null;
  const sinceUnix = opts.sinceIso ? Math.floor(new Date(opts.sinceIso).getTime() / 1000) : null;

  const maxPages = opts.mode === "full" ? MAX_PAGES_FULL : MAX_PAGES_INCREMENTAL;
  const budgetMs = opts.mode === "full" ? BUDGET_MS_FULL : BUDGET_MS_INCREMENTAL;

  const { msgs, hasMore, reachedSince } = await fetchMessagesPaginated(
    evoUrl,
    apiKey,
    instanceName,
    remoteJid,
    beforeUnix,
    afterUnix,
    sinceUnix,
    maxPages,
    budgetMs,
  );

  const prepared: Record<string, unknown>[] = [];
  let oldestIso: string | null = null;
  let newestIso: string | null = null;
  let newestPreview = "";

  for (const m of msgs) {
    const key = (m.key ?? {}) as Record<string, unknown>;
    const fromMe = Boolean(key.fromMe);
    const waId = typeof key.id === "string" ? key.id : "";
    if (!waId) continue;

    const content = extractText(m);
    const media_type = extractMediaType(m);
    const audioSeconds = media_type === "audio" ? extractAudioSeconds(m) : 0;
    const iso = pickMessageTimestamp(m);

    if (!oldestIso || iso < oldestIso) oldestIso = iso;
    if (!newestIso || iso > newestIso) {
      newestIso = iso;
      newestPreview = content || (media_type ? `[${media_type}]` : "");
    }

    prepared.push({
      user_id: userId,
      lead_id: leadId,
      direction: fromMe ? "out" : "in",
      content,
      media_url: "",
      media_type,
      audio_duration_seconds: audioSeconds,
      whatsapp_message_id: waId,
      status: fromMe ? "sent" : "delivered",
      created_at: iso,
    });
  }

  prepared.sort((a, b) =>
    new Date(a.created_at as string).getTime() - new Date(b.created_at as string).getTime(),
  );

  let inserted = 0;
  for (let i = 0; i < prepared.length; i += 500) {
    const slice = prepared.slice(i, i + 500);
    const { count } = await admin
      .from("messages")
      .upsert(slice, {
        onConflict: "user_id,whatsapp_message_id",
        ignoreDuplicates: true,
        count: "exact",
      });
    inserted += count ?? 0;
  }

  // Heal rows previously stored with a fallback "now" timestamp.
  for (const row of prepared) {
    const iso = row.created_at as string;
    const waId = row.whatsapp_message_id as string;
    const { data: existing } = await admin
      .from("messages")
      .select("id, created_at")
      .eq("user_id", userId)
      .eq("whatsapp_message_id", waId)
      .maybeSingle();
    if (!existing) continue;
    const currentIso = existing.created_at as string;
    if (currentIso === iso) continue;
    const driftMs = Math.abs(new Date(currentIso).getTime() - new Date(iso).getTime());
    if (driftMs < 2000) continue;
    await admin.from("messages").update({ created_at: iso }).eq("id", existing.id as string);
  }

  const { data: currentLead } = await admin
    .from("leads")
    .select("last_activity_at, oldest_synced_at, newest_synced_at")
    .eq("id", leadId)
    .maybeSingle();

  const patch: Record<string, unknown> = {
    hydrated_at: new Date().toISOString(),
    has_more_history: hasMore,
  };

  if (oldestIso) {
    const currentOldest = currentLead?.oldest_synced_at as string | null | undefined;
    if (!currentOldest || oldestIso < currentOldest) {
      patch.oldest_synced_at = oldestIso;
    }
  }

  if (newestIso) {
    const currentNewest = currentLead?.newest_synced_at as string | null | undefined;
    if (!currentNewest || newestIso > currentNewest) {
      patch.newest_synced_at = newestIso;
    }
    const currentLast = currentLead?.last_activity_at as string | null | undefined;
    if (!currentLast || newestIso > currentLast) {
      patch.last_activity_at = newestIso;
      if (newestPreview) patch.last_message = newestPreview;
    }
  }

  if (inserted > 0) {
    const { count: totalCount } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", leadId);
    if (typeof totalCount === "number") patch.message_count = totalCount;
  }

  if (opts.mode === "full" && reachedSince) {
    patch.full_history_synced_at = new Date().toISOString();
    patch.full_history_synced_through = opts.sinceIso;
  }

  await admin.from("leads").update(patch).eq("id", leadId);

  return {
    messages_added: inserted,
    has_more: hasMore,
    oldest_synced_at: (patch.oldest_synced_at as string | undefined) ??
      ((currentLead?.oldest_synced_at as string | null | undefined) ?? oldestIso),
    newest_synced_at: (patch.newest_synced_at as string | undefined) ??
      ((currentLead?.newest_synced_at as string | null | undefined) ?? newestIso),
    total_fetched: msgs.length,
    reached_since: reachedSince,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return json(401, { error: "Missing authorization token" });

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
    });
    if (!userRes.ok) return json(401, { error: "Invalid authentication" });
    const user = (await userRes.json()) as { id?: string };
    if (!user?.id) return json(401, { error: "Invalid authentication" });

    const body = (await req.json().catch(() => ({}))) as {
      lead_id?: string;
      before?: string;
      after?: string;
      since?: string;
      mode?: "incremental" | "full";
    };
    const leadId = body.lead_id;
    if (!leadId) return json(400, { error: "lead_id é obrigatório" });

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: lead } = await admin
      .from("leads")
      .select("id, phone, user_id, whatsapp_jid")
      .eq("id", leadId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!lead) return json(404, { error: "Lead não encontrado" });

    const leadRow = lead as { phone: string; whatsapp_jid: string | null };
    const storedJid = leadRow.whatsapp_jid || "";
    const phoneForJid = leadRow.phone.startsWith("lid:")
      ? ""
      : normalizeBrPhone(leadRow.phone);
    const remoteJid = storedJid || (phoneForJid ? `${phoneForJid}@s.whatsapp.net` : "");
    if (!remoteJid) return json(400, { error: "Chat sem identificador WhatsApp" });

    const { data: instance } = await admin
      .from("whatsapp_instances")
      .select("id, instance_name, status, evolution_api_key")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!instance) return json(400, { error: "Nenhuma instância do WhatsApp encontrada" });
    if (instance.status !== "connected") {
      return json(400, { error: "Conecte o WhatsApp para carregar o histórico" });
    }

    const { data: settings } = await admin
      .from("admin_settings")
      .select("key, value")
      .in("key", ["EVOLUTION_API_URL", "EVOLUTION_GLOBAL_KEY"]);
    const evoUrl = settings?.find((s) => s.key === "EVOLUTION_API_URL")?.value?.replace(/\/+$/, "");
    const globalKey = settings?.find((s) => s.key === "EVOLUTION_GLOBAL_KEY")?.value;
    const apiKey =
      (instance.evolution_api_key as string | null | undefined)?.trim() || globalKey || "";
    if (!evoUrl || !apiKey) return json(400, { error: "Evolution API não configurada" });

    const mode: "incremental" | "full" = body.mode === "full" ? "full" : "incremental";

    const result = await hydrate(
      admin,
      user.id,
      leadId,
      remoteJid,
      instance.instance_name as string,
      evoUrl,
      apiKey,
      {
        before: body.before ?? null,
        after: body.after ?? null,
        sinceIso: body.since ?? null,
        mode,
      },
    );

    return json(200, { ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("whatsapp-hydrate-chat failed:", message);
    return json(500, { error: message });
  }
});
