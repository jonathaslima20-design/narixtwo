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

function normalizeQr(raw: unknown): string {
  if (!raw || typeof raw !== "string") return "";
  const cleaned = raw.replace(/^data:image\/[a-zA-Z]+;base64,/, "").trim();
  if (cleaned.length < 100) return "";
  if (cleaned.startsWith("SIMULATED")) return "";
  return cleaned;
}

function extractInstanceApiKey(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const p = payload as Record<string, unknown>;
  const tryString = (v: unknown): string => (typeof v === "string" && v.trim() ? v.trim() : "");

  const hash = p.hash as unknown;
  if (typeof hash === "string") {
    const v = tryString(hash);
    if (v) return v;
  } else if (hash && typeof hash === "object") {
    const h = hash as Record<string, unknown>;
    const v = tryString(h.apikey) || tryString(h.apiKey) || tryString(h.key);
    if (v) return v;
  }

  const instance = p.instance as Record<string, unknown> | undefined;
  if (instance) {
    const v =
      tryString(instance.apikey) ||
      tryString((instance as Record<string, unknown>).apiKey) ||
      tryString(instance.token) ||
      tryString(instance.hash);
    if (v) return v;
  }

  return (
    tryString(p.apikey) ||
    tryString((p as Record<string, unknown>).apiKey) ||
    tryString(p.token) ||
    ""
  );
}

function extractQrFromPayload(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const p = payload as Record<string, unknown>;
  const candidates: unknown[] = [
    p.base64,
    p.code,
    p.qr,
    (p.qrcode as Record<string, unknown> | undefined)?.base64,
    (p.qrcode as Record<string, unknown> | undefined)?.code,
    (p.data as Record<string, unknown> | undefined)?.base64,
    (p.data as Record<string, unknown> | undefined)?.qrcode,
    ((p.data as Record<string, unknown> | undefined)?.qrcode as Record<string, unknown> | undefined)?.base64,
    ((p.instance as Record<string, unknown> | undefined)?.qrcode as Record<string, unknown> | undefined)?.base64,
  ];
  for (const c of candidates) {
    const v = normalizeQr(c);
    if (v) return v;
  }
  return "";
}

