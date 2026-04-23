import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.80.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PAGE_SIZE = 200;
const MAX_PAGES_PER_SOURCE = 120;
const BUDGET_MS = 120_000;

type Source = "chats" | "contacts";
type RequestShape = "post_where" | "post_limit" | "post_empty" | "get";

type Counters = {
  evolution_total_fetched: number;
  pages_fetched_chats: number;
  pages_fetched_contacts: number;
  imported: number;
  created_count: number;
  updated_count: number;
  skipped_groups: number;
  skipped_broadcasts: number;
  skipped_invalid_phone: number;
  skipped_own_number: number;
  skipped_duplicates: number;
  groups_total: number;
};

function newCounters(): Counters {
  return {
    evolution_total_fetched: 0,
    pages_fetched_chats: 0,
    pages_fetched_contacts: 0,
    imported: 0,
    created_count: 0,
    updated_count: 0,
    skipped_groups: 0,
    skipped_broadcasts: 0,
    skipped_invalid_phone: 0,
    skipped_own_number: 0,
    skipped_duplicates: 0,
    groups_total: 0,
  };
}

async function countGroups(evoUrl: string, apiKey: string, instance: string): Promise<number> {
  const headers = { "Content-Type": "application/json", apikey: apiKey };
  const endpoints = [
    `${evoUrl}/group/fetchAllGroups/${encodeURIComponent(instance)}?getParticipants=false`,
    `${evoUrl}/group/fetchAllGroups/${encodeURIComponent(instance)}`,
  ];
  for (const endpoint of endpoints) {
    const res = await fetchJson(endpoint, { method: "GET", headers });
    if (!res.ok) continue;
    const arr = toArray(res.data, ["groups", "data", "records"]);
    if (arr.length === 0 && !Array.isArray(res.data)) continue;
    return arr.filter((g) => {
      const id =
        (g.id as string | undefined) ||
        (g.remoteJid as string | undefined) ||
        (g.jid as string | undefined) ||
        "";
      return id.endsWith("@g.us");
    }).length;
  }
  return 0;
}

