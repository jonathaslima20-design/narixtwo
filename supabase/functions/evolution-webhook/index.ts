import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.80.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function mapConnectionState(state: unknown): "connected" | "connecting" | "disconnected" | null {
  if (typeof state !== "string") return null;
  const s = state.toLowerCase();
  if (s === "open" || s === "connected") return "connected";
  if (s === "connecting" || s === "qr" || s === "qrcode" || s === "pairing" || s === "syncing") return "connecting";
  if (s === "close" || s === "closed" || s === "disconnected" || s === "logout") return "disconnected";
  return null;
}

function parseEvolutionTimestamp(raw: unknown): string {
  const now = Date.now();
  const minMs = Date.UTC(2015, 0, 1);
  const maxMs = now + 5 * 60 * 1000;

  function coerce(n: number): number | null {
    if (!Number.isFinite(n) || n <= 0) return null;
    const ms = n < 1e12 ? n * 1000 : n;
    if (ms < minMs || ms > maxMs) return null;
    return ms;
  }

  if (typeof raw === "number") {
    const ms = coerce(raw);
    if (ms !== null) return new Date(ms).toISOString();
  } else if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (/^\d+$/.test(trimmed)) {
      const ms = coerce(Number(trimmed));
      if (ms !== null) return new Date(ms).toISOString();
    } else if (trimmed) {
      const d = new Date(trimmed);
      const t = d.getTime();
      if (!Number.isNaN(t) && t >= minMs && t <= maxMs) return d.toISOString();
    }
  } else if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const candidates = [obj._seconds, obj.seconds, obj.low, obj.value];
    for (const c of candidates) {
      if (typeof c === "number" || typeof c === "string") {
        const iso = parseEvolutionTimestamp(c);
        if (iso) return iso;
      }
    }
  }
  return new Date().toISOString();
}

function pickMessageTimestamp(msg: Record<string, unknown>): string {
  const sources: unknown[] = [
    msg.messageTimestamp,
    (msg.key as Record<string, unknown> | undefined)?.timestamp,
    msg.date,
    msg.t,
    msg.timestamp,
  ];
  const now = Date.now();
  const minMs = Date.UTC(2015, 0, 1);
  const maxMs = now + 5 * 60 * 1000;
  for (const s of sources) {
    if (s === undefined || s === null || s === "") continue;
    const iso = parseEvolutionTimestamp(s);
    const t = new Date(iso).getTime();
    if (t >= minMs && t <= maxMs && Math.abs(t - now) > 1000) return iso;
  }
  for (const s of sources) {
    if (s === undefined || s === null || s === "") continue;
    return parseEvolutionTimestamp(s);
  }
  return new Date().toISOString();
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
  const btn = m.buttonsResponseMessage as Record<string, unknown> | undefined;
  if (btn && typeof btn.selectedDisplayText === "string") return btn.selectedDisplayText;
  const list = m.listResponseMessage as Record<string, unknown> | undefined;
  if (list && typeof list.title === "string") return list.title;
  return "";
}

interface ExtractedPreview {
  url: string;
  title: string;
  description: string;
  image: string;
  site_name: string;
}

