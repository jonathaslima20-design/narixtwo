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

interface InstanceRow {
  id: string;
  user_id: string;
  instance_name: string;
  status: string;
  phone_number: string | null;
  [k: string]: unknown;
}

async function refreshOne(
  admin: ReturnType<typeof createClient>,
  evoUrl: string,
  evoKey: string,
  instance: InstanceRow,
): Promise<InstanceRow> {
  try {
    const stateRes = await fetch(
      `${evoUrl}/instance/connectionState/${encodeURIComponent(instance.instance_name)}`,
      { headers: { apikey: evoKey } },
    );
    if (!stateRes.ok) return instance;
    const stateJson = await stateRes.json();
    const state =
      stateJson?.instance?.state ??
      stateJson?.state ??
      stateJson?.status ??
      "";

    let newStatus = instance.status;
    if (state === "open" || state === "connected") newStatus = "connected";
    else if (state === "connecting" || state === "qr" || state === "qrcode") newStatus = "connecting";
    else if (state === "close" || state === "closed" || state === "disconnected") newStatus = "disconnected";

    let phoneNumber = instance.phone_number ?? "";
    if (newStatus === "connected") {
      const fetchRes = await fetch(
        `${evoUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(instance.instance_name)}`,
        { headers: { apikey: evoKey } },
      );
      if (fetchRes.ok) {
        const list = await fetchRes.json();
        const entry = Array.isArray(list) ? list[0] : list;
        const ownerJid =
          entry?.instance?.owner ??
          entry?.instance?.wuid ??
          entry?.owner ??
          entry?.wuid ??
          "";
        if (typeof ownerJid === "string" && ownerJid.includes("@")) {
          phoneNumber = ownerJid.split("@")[0];
        }
      }
    }

    if (newStatus !== instance.status || phoneNumber !== instance.phone_number) {
      const updates: Record<string, unknown> = { status: newStatus };
      if (newStatus === "connected") {
        updates.qr_code = "";
        updates.phone_number = phoneNumber;
      }
      const { data: updated } = await admin
        .from("whatsapp_instances")
        .update(updates)
        .eq("id", instance.id)
        .select()
        .maybeSingle();
      if (updated) return updated as InstanceRow;
    }
    return instance;
  } catch (_err) {
    return instance;
  }
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

    let requestedInstanceId = "";
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body && typeof body === "object") {
          const b = body as { instance_id?: string };
          if (typeof b.instance_id === "string") requestedInstanceId = b.instance_id.trim();
        }
      } catch (_) {
        // no body
      }
    }

    const admin = createClient(supabaseUrl, serviceKey);

    let instances: InstanceRow[] = [];
    if (requestedInstanceId) {
      const { data } = await admin
        .from("whatsapp_instances")
        .select("*")
        .eq("id", requestedInstanceId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) instances = [data as InstanceRow];
    } else {
      const { data } = await admin
        .from("whatsapp_instances")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      instances = (data ?? []) as InstanceRow[];
    }

    const { data: settings } = await admin
      .from("admin_settings")
      .select("key, value")
      .in("key", ["EVOLUTION_API_URL", "EVOLUTION_GLOBAL_KEY"]);

    const evoUrl = settings?.find((s) => s.key === "EVOLUTION_API_URL")?.value?.replace(/\/+$/, "");
    const evoKey = settings?.find((s) => s.key === "EVOLUTION_GLOBAL_KEY")?.value;

    if (evoUrl && evoKey && instances.length > 0) {
      instances = await Promise.all(
        instances.map((inst) => refreshOne(admin, evoUrl, evoKey, inst)),
      );
    }

    // Backwards-compat: if a specific instance was requested, also expose it at .instance.
    if (requestedInstanceId) {
      return json(200, { instance: instances[0] ?? null, instances });
    }

    return json(200, { instances, instance: instances[0] ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return json(500, { error: message });
  }
});
