import { createClient } from "npm:@supabase/supabase-js@2.80.0";

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

function onlyDigits(raw: string): string {
  return (raw || "").replace(/\D/g, "");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return json(401, { error: "Missing authorization token" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
    });
    if (!userRes.ok) return json(401, { error: "Invalid authentication" });
    const user = (await userRes.json()) as { id?: string };
    if (!user?.id) return json(401, { error: "Invalid authentication" });

    const body = await req.json().catch(() => ({}));
    const messageId = (body?.message_id as string | undefined)?.trim();
    const alsoOnWhatsApp = Boolean(body?.also_on_whatsapp);

    if (!messageId) return json(400, { error: "message_id é obrigatório" });

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: msg } = await admin
      .from("messages")
      .select("id, user_id, lead_id, direction, whatsapp_message_id")
      .eq("id", messageId)
      .maybeSingle();

    if (!msg) return json(404, { error: "Mensagem não encontrada" });
    if (msg.user_id !== user.id) return json(403, { error: "Acesso negado" });

    let evolutionWarning: string | null = null;

    if (alsoOnWhatsApp && msg.whatsapp_message_id) {
      const { data: lead } = await admin
        .from("leads")
        .select("phone, whatsapp_jid")
        .eq("id", msg.lead_id)
        .maybeSingle();

      const { data: instance } = await admin
        .from("whatsapp_instances")
        .select("instance_name, evolution_api_key")
        .eq("user_id", user.id)
        .maybeSingle();

      const { data: settings } = await admin
        .from("admin_settings")
        .select("key, value")
        .in("key", ["EVOLUTION_API_URL", "EVOLUTION_GLOBAL_KEY"]);

      const evoUrl = settings?.find((s) => s.key === "EVOLUTION_API_URL")?.value?.replace(/\/+$/, "");
      const evoKey = settings?.find((s) => s.key === "EVOLUTION_GLOBAL_KEY")?.value;

      if (evoUrl && evoKey && instance && lead) {
        const apiKey =
          (instance as { evolution_api_key?: string }).evolution_api_key?.trim() || evoKey;
        const leadRow = lead as { phone: string; whatsapp_jid: string | null };
        const remoteJid =
          leadRow.whatsapp_jid ||
          (leadRow.phone && !leadRow.phone.startsWith("lid:")
            ? `${onlyDigits(leadRow.phone)}@s.whatsapp.net`
            : "");
        if (!remoteJid) {
          evolutionWarning = "Chat sem identificador WhatsApp válido";
        }

        try {
          const delRes = await fetch(
            `${evoUrl}/chat/deleteMessageForEveryone/${encodeURIComponent(instance.instance_name)}`,
            {
              method: "DELETE",
              headers: {
                "Content-Type": "application/json",
                apikey: apiKey,
              },
              body: JSON.stringify({
                id: msg.whatsapp_message_id,
                remoteJid,
                fromMe: msg.direction === "out",
              }),
            },
          );
          if (!delRes.ok) {
            const txt = await delRes.text().catch(() => "");
            evolutionWarning = `Evolution retornou ${delRes.status}: ${txt.slice(0, 200)}`;
          }
        } catch (err) {
          evolutionWarning = err instanceof Error ? err.message : String(err);
        }
      } else {
        evolutionWarning = "Evolution não configurada ou instância não encontrada";
      }
    }

    const { error: delErr } = await admin.from("messages").delete().eq("id", messageId);
    if (delErr) return json(500, { error: delErr.message });

    await admin.from("lead_activities").insert({
      user_id: user.id,
      lead_id: msg.lead_id,
      action: "message_deleted",
      meta: {
        wa_id: msg.whatsapp_message_id,
        also_on_whatsapp: alsoOnWhatsApp,
        evolution_warning: evolutionWarning,
      },
    });

    return json(200, { ok: true, evolutionWarning });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return json(500, { error: message });
  }
});