function extractFirstUrlFromText(text: string): string {
  if (!text) return "";
  const match = text.match(/\bhttps?:\/\/[^\s<>"']+/i);
  if (!match) return "";
  return match[0].replace(/[.,;:!?)\]}'"]+$/, "");
}

function extractLinkPreview(msg: Record<string, unknown>): ExtractedPreview {
  const empty: ExtractedPreview = { url: "", title: "", description: "", image: "", site_name: "" };
  const m = (msg.message ?? {}) as Record<string, unknown>;
  const ext = m.extendedTextMessage as Record<string, unknown> | undefined;
  if (ext) {
    const url =
      (typeof ext.matchedText === "string" ? ext.matchedText : "") ||
      (typeof ext.canonicalUrl === "string" ? ext.canonicalUrl : "") ||
      "";
    const title = typeof ext.title === "string" ? ext.title : "";
    const description = typeof ext.description === "string" ? ext.description : "";
    if (url || title || description) {
      return {
        url,
        title,
        description,
        image: "",
        site_name: "",
      };
    }
  }
  const ctxCandidates: Array<Record<string, unknown> | undefined> = [
    ext?.contextInfo as Record<string, unknown> | undefined,
    m.contextInfo as Record<string, unknown> | undefined,
  ];
  for (const ctx of ctxCandidates) {
    if (!ctx) continue;
    const ead = ctx.externalAdReply as Record<string, unknown> | undefined;
    if (ead) {
      const url =
        (typeof ead.sourceUrl === "string" ? ead.sourceUrl : "") ||
        (typeof ead.mediaUrl === "string" ? ead.mediaUrl : "");
      if (url) {
        return {
          url,
          title: typeof ead.title === "string" ? ead.title : "",
          description: typeof ead.body === "string" ? ead.body : "",
          image: "",
          site_name: typeof ead.sourceId === "string" ? ead.sourceId : "",
        };
      }
    }
  }
  return empty;
}

function extractMedia(msg: Record<string, unknown>): { media_type: string; media_url: string } {
  const m = (msg.message ?? {}) as Record<string, unknown>;
  if (m.imageMessage) return { media_type: "image", media_url: "" };
  if (m.videoMessage) return { media_type: "video", media_url: "" };
  if (m.audioMessage) return { media_type: "audio", media_url: "" };
  if (m.documentMessage) return { media_type: "document", media_url: "" };
  if (m.stickerMessage) return { media_type: "sticker", media_url: "" };
  return { media_type: "", media_url: "" };
}

function extractAudioMeta(msg: Record<string, unknown>): { seconds: number; mimeType: string } {
  const m = (msg.message ?? {}) as Record<string, unknown>;
  const a = m.audioMessage as Record<string, unknown> | undefined;
  if (!a) return { seconds: 0, mimeType: "audio/ogg" };
  const rawSeconds = a.seconds;
  const seconds = typeof rawSeconds === "number" && rawSeconds > 0 ? Math.round(rawSeconds) : 0;
  const mt = typeof a.mimetype === "string" ? (a.mimetype as string).split(";")[0].trim() : "";
  return { seconds, mimeType: mt || "audio/ogg" };
}

function extractInlineBase64(msg: Record<string, unknown>): string {
  const direct = typeof msg.base64 === "string" ? (msg.base64 as string) : "";
  if (direct && direct.length > 100) return direct.replace(/^data:[^;]+;base64,/, "");
  const m = (msg.message ?? {}) as Record<string, unknown>;
  const inner = typeof m.base64 === "string" ? (m.base64 as string) : "";
  if (inner && inner.length > 100) return inner.replace(/^data:[^;]+;base64,/, "");
  const a = m.audioMessage as Record<string, unknown> | undefined;
  const fromAudio = a && typeof a.base64 === "string" ? (a.base64 as string) : "";
  if (fromAudio && fromAudio.length > 100) return fromAudio.replace(/^data:[^;]+;base64,/, "");
  return "";
}

async function fetchMediaBase64FromEvolution(
  evoUrl: string,
  apiKey: string,
  instanceName: string,
  msg: Record<string, unknown>,
): Promise<string> {
  try {
    const res = await fetch(
      `${evoUrl}/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify({ message: { key: msg.key, message: msg.message }, convertToMp4: false }),
      },
    );
    if (!res.ok) return "";
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    const candidates: unknown[] = [data.base64, data.buffer, data.data, (data as Record<string, unknown>).mediaBase64];
    for (const c of candidates) {
      if (typeof c === "string" && c.length > 100) {
        return c.replace(/^data:[^;]+;base64,/, "");
      }
    }
    return "";
  } catch {
    return "";
  }
}

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return arr;
}

function extFromMime(mt: string): string {
  const s = mt.toLowerCase();
  if (s.includes("ogg")) return "ogg";
  if (s.includes("mpeg") || s.includes("mp3")) return "mp3";
  if (s.includes("wav")) return "wav";
  if (s.includes("aac")) return "aac";
  if (s.includes("mp4") || s.includes("m4a")) return "m4a";
  if (s.includes("webm")) return "webm";
  return "ogg";
}

function extractMediaMeta(
  msg: Record<string, unknown>,
  mediaType: string,
): { mimeType: string; filename: string } {
  const m = (msg.message ?? {}) as Record<string, unknown>;
  const node =
    mediaType === "image" ? (m.imageMessage as Record<string, unknown> | undefined) :
    mediaType === "video" ? (m.videoMessage as Record<string, unknown> | undefined) :
    mediaType === "document" ? (m.documentMessage as Record<string, unknown> | undefined) :
    mediaType === "sticker" ? (m.stickerMessage as Record<string, unknown> | undefined) :
    undefined;
  const rawMime = typeof node?.mimetype === "string" ? (node.mimetype as string).split(";")[0].trim() : "";
  const filename = typeof node?.fileName === "string" ? (node.fileName as string) : "";
  const fallbackMime =
    mediaType === "image" ? "image/jpeg" :
    mediaType === "video" ? "video/mp4" :
    mediaType === "document" ? "application/octet-stream" :
    mediaType === "sticker" ? "image/webp" :
    "application/octet-stream";
  return { mimeType: rawMime || fallbackMime, filename };
}

function extFromMimeOrName(mime: string, filename: string): string {
  if (filename) {
    const fromName = filename.split(".").pop();
    if (fromName && fromName.length <= 6) return fromName.toLowerCase();
  }
  const s = mime.toLowerCase();
  if (s.includes("jpeg") || s.includes("jpg")) return "jpg";
  if (s.includes("png")) return "png";
  if (s.includes("webp")) return "webp";
  if (s.includes("gif")) return "gif";
  if (s.includes("mp4")) return "mp4";
  if (s.includes("quicktime") || s.includes("mov")) return "mov";
  if (s.includes("pdf")) return "pdf";
  if (s.includes("msword") || s.includes("officedocument.wordprocessingml")) return "docx";
  if (s.includes("spreadsheet") || s.includes("excel")) return "xlsx";
  if (s.includes("plain")) return "txt";
  return "bin";
}

function mapPresence(state: unknown): "available" | "composing" | "recording" | "paused" | null {
  if (typeof state !== "string") return null;
  const s = state.toLowerCase();
  if (s === "composing" || s === "typing") return "composing";
  if (s === "recording") return "recording";
  if (s === "paused") return "paused";
  if (s === "available" || s === "unavailable" || s === "offline") return "available";
  return null;
}

function normalizePhoneFromJid(jid: unknown): string {
  if (typeof jid !== "string") return "";
  const clean = jid.split(":")[0];
  const base = clean.includes("@") ? clean.split("@")[0] : clean;
  return normalizeBrPhone(base);
}

function resolveChatIdentity(jid: string): { phone: string; jid: string } | null {
  if (!jid) return null;
  if (jid.endsWith("@g.us") || jid === "status@broadcast" || jid.endsWith("@broadcast")) {
    return null;
  }
  if (jid.endsWith("@newsletter")) return null;
  if (jid.endsWith("@lid")) {
    const rawId = jid.split(":")[0].split("@")[0];
    if (!rawId) return null;
    return { phone: `lid:${rawId}`, jid };
  }
  const phone = normalizePhoneFromJid(jid);
  if (!phone) return null;
  const canonicalJid = jid.endsWith("@c.us") || jid.endsWith("@s.whatsapp.net")
    ? jid
    : `${phone}@s.whatsapp.net`;
  return { phone, jid: canonicalJid };
}

async function findLeadByIdentity(
  admin: SupabaseClient,
  userId: string,
  identity: { phone: string; jid: string },
  columns: string,
) {
  const byJid = await admin
    .from("leads")
    .select(columns)
    .eq("user_id", userId)
    .eq("whatsapp_jid", identity.jid)
    .maybeSingle();
  if (byJid.data) return byJid.data;
  const byPhone = await admin
    .from("leads")
    .select(columns)
    .eq("user_id", userId)
    .eq("phone", identity.phone)
    .maybeSingle();
  return byPhone.data ?? null;
}

function extractInstanceName(body: Record<string, unknown>): string {
  if (typeof body.instance === "string") return body.instance;
  if (typeof body.instanceName === "string") return body.instanceName;
  const inst = body.instance as Record<string, unknown> | undefined;
  if (inst && typeof inst.instanceName === "string") return inst.instanceName;
  return "";
}

function extractEventName(body: Record<string, unknown>): string {
  const raw =
    (typeof body.event === "string" && body.event) ||
    (typeof body.type === "string" && body.type) ||
    "";
  return raw.toUpperCase().replace(/\./g, "_");
}

function extractQrFromPayload(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const p = data as Record<string, unknown>;
  const candidates: unknown[] = [
    p.base64,
    p.qrcode,
    (p.qrcode as Record<string, unknown> | undefined)?.base64,
    (p.qrcode as Record<string, unknown> | undefined)?.code,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 100) {
      return c.replace(/^data:image\/[a-zA-Z]+;base64,/, "");
    }
  }
  return "";
}

function extractProfilePic(node: Record<string, unknown> | undefined): string {
  if (!node) return "";
  const direct =
    (node.profilePicUrl as string | undefined) ||
    (node.profilePictureUrl as string | undefined) ||
    (node.picture as string | undefined) ||
    "";
  if (typeof direct === "string" && direct.startsWith("http")) return direct;
  return "";
}

function mapAckToStatus(ack: unknown): "sent" | "delivered" | "read" | "failed" | null {
  if (typeof ack === "number") {
    if (ack <= 0) return "failed";
    if (ack === 1) return "sent";
    if (ack === 2) return "delivered";
    if (ack === 3 || ack === 4) return "read";
    return null;
  }
  if (typeof ack === "string") {
    const s = ack.toUpperCase();
    if (s.includes("READ") || s === "PLAYED") return "read";
    if (s.includes("DELIVERY") || s === "DELIVERED") return "delivered";
    if (s === "SERVER" || s === "SERVER_ACK" || s === "SENT") return "sent";
    if (s.includes("ERROR") || s.includes("FAIL")) return "failed";
    if (s === "PENDING") return "sent";
  }
  return null;
}

const STATUS_RANK: Record<string, number> = {
  pending: 0,
  failed: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: settings } = await admin
      .from("admin_settings")
      .select("key, value")
      .eq("key", "EVOLUTION_WEBHOOK_TOKEN")
      .maybeSingle();

    const expectedToken = settings?.value ?? "";
    if (expectedToken) {
      const url = new URL(req.url);
      const urlToken = url.searchParams.get("token") ?? "";
      const headerToken = req.headers.get("x-webhook-token") ?? "";
      const authHeader = req.headers.get("authorization") ?? "";
      const bearerToken = authHeader.toLowerCase().startsWith("bearer ")
        ? authHeader.slice(7).trim()
        : "";
      const apikeyHeader = req.headers.get("apikey") ?? "";
      const candidates = [urlToken, headerToken, bearerToken, apikeyHeader];
      if (!candidates.some((c) => c === expectedToken)) {
        console.warn("evolution-webhook: invalid token");
        return json(401, { error: "Invalid webhook token" });
      }
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const instanceName = extractInstanceName(body);
    const event = extractEventName(body);
    const data = (body.data ?? {}) as Record<string, unknown>;

    if (!instanceName) {
      return json(200, { ok: true, skipped: "missing instance" });
    }

    const { data: instance } = await admin
      .from("whatsapp_instances")
      .select("*")
      .eq("instance_name", instanceName)
      .maybeSingle();

    if (!instance) {
      return json(200, { ok: true, skipped: "unknown instance" });
    }

    const userId = instance.user_id as string;

    if (event === "CONNECTION_UPDATE") {
      const state = (data.state ?? data.status ?? "") as string;
      const mapped = mapConnectionState(state);
      const nowIso = new Date().toISOString();
      const updates: Record<string, unknown> = { updated_at: nowIso };
      if (mapped) updates.status = mapped;
      if (mapped === "connected") {
        updates.qr_code = "";
        updates.last_error = null;
        const instNode = data.instance as Record<string, unknown> | undefined;
        const ownerJid =
          (data.wuid as string | undefined) ||
          (instNode?.wuid as string | undefined) ||
          (instNode?.owner as string | undefined) ||
          "";
        const phone = normalizePhoneFromJid(ownerJid);
        if (phone) updates.phone_number = phone;
        const ownerName =
          (typeof data.profileName === "string" && data.profileName) ||
          (typeof instNode?.profileName === "string" && (instNode.profileName as string)) ||
          (typeof data.pushName === "string" && (data.pushName as string)) ||
          (typeof instNode?.pushName === "string" && (instNode.pushName as string)) ||
          "";
        if (ownerName) updates.profile_name = ownerName;
      }
      if (mapped === "disconnected") {
        const qrUpdatedAt = instance.qr_updated_at as string | null | undefined;
        const hadRecentQr = qrUpdatedAt && (Date.now() - new Date(qrUpdatedAt).getTime()) < 120_000;
        const wasNotConnected = instance.status !== "connected";
        if (hadRecentQr && wasNotConnected) {
          updates.last_error =
            "O WhatsApp recusou vincular este dispositivo. Toque em Gerar novo QR Code e tente novamente. Se persistir, remova dispositivos vinculados no celular ou atualize o app do WhatsApp.";
        }
      }
      await admin.from("whatsapp_instances").update(updates).eq("id", instance.id);
      return json(200, { ok: true });
    }

    if (event === "QRCODE_UPDATED") {
      const qr = extractQrFromPayload(data);
      const nowIso = new Date().toISOString();
      const updates: Record<string, unknown> = {
        status: "connecting",
        updated_at: nowIso,
      };
      if (qr) {
        updates.qr_code = qr;
        updates.qr_updated_at = nowIso;
        updates.last_error = null;
      }
      await admin.from("whatsapp_instances").update(updates).eq("id", instance.id);
      return json(200, { ok: true });
    }

    if (event === "CONTACTS_UPSERT" || event === "CONTACTS_UPDATE" || event === "CHATS_UPSERT" || event === "CHATS_UPDATE") {
      const items = Array.isArray(data) ? data : Array.isArray((data as { contacts?: unknown }).contacts) ? (data as { contacts: unknown[] }).contacts : [data];
      const ownerPhone = (instance.phone_number as string | null | undefined) || "";
      const ownerProfileName = (instance.profile_name as string | null | undefined) || "";
      for (const raw of items as Record<string, unknown>[]) {
        const jid = (raw.id as string | undefined) || (raw.remoteJid as string | undefined) || "";
        const identity = resolveChatIdentity(jid);
        if (!identity) continue;
        if (ownerPhone && identity.phone === ownerPhone) continue;
        const pic = extractProfilePic(raw);
        const pushName = (raw.pushName as string | undefined) || (raw.name as string | undefined) || "";
        const existing = await findLeadByIdentity(admin, userId, identity, "id, name, whatsapp_jid");
        if (!existing) continue;
        const existingRow = existing as { id: string; name: string | null; whatsapp_jid: string | null };
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (pic) {
          updates.profile_picture_url = pic;
          updates.profile_picture_updated_at = new Date().toISOString();
        }
        if (!existingRow.whatsapp_jid) updates.whatsapp_jid = identity.jid;
        if (pushName && (!ownerProfileName || pushName !== ownerProfileName)) {
          if (!existingRow.name || existingRow.name === identity.phone) {
            updates.name = pushName;
          }
        }
        if (Object.keys(updates).length > 1) {
          await admin.from("leads").update(updates).eq("id", existingRow.id);
        }
      }
      return json(200, { ok: true });
    }

    if (event === "PRESENCE_UPDATE") {
      const items = Array.isArray(data) ? data : [data];
      for (const raw of items as Record<string, unknown>[]) {
        const jid =
          (typeof raw.id === "string" && raw.id) ||
          (typeof raw.remoteJid === "string" && raw.remoteJid) ||
          "";
        const identity = resolveChatIdentity(jid);
        if (!identity) continue;
        const presencesObj = (raw.presences ?? {}) as Record<string, unknown>;
        const candidateKey = jid || Object.keys(presencesObj)[0] || "";
        const presenceEntry = (presencesObj[candidateKey] ?? {}) as Record<string, unknown>;
        const rawState =
          presenceEntry.lastKnownPresence ??
          (raw.presence as unknown) ??
          (raw.state as unknown) ??
          (raw.status as unknown);
        const mapped = mapPresence(rawState);
        if (!mapped) continue;

        const existingLead = (await findLeadByIdentity(admin, userId, identity, "id")) as
          | { id: string }
          | null;
        if (!existingLead) continue;

        await admin.from("lead_presence").upsert(
          {
            lead_id: existingLead.id as string,
            user_id: userId,
            state: mapped,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "lead_id" },
        );
      }
      return json(200, { ok: true });
    }

    if (event === "MESSAGES_UPDATE" || event === "SEND_MESSAGE_UPDATE" || event === "MESSAGES_SET" || event === "MESSAGE_UPDATE") {
      const items = Array.isArray(data) ? data : Array.isArray((data as { updates?: unknown }).updates) ? (data as { updates: unknown[] }).updates : [data];
      for (const raw of items as Record<string, unknown>[]) {
        const key = (raw.key ?? {}) as Record<string, unknown>;
        const waId = (typeof key.id === "string" && key.id) || (typeof raw.keyId === "string" && raw.keyId) || (typeof raw.id === "string" && raw.id) || "";
        if (!waId) continue;
        const ack = raw.status ?? raw.ack ?? (raw.update as Record<string, unknown> | undefined)?.status;
        const mapped = mapAckToStatus(ack);
        if (!mapped) continue;

        const { data: existing } = await admin
          .from("messages")
          .select("id, status")
          .eq("user_id", userId)
          .eq("whatsapp_message_id", waId)
          .maybeSingle();

        if (existing) {
          const currentRank = STATUS_RANK[existing.status ?? "pending"] ?? 0;
          const newRank = STATUS_RANK[mapped] ?? 0;
          if (newRank > currentRank || mapped === "failed") {
            await admin.from("messages").update({ status: mapped }).eq("id", existing.id);
          }
        }

        // Also update campaign recipient delivery status
        const { data: campRecipient } = await admin
          .from("campaign_recipients")
          .select("id, campaign_id, status")
          .eq("whatsapp_message_id", waId)
          .maybeSingle();

        if (campRecipient) {
          const crRank: Record<string, number> = { pending: 0, sending: 0, failed: 0, skipped: 0, sent: 1, delivered: 2, read: 3 };
          const crCurrent = crRank[campRecipient.status ?? "pending"] ?? 0;
          const crNew = crRank[mapped] ?? 0;
          if (crNew > crCurrent) {
            const recipientUpdate: Record<string, unknown> = { status: mapped };
            if (mapped === "delivered") recipientUpdate.delivered_at = new Date().toISOString();
            if (mapped === "read") {
              recipientUpdate.read_at = new Date().toISOString();
              if (!recipientUpdate.delivered_at) recipientUpdate.delivered_at = new Date().toISOString();
            }
            await admin.from("campaign_recipients").update(recipientUpdate).eq("id", campRecipient.id);

            const counterField = mapped === "delivered" ? "delivered_count" : mapped === "read" ? "read_count" : null;
            if (counterField) {
              const { data: camp } = await admin.from("campaigns").select(counterField).eq("id", campRecipient.campaign_id).maybeSingle();
              if (camp) {
                await admin.from("campaigns").update({
                  [counterField]: ((camp as Record<string, number>)[counterField] || 0) + 1,
                  updated_at: new Date().toISOString(),
                }).eq("id", campRecipient.campaign_id);
              }
            }
          }
        }
      }
      return json(200, { ok: true });
    }

    if (event === "MESSAGES_UPSERT") {
      const messagesArr = Array.isArray(data.messages)
        ? (data.messages as Record<string, unknown>[])
        : Array.isArray((data as { messages?: unknown }).messages)
          ? ((data as { messages?: unknown }).messages as Record<string, unknown>[])
          : [data];

      for (const msg of messagesArr) {
        const key = (msg.key ?? {}) as Record<string, unknown>;
        const fromMe = Boolean(key.fromMe);
        const remoteJid = typeof key.remoteJid === "string" ? key.remoteJid : "";
        const waMessageId = typeof key.id === "string" ? key.id : "";

        const identity = resolveChatIdentity(remoteJid);
        if (!identity) continue;
        const phone = identity.phone;

        const content = extractText(msg);
        const linkPreview = extractLinkPreview(msg);
        if (!linkPreview.url && content) {
          const fallbackUrl = extractFirstUrlFromText(content);
          if (fallbackUrl) linkPreview.url = fallbackUrl;
        }
        const { media_type } = extractMedia(msg);
        let media_url = "";
        let audioDurationSeconds = 0;

        if (media_type && media_type !== "") {
          let mimeType = "";
          let ext = "";
          let bucket = "";

          if (media_type === "audio") {
            const audioMeta = extractAudioMeta(msg);
            audioDurationSeconds = audioMeta.seconds;
            mimeType = audioMeta.mimeType;
            ext = extFromMime(mimeType);
            bucket = "lead-audio-messages";
          } else {
            const meta = extractMediaMeta(msg, media_type);
            mimeType = meta.mimeType;
            ext = extFromMimeOrName(meta.mimeType, meta.filename);
            bucket = "lead-media";
          }

          let b64 = extractInlineBase64(msg);
          if (!b64) {
            const { data: evoSettings } = await admin
              .from("admin_settings")
              .select("key, value")
              .in("key", ["EVOLUTION_API_URL", "EVOLUTION_GLOBAL_KEY"]);
            const evoUrl = evoSettings?.find((s) => s.key === "EVOLUTION_API_URL")?.value;
            const globalKey = evoSettings?.find((s) => s.key === "EVOLUTION_GLOBAL_KEY")?.value;
            const apiKey =
              (instance as { evolution_api_key?: string }).evolution_api_key?.trim() || globalKey || "";
            if (evoUrl && apiKey) {
              b64 = await fetchMediaBase64FromEvolution(
                evoUrl.replace(/\/+$/, ""),
                apiKey,
                instance.instance_name as string,
                msg,
              );
            }
          }
          if (b64) {
            try {
              const bytes = base64ToUint8Array(b64);
              const MAX = 30 * 1024 * 1024;
              if (bytes.length <= MAX) {
                const dir = fromMe ? "outbound" : "inbound";
                const path = `${userId}/${dir}/${crypto.randomUUID()}.${ext}`;
                const { error: upErr } = await admin.storage
                  .from(bucket)
                  .upload(path, bytes, { contentType: mimeType, upsert: false });
                if (!upErr) {
                  const { data: signed } = await admin.storage
                    .from(bucket)
                    .createSignedUrl(path, 60 * 60 * 24 * 365);
                  if (signed?.signedUrl) media_url = signed.signedUrl;
                } else {
                  console.error("evolution-webhook: media upload failed", upErr.message, "type=", media_type);
                }
              } else {
                console.warn("evolution-webhook: media too large", bytes.length, "type=", media_type);
              }
            } catch (e) {
              console.error("evolution-webhook: media upload failed", e);
            }
          }
        }

        const rawPushName = typeof msg.pushName === "string" ? msg.pushName : "";
        const ownerProfileName = (instance.profile_name as string | null | undefined) || "";
        const ownerPhone = (instance.phone_number as string | null | undefined) || "";
        const pushName = (!fromMe && rawPushName && (!ownerProfileName || rawPushName !== ownerProfileName))
          ? rawPushName
          : "";
        if (ownerPhone && phone === ownerPhone) continue;
        const profilePic = extractProfilePic(msg);
        const timestamp = pickMessageTimestamp(msg as Record<string, unknown>);

        const existingLead = (await findLeadByIdentity(
          admin,
          userId,
          identity,
          "id, name, message_count, unread_count, profile_picture_url, whatsapp_jid",
        )) as
          | {
              id: string;
              name: string | null;
              message_count: number | null;
              unread_count: number | null;
              profile_picture_url: string | null;
              whatsapp_jid: string | null;
            }
          | null;

        let leadId: string;
        let isNewLead = false;
        const preview = content || (media_type ? `[${media_type}]` : "");

        if (!existingLead) {
          const insertPayload: Record<string, unknown> = {
            user_id: userId,
            phone,
            whatsapp_jid: identity.jid,
            name: pushName || "",
            last_message: preview,
            message_count: 0,
            unread_count: 0,
            last_activity_at: timestamp,
            last_seen_at: fromMe ? null : timestamp,
            source: "whatsapp",
            pipeline_stage: "new",
            temperature: "cold",
            category: "cold",
          };
          if (profilePic) {
            insertPayload.profile_picture_url = profilePic;
            insertPayload.profile_picture_updated_at = new Date().toISOString();
          }

          const { data: upserted, error: upsertErr } = await admin
            .from("leads")
            .upsert(insertPayload, { onConflict: "user_id,phone" })
            .select("id")
            .maybeSingle();

          if (upsertErr || !upserted) {
            console.error("evolution-webhook: lead upsert failed", upsertErr?.message, "phone=", phone);
            continue;
          }
          leadId = upserted.id as string;
          isNewLead = true;

          await admin.from("lead_activities").insert({
            user_id: userId,
            lead_id: leadId,
            action: "created",
            meta: { source: "whatsapp_webhook" },
          });
        } else {
          leadId = existingLead.id as string;
        }

        if (waMessageId) {
          const { data: existingMsg } = await admin
            .from("messages")
            .select("id")
            .eq("user_id", userId)
            .eq("whatsapp_message_id", waMessageId)
            .maybeSingle();
          if (existingMsg) continue;
        } else {
          const windowStart = new Date(new Date(timestamp).getTime() - 5000).toISOString();
          const windowEnd = new Date(new Date(timestamp).getTime() + 5000).toISOString();
          const { data: dupMsg } = await admin
            .from("messages")
            .select("id")
            .eq("lead_id", leadId)
            .eq("direction", fromMe ? "out" : "in")
            .eq("content", content)
            .gte("created_at", windowStart)
            .lte("created_at", windowEnd)
            .limit(1)
            .maybeSingle();
          if (dupMsg) continue;
        }

        const { error: msgInsertErr } = await admin.from("messages").insert({
          user_id: userId,
          lead_id: leadId,
          direction: fromMe ? "out" : "in",
          content,
          media_url,
          media_type,
          audio_duration_seconds: audioDurationSeconds,
          whatsapp_message_id: waMessageId,
          status: fromMe ? "sent" : "delivered",
          created_at: timestamp,
          preview_url: linkPreview.url,
          preview_title: linkPreview.title,
          preview_description: linkPreview.description,
          preview_image: linkPreview.image,
          preview_site_name: linkPreview.site_name,
        });

        if (!fromMe) {
          await admin.from("lead_presence").upsert(
            {
              lead_id: leadId,
              user_id: userId,
              state: "available",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "lead_id" },
          );
        }

        if (msgInsertErr) {
          console.error("evolution-webhook: message insert failed", msgInsertErr.message);
          continue;
        }

        if (isNewLead) {
          const updates: Record<string, unknown> = {
            last_message: preview,
            message_count: 1,
            unread_count: fromMe ? 0 : 1,
            last_activity_at: timestamp,
            updated_at: new Date().toISOString(),
          };
          await admin.from("leads").update(updates).eq("id", leadId);
        } else if (existingLead) {
          const newCount = (existingLead.message_count ?? 0) + 1;
          const newUnread = fromMe
            ? existingLead.unread_count ?? 0
            : (existingLead.unread_count ?? 0) + 1;

          const updates: Record<string, unknown> = {
            last_message: preview,
            message_count: newCount,
            unread_count: newUnread,
            last_activity_at: timestamp,
            updated_at: new Date().toISOString(),
          };
          if (!fromMe) updates.last_seen_at = timestamp;
          if (!existingLead.name || existingLead.name === phone) {
            if (pushName) updates.name = pushName;
          }
          if (profilePic && !existingLead.profile_picture_url) {
            updates.profile_picture_url = profilePic;
            updates.profile_picture_updated_at = new Date().toISOString();
          }
          if (!existingLead.whatsapp_jid) {
            updates.whatsapp_jid = identity.jid;
          }
          await admin.from("leads").update(updates).eq("id", leadId);
        }

        await admin.from("lead_activities").insert({
          user_id: userId,
          lead_id: leadId,
          action: fromMe ? "message_sent" : "message_received",
          meta: { wa_id: waMessageId, media_type },
        });
      }

      return json(200, { ok: true });
    }

    return json(200, { ok: true, event });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("evolution-webhook error:", message);
    return json(500, { error: message });
  }
});
