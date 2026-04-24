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

    let instanceId: string | null = null;
    let deleteRow = false;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body && typeof body === "object") {
          const b = body as { instance_id?: string; delete?: boolean };
          if (typeof b.instance_id === "string" && b.instance_id.trim()) instanceId = b.instance_id.trim();
          if (b.delete === true) deleteRow = true;
        }
      } catch (_) {
        // ignore
      }
    }

    const admin = createClient(supabaseUrl, serviceKey);

    let instanceQuery = admin
      .from("whatsapp_instances")
      .select("*")
      .eq("user_id", user.id);
    if (instanceId) instanceQuery = instanceQuery.eq("id", instanceId);
    else instanceQuery = instanceQuery.order("created_at", { ascending: true }).limit(1);

    const { data: instance } = await instanceQuery.maybeSingle();

    if (!instance) return json(200, { success: true });

    const { data: settings } = await admin
      .from("admin_settings")
      .select("key, value")
      .in("key", ["EVOLUTION_API_URL", "EVOLUTION_GLOBAL_KEY"]);

    const evoUrl = settings?.find((s) => s.key === "EVOLUTION_API_URL")?.value?.replace(/\/+$/, "");
    const evoKey = settings?.find((s) => s.key === "EVOLUTION_GLOBAL_KEY")?.value;

    if (evoUrl && evoKey) {
      try {
        await fetch(
          `${evoUrl}/instance/logout/${encodeURIComponent(instance.instance_name)}`,
          { method: "DELETE", headers: { apikey: evoKey } },
        );
      } catch (_) {
        // ignore
      }
      try {
        await fetch(
          `${evoUrl}/instance/delete/${encodeURIComponent(instance.instance_name)}`,
          { method: "DELETE", headers: { apikey: evoKey } },
        );
      } catch (_) {
        // ignore
      }
    }

    if (deleteRow) {
      await admin
        .from("whatsapp_instances")
        .delete()
        .eq("id", instance.id);
    } else {
      await admin
        .from("whatsapp_instances")
        .update({ status: "disconnected", qr_code: "", phone_number: "" })
        .eq("id", instance.id);
    }

    return json(200, { success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return json(500, { error: message });
  }
});
