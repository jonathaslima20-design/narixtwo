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
    if (!userRes.ok) {
      return json(401, { error: "Invalid authentication" });
    }
    const user = (await userRes.json()) as { id?: string };
    if (!user?.id) {
      return json(401, { error: "Invalid authentication" });
    }

    const body = await req.json().catch(() => ({}));
    const leadId = (body?.lead_id as string | undefined)?.trim();
    if (!leadId) return json(400, { error: "lead_id é obrigatório" });

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: lead } = await admin
      .from("leads")
      .select("id, user_id, phone, whatsapp_jid")
      .eq("id", leadId)
      .maybeSingle();

    if (!lead) return json(404, { error: "Lead não encontrado" });
    if (lead.user_id !== user.id) return json(403, { error: "Acesso negado" });

    const { data: instance } = await admin
      .from("whatsapp_instances")
      .select("instance_name, evolution_api_key")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!instance) return json(400, { error: "Nenhuma instância do WhatsApp configurada" });

    const { data: settings } = await admin
      .from("admin_settings")
      .select("key, value")
      .in("key", ["EVOLUTION_API_URL", "EVOLUTION_GLOBAL_KEY"]);
    const evoUrl = settings?.find((s) => s.key === "EVOLUTION_API_URL")?.value?.replace(/\/+$/, "");
    const evoKey = settings?.find((s) => s.key === "EVOLUTION_GLOBAL_KEY")?.value;
    if (!evoUrl || !evoKey) return json(400, { error: "Evolution API não configurada" });

    const instanceKey = (instance as { evolution_api_key?: string }).evolution_api_key?.trim() || "";
    const apiKey = instanceKey || evoKey;
    const evoHeaders = { "Content-Type": "application/json", apikey: apiKey };
    const leadRow = lead as { phone: string; whatsapp_jid: string | null };
    const number = leadRow.whatsapp_jid || (leadRow.phone.startsWith("lid:") ? "" : onlyDigits(leadRow.phone));
    if (!number) return json(400, { error: "Contato sem identificador WhatsApp" });

    let pictureUrl = "";
    try {
      const res = await fetch(
        `${evoUrl}/chat/fetchProfilePictureUrl/${encodeURIComponent(instance.instance_name)}`,
        {
          method: "POST",
          headers: evoHeaders,
          body: JSON.stringify({ number }),
        },
      );
      if (res.ok) {
        const payload = await res.json().catch(() => ({}));
        const maybe =
          (payload as Record<string, unknown>)?.profilePictureUrl ??
          (payload as Record<string, unknown>)?.profilePicUrl ??
          (payload as Record<string, unknown>)?.url ??
          "";
        if (typeof maybe === "string" && maybe.startsWith("http")) {
          pictureUrl = maybe;
        }
      }
    } catch (_err) {
      // best-effort
    }

    const updates: Record<string, unknown> = {
      profile_picture_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (pictureUrl) updates.profile_picture_url = pictureUrl;

    const { data: updated } = await admin
      .from("leads")
      .update(updates)
      .eq("id", leadId)
      .select()
      .maybeSingle();

    return json(200, { lead: updated, profile_picture_url: pictureUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return json(500, { error: message });
  }
});