async function hardResetInstance(evoUrl: string, evoKey: string, instanceName: string) {
  const evoHeaders = { "Content-Type": "application/json", apikey: evoKey };
  try {
    await fetch(`${evoUrl}/instance/logout/${encodeURIComponent(instanceName)}`, {
      method: "DELETE",
      headers: evoHeaders,
    });
  } catch (_) {
    // ignore
  }
  try {
    await fetch(`${evoUrl}/instance/delete/${encodeURIComponent(instanceName)}`, {
      method: "DELETE",
      headers: evoHeaders,
    });
  } catch (_) {
    // ignore
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
    const user = (await userRes.json()) as { id?: string; email?: string };
    if (!user?.id) return json(401, { error: "Invalid authentication" });

    let forceReset = false;
    let targetInstanceId: string | null = null;
    let requestedLabel = "";
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body && typeof body === "object") {
          const b = body as { reset?: boolean; instance_id?: string; label?: string };
          if (b.reset === true) forceReset = true;
          if (typeof b.instance_id === "string" && b.instance_id.trim()) targetInstanceId = b.instance_id.trim();
          if (typeof b.label === "string") requestedLabel = b.label.trim().slice(0, 60);
        }
      } catch (_) {
        // no body, ignore
      }
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: settings, error: settingsErr } = await admin
      .from("admin_settings")
      .select("key, value")
      .in("key", [
        "EVOLUTION_API_URL",
        "EVOLUTION_GLOBAL_KEY",
        "EVOLUTION_WEBHOOK_URL",
        "EVOLUTION_WEBHOOK_TOKEN",
      ]);

    if (settingsErr) {
      return json(500, { error: "Falha ao ler configurações da Evolution API" });
    }

    const evoUrl = settings?.find((s) => s.key === "EVOLUTION_API_URL")?.value?.replace(/\/+$/, "");
    const evoKey = settings?.find((s) => s.key === "EVOLUTION_GLOBAL_KEY")?.value;
    const webhookUrlSetting = settings?.find((s) => s.key === "EVOLUTION_WEBHOOK_URL")?.value ?? "";
    const webhookToken = settings?.find((s) => s.key === "EVOLUTION_WEBHOOK_TOKEN")?.value ?? "";
    const defaultWebhookUrl = `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/evolution-webhook`;
    const webhookBase = (webhookUrlSetting || defaultWebhookUrl).replace(/\/+$/, "");
    const webhookUrl = webhookToken
      ? `${webhookBase}?token=${encodeURIComponent(webhookToken)}`
      : webhookBase;

    if (!evoUrl || !evoKey) {
      return json(400, { error: "Evolution API não configurada no painel admin" });
    }

    const { data: userInstances } = await admin
      .from("whatsapp_instances")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    const instances = userInstances ?? [];

    let existingInstance: Record<string, unknown> | null = null;
    if (targetInstanceId) {
      existingInstance = instances.find((i) => i.id === targetInstanceId) ?? null;
      if (!existingInstance) return json(404, { error: "Instância não encontrada" });
    }

    if (!existingInstance) {
      const { data: sub } = await admin
        .from("client_subscriptions")
        .select("max_instances_override, plans(max_whatsapp_instances)")
        .eq("user_id", user.id)
        .maybeSingle();

      const planLimitRaw = (sub?.plans as { max_whatsapp_instances?: number } | null | undefined)?.max_whatsapp_instances;
      const overrideRaw = (sub as { max_instances_override?: number | null } | null | undefined)?.max_instances_override;
      const override = typeof overrideRaw === "number" ? overrideRaw : null;
      const planLimit = typeof planLimitRaw === "number" ? planLimitRaw : 1;
      const effectiveLimit = override !== null ? override : planLimit;

      if (effectiveLimit !== -1 && instances.length >= effectiveLimit) {
        return json(403, {
          error: `Limite de instâncias atingido (${effectiveLimit}). Fale com o administrador para aumentar.`,
        });
      }
    }

    const oldInstanceName = (existingInstance?.instance_name as string | undefined) ?? undefined;
    const isConnected = existingInstance?.status === "connected";
    const mustReset = forceReset || (!!existingInstance && !isConnected);

    if (mustReset && oldInstanceName) {
      await hardResetInstance(evoUrl, evoKey, oldInstanceName);
    }

    const instanceName = mustReset || !oldInstanceName
      ? `brainlead_${user.id.slice(0, 8)}_${Date.now()}`
      : oldInstanceName;

    const evoHeaders = { "Content-Type": "application/json", apikey: evoKey };
    let qrBase64 = "";
    let instanceApiKey = "";
    let lastPayloadSnippet = "";

    const createRes = await fetch(`${evoUrl}/instance/create`, {
      method: "POST",
      headers: evoHeaders,
      body: JSON.stringify({
        instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
        webhook: {
          url: webhookUrl,
          byEvents: false,
          base64: true,
          events: [
            "QRCODE_UPDATED",
            "CONNECTION_UPDATE",
            "MESSAGES_UPSERT",
            "MESSAGES_UPDATE",
            "SEND_MESSAGE_UPDATE",
            "CONTACTS_UPSERT",
            "CONTACTS_UPDATE",
            "CHATS_UPSERT",
            "CHATS_UPDATE",
            "PRESENCE_UPDATE",
          ],
        },
      }),
    });

    if (createRes.ok) {
      const createJson = await createRes.json().catch(() => ({}));
      qrBase64 = extractQrFromPayload(createJson);
      instanceApiKey = extractInstanceApiKey(createJson) || instanceApiKey;
      if (!qrBase64) lastPayloadSnippet = JSON.stringify(createJson).slice(0, 300);
    } else {
      lastPayloadSnippet = (await createRes.text()).slice(0, 300);
    }

    try {
      await fetch(`${evoUrl}/webhook/set/${encodeURIComponent(instanceName)}`, {
        method: "POST",
        headers: evoHeaders,
        body: JSON.stringify({
          enabled: true,
          url: webhookUrl,
          webhookByEvents: false,
          webhookBase64: true,
          events: [
            "QRCODE_UPDATED",
            "CONNECTION_UPDATE",
            "MESSAGES_UPSERT",
            "MESSAGES_UPDATE",
            "SEND_MESSAGE_UPDATE",
            "CONTACTS_UPSERT",
            "CONTACTS_UPDATE",
            "CHATS_UPSERT",
            "CHATS_UPDATE",
            "PRESENCE_UPDATE",
          ],
        }),
      });
    } catch (_err) {
      // best-effort
    }

    if (!qrBase64) {
      const connectRes = await fetch(
        `${evoUrl}/instance/connect/${encodeURIComponent(instanceName)}`,
        { headers: evoHeaders },
      );
      if (connectRes.ok) {
        const connectJson = await connectRes.json().catch(() => ({}));
        qrBase64 = extractQrFromPayload(connectJson);
        if (!qrBase64) lastPayloadSnippet = JSON.stringify(connectJson).slice(0, 300);
      } else {
        lastPayloadSnippet = (await connectRes.text()).slice(0, 300);
      }
    }

    if (!instanceApiKey) {
      try {
        const refetchRes = await fetch(
          `${evoUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`,
          { headers: evoHeaders },
        );
        if (refetchRes.ok) {
          const data = await refetchRes.json().catch(() => null);
          if (Array.isArray(data)) {
            for (const item of data) {
              const key = extractInstanceApiKey(item);
              if (key) { instanceApiKey = key; break; }
            }
          } else if (data && typeof data === "object") {
            const key = extractInstanceApiKey(data);
            if (key) instanceApiKey = key;
          }
        }
      } catch (_err) {
        // best-effort
      }
    }

    if (!qrBase64) {
      console.error("QR Code extraction failed. Payload snippet:", lastPayloadSnippet);
      return json(502, {
        error: "A Evolution API não retornou um QR Code válido",
        details: lastPayloadSnippet,
      });
    }

    const nowIso = new Date().toISOString();
    const payload: Record<string, unknown> = {
      user_id: user.id,
      instance_name: instanceName,
      status: "connecting",
      qr_code: qrBase64,
      qr_updated_at: nowIso,
      last_error: null,
    };
    if (instanceApiKey) payload.evolution_api_key = instanceApiKey;
    if (requestedLabel && !existingInstance) payload.label = requestedLabel;

    let saved: Record<string, unknown> | null = null;
    let saveErr: { message: string } | null = null;

    if (existingInstance) {
      const res = await admin
        .from("whatsapp_instances")
        .update(payload)
        .eq("id", existingInstance.id as string)
        .select()
        .maybeSingle();
      saved = res.data;
      saveErr = res.error;
    } else {
      const res = await admin
        .from("whatsapp_instances")
        .insert(payload)
        .select()
        .maybeSingle();
      saved = res.data;
      saveErr = res.error;
    }

    if (saveErr) return json(500, { error: "Falha ao salvar instância" });

    return json(200, { instance: saved });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return json(500, { error: message });
  }
});
