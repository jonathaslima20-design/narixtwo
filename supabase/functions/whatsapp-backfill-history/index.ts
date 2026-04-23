import { createClient } from "npm:@supabase/supabase-js@2.80.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BATCH_SIZE = 30;
const BUDGET_MS = 110_000;

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
      .select("id, status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!instance) return json(400, { error: "Nenhuma instância do WhatsApp encontrada" });
    if (instance.status !== "connected") {
      return json(400, { error: "Conecte o WhatsApp antes de baixar o histórico" });
    }

    const body = (await req.json().catch(() => ({}))) as { force?: boolean };

    let processed = 0;
    let messagesAdded = 0;
    let timedOut = false;
    let lastCursor: string | null = null;

    while (Date.now() - startedAt < BUDGET_MS) {
      let q = admin
        .from("leads")
        .select("id")
        .eq("user_id", user.id)
        .order("last_activity_at", { ascending: false, nullsFirst: false })
        .limit(BATCH_SIZE);

      if (!body.force) {
        q = q.is("history_backfill_attempted_at", null);
      }

      const { data: leads } = await q;
      if (!leads || leads.length === 0) break;

      for (const lead of leads as { id: string }[]) {
        if (Date.now() - startedAt >= BUDGET_MS) {
          timedOut = true;
          lastCursor = lead.id;
          break;
        }

        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/whatsapp-hydrate-chat`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
              apikey: anonKey,
            },
            body: JSON.stringify({ lead_id: lead.id, mode: "full" }),
          });
          if (res.ok) {
            const payload = (await res.json().catch(() => ({}))) as {
              messages_added?: number;
            };
            messagesAdded += payload.messages_added ?? 0;
          }
        } catch {
          // best-effort; continue with next lead
        }

        await admin
          .from("leads")
          .update({ history_backfill_attempted_at: new Date().toISOString() })
          .eq("id", lead.id)
          .eq("user_id", user.id);

        processed += 1;
        lastCursor = lead.id;
      }

      if (timedOut) break;
    }

    const instanceUpdate: Record<string, unknown> = {
      history_backfill_cursor: timedOut ? lastCursor : null,
    };
    if (!timedOut) instanceUpdate.history_backfilled_at = new Date().toISOString();
    await admin.from("whatsapp_instances").update(instanceUpdate).eq("id", instance.id);

    return json(200, {
      ok: true,
      processed,
      messages_added: messagesAdded,
      timed_out: timedOut,
      elapsed_ms: Date.now() - startedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("whatsapp-backfill-history failed:", message);
    return json(500, { error: message });
  }
});