function extractLastActivityIso(node: Record<string, unknown>): string {
  const candidates: unknown[] = [
    node.conversationTimestamp,
    node.updatedAt,
    node.updated_at,
    node.lastMessageTimestamp,
    node.t,
  ];
  const lastMsg = node.lastMessage as Record<string, unknown> | undefined;
  if (lastMsg) {
    candidates.push(lastMsg.messageTimestamp, lastMsg.timestamp, lastMsg.t);
    const lmKey = lastMsg.key as Record<string, unknown> | undefined;
    if (lmKey) candidates.push(lmKey.timestamp);
  }
  for (const c of candidates) {
    if (c == null) continue;
    if (typeof c === "number" && isFinite(c) && c > 0) {
      const ms = c > 1e12 ? c : c * 1000;
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
    if (typeof c === "string" && c.trim()) {
      const asNum = Number(c);
      if (!isNaN(asNum) && asNum > 0) {
        const ms = asNum > 1e12 ? asNum : asNum * 1000;
        const d = new Date(ms);
        if (!isNaN(d.getTime())) return d.toISOString();
      }
      const d = new Date(c);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
  }
  return "";
}

function extractLastMessagePreview(node: Record<string, unknown>): string {
  const lastMsg = node.lastMessage as Record<string, unknown> | undefined;
  if (!lastMsg) return "";
  const message = (lastMsg.message ?? {}) as Record<string, unknown>;
  if (typeof message.conversation === "string") return message.conversation;
  const ext = message.extendedTextMessage as Record<string, unknown> | undefined;
  if (ext && typeof ext.text === "string") return ext.text;
  const img = message.imageMessage as Record<string, unknown> | undefined;
  if (img && typeof img.caption === "string") return img.caption || "[imagem]";
  if (img) return "[imagem]";
  const vid = message.videoMessage as Record<string, unknown> | undefined;
  if (vid) return typeof vid.caption === "string" && vid.caption ? vid.caption : "[vídeo]";
  if (message.audioMessage) return "[áudio]";
  if (message.documentMessage) return "[documento]";
  if (message.stickerMessage) return "[figurinha]";
  return "";
}

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function onlyDigits(raw: string): string {
  return (raw || "").replace(/\D/g, "");
}

function normalizePhone(raw: string): string {
  const digits = onlyDigits(raw);
  if (!digits) return "";
  if (digits.length < 8) return "";
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

function normalizePhoneFromJid(jid: unknown): string {
  if (typeof jid !== "string") return "";
  const clean = jid.split(":")[0];
  const base = clean.includes("@") ? clean.split("@")[0] : clean;
  return normalizePhone(base);
}

function extractProfilePic(node: Record<string, unknown>): string {
  const direct =
    (node.profilePicUrl as string | undefined) ||
    (node.profilePictureUrl as string | undefined) ||
    (node.picture as string | undefined) ||
    "";
  if (typeof direct === "string" && direct.startsWith("http")) return direct;
  return "";
}

type FetchResult = { data: unknown; status: number; ok: boolean; error?: string };

async function fetchJson(url: string, init: RequestInit): Promise<FetchResult> {
  try {
    const res = await fetch(url, init);
    const body = await res.json().catch(() => null);
    return { data: body, status: res.status, ok: res.ok };
  } catch (err) {
    return { data: null, status: 0, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function toArray(data: unknown, keys: string[]): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === "object") {
    for (const k of keys) {
      const arr = (data as Record<string, unknown>)[k];
      if (Array.isArray(arr)) return arr as Record<string, unknown>[];
    }
  }
  return [];
}

function buildRequest(
  shape: RequestShape,
  headers: Record<string, string>,
  page: number,
): RequestInit {
  switch (shape) {
    case "post_where":
      return { method: "POST", headers, body: JSON.stringify({ where: {}, page, offset: PAGE_SIZE }) };
    case "post_limit":
      return { method: "POST", headers, body: JSON.stringify({ page, limit: PAGE_SIZE }) };
    case "post_empty":
      return { method: "POST", headers, body: JSON.stringify({}) };
    case "get":
      return { method: "GET", headers };
  }
}

async function fetchPage(
  kind: Source,
  evoUrl: string,
  apiKey: string,
  instance: string,
  page: number,
  shapeRef: { shape: RequestShape | null },
): Promise<{ entries: Record<string, unknown>[]; shape: RequestShape | null; lastStatus: number }> {
  const headers = { "Content-Type": "application/json", apikey: apiKey };
  const endpoint = `${evoUrl}/chat/find${kind === "chats" ? "Chats" : "Contacts"}/${encodeURIComponent(instance)}`;

  if (shapeRef.shape) {
    const init = buildRequest(shapeRef.shape, headers, page);
    const res = await fetchJson(endpoint, init);
    const arr = toArray(res.data, [kind, "data", "records", "result"]);
    return { entries: arr, shape: shapeRef.shape, lastStatus: res.status };
  }

  const shapes: RequestShape[] = ["post_where", "post_limit", "post_empty", "get"];
  let lastStatus = 0;
  for (const shape of shapes) {
    const init = buildRequest(shape, headers, page);
    const res = await fetchJson(endpoint, init);
    lastStatus = res.status;
    const arr = toArray(res.data, [kind, "data", "records", "result"]);
    if (arr.length > 0) {
      shapeRef.shape = shape;
      return { entries: arr, shape, lastStatus };
    }
  }
  return { entries: [], shape: null, lastStatus };
}

type ExtractCategory = "ok" | "group" | "broadcast" | "invalid_phone" | "no_jid";

function extractInfo(e: Record<string, unknown>): {
  category: ExtractCategory;
  info?: {
    jid: string;
    phone: string;
    name: string;
    pic: string;
    lastActivityIso: string;
    lastMessagePreview: string;
  };
} {
  const jid =
    (e.id as string | undefined) ||
    (e.remoteJid as string | undefined) ||
    (e.jid as string | undefined) ||
    "";
  if (!jid) return { category: "no_jid" };
  if (jid.endsWith("@g.us")) return { category: "group" };
  if (jid === "status@broadcast" || jid.endsWith("@broadcast")) return { category: "broadcast" };
  if (jid.endsWith("@newsletter")) return { category: "invalid_phone" };

  const isLid = jid.endsWith("@lid");
  const isStandard = jid.endsWith("@s.whatsapp.net") || jid.endsWith("@c.us");
  if (!isLid && !isStandard && jid.includes("@")) {
    return { category: "invalid_phone" };
  }

  const altPhone = isLid ? resolveRealPhoneFromNode(e) : "";
  const normalized = normalizePhoneFromJid(jid);

  let phone = "";
  let canonicalJid = jid;
  if (isLid) {
    if (altPhone) {
      phone = altPhone;
      canonicalJid = `${altPhone}@s.whatsapp.net`;
    } else {
      const rawId = jid.split("@")[0];
      if (!rawId) return { category: "invalid_phone" };
      phone = `lid:${rawId}`;
    }
  } else {
    if (!normalized) return { category: "invalid_phone" };
    if (normalized.length < 10 || normalized.length > 15) return { category: "invalid_phone" };
    phone = normalized;
  }

  const name =
    (e.pushName as string | undefined) ||
    (e.name as string | undefined) ||
    (e.verifiedName as string | undefined) ||
    (e.subject as string | undefined) ||
    (e.notify as string | undefined) ||
    "";
  return {
    category: "ok",
    info: {
      jid: canonicalJid,
      phone,
      name,
      pic: extractProfilePic(e),
      lastActivityIso: extractLastActivityIso(e),
      lastMessagePreview: extractLastMessagePreview(e),
    },
  };
}

function resolveRealPhoneFromNode(e: Record<string, unknown>): string {
  const candidates: unknown[] = [
    e.phoneNumber,
    e.phone,
    e.owner,
    e.jidAlt,
    e.alternate_id,
  ];
  const contact = e.contact as Record<string, unknown> | undefined;
  if (contact) {
    candidates.push(contact.id, contact.remoteJid, contact.phoneNumber);
  }
  for (const c of candidates) {
    if (typeof c !== "string" || !c) continue;
    if (c.endsWith("@s.whatsapp.net") || c.endsWith("@c.us")) {
      const base = c.split("@")[0];
      const norm = normalizePhone(base);
      if (norm && norm.length >= 10 && norm.length <= 15) return norm;
    }
    const norm = normalizePhone(c);
    if (norm && norm.length >= 10 && norm.length <= 15) return norm;
  }
  return "";
}

async function upsertLead(
  admin: SupabaseClient,
  userId: string,
  info: {
    jid: string;
    phone: string;
    name: string;
    pic: string;
    lastActivityIso: string;
    lastMessagePreview: string;
  },
  ownerProfileName: string,
): Promise<"created" | "updated" | "skipped"> {
  const byJid = await admin
    .from("leads")
    .select("id, name, profile_picture_url, last_activity_at, last_message, whatsapp_jid")
    .eq("user_id", userId)
    .eq("whatsapp_jid", info.jid)
    .maybeSingle();
  const existing = byJid.data
    ? byJid.data
    : (
        await admin
          .from("leads")
          .select("id, name, profile_picture_url, last_activity_at, last_message, whatsapp_jid")
          .eq("user_id", userId)
          .eq("phone", info.phone)
          .maybeSingle()
      ).data;

  if (existing) {
    const updates: Record<string, unknown> = {};
    const existingName = (existing.name as string | null) ?? "";
    if (
      (!existingName || existingName === info.phone) &&
      info.name &&
      (!ownerProfileName || info.name !== ownerProfileName)
    ) {
      updates.name = info.name;
    }
    if (info.pic && !existing.profile_picture_url) {
      updates.profile_picture_url = info.pic;
      updates.profile_picture_updated_at = new Date().toISOString();
    }
    if (info.lastActivityIso) {
      const current = existing.last_activity_at as string | null | undefined;
      if (!current || info.lastActivityIso > current) {
        updates.last_activity_at = info.lastActivityIso;
      }
    }
    if (!existing.whatsapp_jid && info.jid) {
      updates.whatsapp_jid = info.jid;
    }
    if (Object.keys(updates).length === 0) return "skipped";
    await admin.from("leads").update(updates).eq("id", existing.id);
    return "updated";
  }

  const insertPayload: Record<string, unknown> = {
    user_id: userId,
    phone: info.phone,
    whatsapp_jid: info.jid,
    name: info.name && (!ownerProfileName || info.name !== ownerProfileName) ? info.name : "",
    last_message: "",
    message_count: 0,
    unread_count: 0,
    last_activity_at: info.lastActivityIso || null,
    source: "whatsapp",
    pipeline_stage: "new",
    temperature: "cold",
    category: "cold",
    has_more_history: true,
  };
  if (info.pic) {
    insertPayload.profile_picture_url = info.pic;
    insertPayload.profile_picture_updated_at = new Date().toISOString();
  }
  const { data: inserted } = await admin
    .from("leads")
    .upsert(insertPayload, { onConflict: "user_id,phone" })
    .select("id")
    .maybeSingle();
  if (inserted?.id) {
    await admin.from("lead_activities").insert({
      user_id: userId,
      lead_id: inserted.id,
      action: "created",
      meta: { source: "whatsapp_seed_contacts" },
    });
    return "created";
  }
  return "skipped";
}

async function loadResumeCursor(
  admin: SupabaseClient,
  userId: string,
): Promise<{ source: Source; page: number } | null> {
  const { data } = await admin
    .from("whatsapp_sync_runs")
    .select("cursor, status")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  if (data.status !== "timeout") return null;
  const c = data.cursor as { source?: Source; page?: number } | null;
  if (!c || !c.source || !c.page) return null;
  return { source: c.source, page: c.page };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startedAt = Date.now();
  let runId: string | null = null;
  const counters = newCounters();
  let timedOut = false;
  let lastCursor: { source: Source; page: number } | null = null;

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

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: instance } = await admin
      .from("whatsapp_instances")
      .select("id, instance_name, phone_number, profile_name, status, evolution_api_key, contacts_seeded_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!instance) return json(400, { error: "Nenhuma instância do WhatsApp encontrada" });
    if (instance.status !== "connected") {
      return json(400, { error: "Conecte o WhatsApp antes de semear os contatos" });
    }

    const body = (await req.json().catch(() => ({}))) as {
      force?: boolean;
      resume?: boolean;
    };
    if (!body.force && !body.resume && instance.contacts_seeded_at) {
      return json(200, { ok: true, already_seeded: true });
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

    const ownerPhone = (instance.phone_number as string | null) || "";
    const ownerProfileName = (instance.profile_name as string | null) || "";
    const instanceName = instance.instance_name as string;

    const resumeFrom = body.resume ? await loadResumeCursor(admin, user.id) : null;

    const { data: runRow } = await admin
      .from("whatsapp_sync_runs")
      .insert({
        user_id: user.id,
        instance_id: instance.id,
        status: "running",
        cursor: resumeFrom ?? null,
      })
      .select("id")
      .maybeSingle();
    runId = runRow?.id ?? null;

    const seenJids = new Set<string>();

    const sources: Source[] = ["chats"];
    const shapeRef: Record<Source, { shape: RequestShape | null }> = {
      chats: { shape: null },
      contacts: { shape: null },
    };

    outer: for (const kind of sources) {
      if (resumeFrom && kind !== resumeFrom.source && sources.indexOf(kind) < sources.indexOf(resumeFrom.source)) {
        continue;
      }
      const startPage = resumeFrom && kind === resumeFrom.source ? resumeFrom.page : 1;
      for (let page = startPage; page <= MAX_PAGES_PER_SOURCE; page++) {
        if (Date.now() - startedAt > BUDGET_MS) {
          timedOut = true;
          lastCursor = { source: kind, page };
          console.warn(`[seed-contacts] budget reached at source=${kind} page=${page}`);
          break outer;
        }

        const { entries, lastStatus } = await fetchPage(kind, evoUrl, apiKey, instanceName, page, shapeRef[kind]);
        if (entries.length === 0) {
          if (lastStatus >= 400) {
            console.warn(`[seed-contacts] empty page with HTTP ${lastStatus} source=${kind} page=${page}`);
          }
          break;
        }

        counters.evolution_total_fetched += entries.length;
        if (kind === "chats") counters.pages_fetched_chats += 1;
        else counters.pages_fetched_contacts += 1;

        const seenBeforePage = seenJids.size;

        for (const e of entries) {
          const { category, info } = extractInfo(e);
          if (category === "group") {
            counters.skipped_groups += 1;
            continue;
          }
          if (category === "broadcast") {
            counters.skipped_broadcasts += 1;
            continue;
          }
          if (category === "invalid_phone" || category === "no_jid") {
            counters.skipped_invalid_phone += 1;
            continue;
          }
          if (!info) continue;
          if (ownerPhone && info.phone === ownerPhone) {
            counters.skipped_own_number += 1;
            continue;
          }
          if (seenJids.has(info.jid)) {
            counters.skipped_duplicates += 1;
            continue;
          }
          seenJids.add(info.jid);
          const res = await upsertLead(admin, user.id, info, ownerProfileName);
          if (res === "created") counters.created_count += 1;
          else if (res === "updated") counters.updated_count += 1;
        }

        const newUniques = seenJids.size - seenBeforePage;
        if (page > startPage && newUniques === 0) {
          console.warn(
            `[seed-contacts] pagination appears unsupported for source=${kind} (page ${page} yielded 0 new JIDs); breaking`,
          );
          break;
        }

        if (entries.length < PAGE_SIZE) break;
      }
    }

    if (!timedOut) {
      counters.groups_total = await countGroups(evoUrl, apiKey, instanceName);
    }

    counters.imported = counters.created_count + counters.updated_count;

    const finishedStatus = timedOut ? "timeout" : "completed";
    const elapsed = Date.now() - startedAt;

    if (runId) {
      await admin
        .from("whatsapp_sync_runs")
        .update({
          ...counters,
          status: finishedStatus,
          finished_at: new Date().toISOString(),
          elapsed_ms: elapsed,
          cursor: timedOut ? lastCursor : null,
          timed_out: timedOut,
        })
        .eq("id", runId);
    }

    if (!timedOut) {
      await admin
        .from("whatsapp_instances")
        .update({ contacts_seeded_at: new Date().toISOString() })
        .eq("id", instance.id);
    }

    console.log(
      `[seed-contacts] user=${user.id} status=${finishedStatus} fetched=${counters.evolution_total_fetched} ` +
        `imported=${counters.imported} created=${counters.created_count} updated=${counters.updated_count} ` +
        `groups=${counters.skipped_groups} broadcasts=${counters.skipped_broadcasts} ` +
        `invalid=${counters.skipped_invalid_phone} dupes=${counters.skipped_duplicates} ` +
        `own=${counters.skipped_own_number} elapsed_ms=${elapsed}`,
    );

    return json(200, {
      ok: true,
      run_id: runId,
      status: finishedStatus,
      timed_out: timedOut,
      cursor: lastCursor,
      discovered: seenJids.size,
      ...counters,
      elapsed_ms: elapsed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("whatsapp-seed-contacts failed:", message);

    if (runId) {
      try {
        const admin = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        await admin
          .from("whatsapp_sync_runs")
          .update({
            ...counters,
            status: "failed",
            finished_at: new Date().toISOString(),
            elapsed_ms: Date.now() - startedAt,
            last_error: message,
            timed_out: timedOut,
            cursor: lastCursor,
          })
          .eq("id", runId);
      } catch (_) {
        // swallow
      }
    }

    return json(500, { error: message });
  }
});
