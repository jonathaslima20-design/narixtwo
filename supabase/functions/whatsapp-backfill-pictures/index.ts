import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.80.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BATCH_SIZE = 40;
const CONCURRENCY = 5;
const BUDGET_MS = 110_000;

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function onlyDigits(raw: string): string {
  return (raw || "").replace(/\D/g, "");
}

async function fetchPicture(
  evoUrl: string,
  apiKey: string,
  instanceName: string,
  phone: string,
  jid: string | null,
): Promise<string> {
  const target = jid || (phone.startsWith("lid:") ? "" : onlyDigits(phone));
  if (!target) return "";
  try {
    const res = await fetch(
      `${evoUrl}/chat/fetchProfilePictureUrl/${encodeURIComponent(instanceName)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify({ number: target }),
      },
    );
    if (!res.ok) return "";
    const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const maybe = payload.profilePictureUrl ?? payload.profilePicUrl ?? payload.url ?? "";
    if (typeof maybe === "string" && maybe.startsWith("http")) return maybe;
    return "";
  } catch {
    return "";
  }
}

async function runBatchWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  const workers: Promise<void>[] = [];
  async function next() {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx]);
    }
  }
  for (let w = 0; w < limit; w++) workers.push(next());
  await Promise.all(workers);
}

async function processBatch(
  admin: SupabaseClient,
  userId: string,
  leads: { id: string; phone: string; whatsapp_jid: string | null }[],
  evoUrl: string,
  apiKey: string,
  instanceName: string,
): Promise<{ found: number }> {
  let found = 0;
  const nowIso = new Date().toISOString();
  await runBatchWithConcurrency(leads, CONCURRENCY, async (lead) => {
    const url = await fetchPicture(evoUrl, apiKey, instanceName, lead.phone, lead.whatsapp_jid);
    const updates: Record<string, unknown> = {
      profile_picture_backfill_attempted_at: nowIso,
    };
    if (url) {
      updates.profile_picture_url = url;
      updates.profile_picture_updated_at = nowIso;
      found += 1;
    }
    await admin.from("leads").update(updates).eq("id", lead.id).eq("user_id", userId);
  });
  return { found };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startedAt = Date.now();

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
      .select("id, instance_name, status, evolution_api_key")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!instance) return json(400, { error: "Nenhuma instância do WhatsApp encontrada" });
    if (instance.status !== "connected") {
      return json(400, { error: "Conecte o WhatsApp antes de buscar fotos" });
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

    const body = (await req.json().catch(() => ({}))) as { force?: boolean };

    let processed = 0;
    let foundPics = 0;
    let timedOut = false;
    let lastCursor: string | null = null;

    while (Date.now() - startedAt < BUDGET_MS) {
      let q = admin
        .from("leads")
        .select("id, phone, whatsapp_jid")
        .eq("user_id", user.id)
        .or("profile_picture_url.is.null,profile_picture_url.eq.")
        .order("last_activity_at", { ascending: false, nullsFirst: false })
        .limit(BATCH_SIZE);

      if (!body.force) {
        q = q.is("profile_picture_backfill_attempted_at", null);
      }

      const { data: leads } = await q;
      if (!leads || leads.length === 0) break;

      const { found } = await processBatch(
        admin,
        user.id,
        leads as { id: string; phone: string; whatsapp_jid: string | null }[],
        evoUrl,
        apiKey,
        instance.instance_name as string,
      );
      processed += leads.length;
      foundPics += found;
      lastCursor = (leads[leads.length - 1] as { id: string }).id;

      if (Date.now() - startedAt >= BUDGET_MS) {
        timedOut = true;
        break;
      }
    }

    const instanceUpdate: Record<string, unknown> = {
      pictures_backfill_cursor: timedOut ? lastCursor : null,
    };
    if (!timedOut) instanceUpdate.pictures_backfilled_at = new Date().toISOString();
    await admin.from("whatsapp_instances").update(instanceUpdate).eq("id", instance.id);

    return json(200, {
      ok: true,
      processed,
      found_pictures: foundPics,
      timed_out: timedOut,
      elapsed_ms: Date.now() - startedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("whatsapp-backfill-pictures failed:", message);
    return json(500, { error: message });
  }
});
