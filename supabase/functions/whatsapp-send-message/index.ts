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

function brVariantsWithoutNine(digits: string): string[] {
  // Produce the "without 9" variant for Brazilian mobile numbers so we can
  // probe both representations with Evolution's whatsappNumbers endpoint.
  if (!digits.startsWith("55")) return [];
  const rest = digits.slice(2);
  if (rest.length === 11 && rest.charAt(2) === "9") {
    return [`55${rest.slice(0, 2)}${rest.slice(3)}`];
  }
  return [];
}

function brVariantsWithNine(digits: string): string[] {
  if (!digits.startsWith("55")) return [];
  const rest = digits.slice(2);
  if (rest.length === 10) {
    const ddd = rest.slice(0, 2);
    const first = rest.charAt(2);
    if (/[6-9]/.test(first)) return [`55${ddd}9${rest.slice(2)}`];
  }
  return [];
}

function candidateNumbers(phone: string, jid: string): string[] {
  const set = new Set<string>();
  const phoneDigits = onlyDigits(phone);
  const jidDigits = jid && jid.endsWith("@s.whatsapp.net") ? onlyDigits(jid.split("@")[0]) : "";
  if (jidDigits) set.add(jidDigits);
  if (phoneDigits) set.add(phoneDigits);
  for (const v of brVariantsWithoutNine(phoneDigits)) set.add(v);
  for (const v of brVariantsWithNine(phoneDigits)) set.add(v);
  if (jidDigits) {
    for (const v of brVariantsWithoutNine(jidDigits)) set.add(v);
    for (const v of brVariantsWithNine(jidDigits)) set.add(v);
  }
  return Array.from(set).filter((n) => n.length >= 10);
}

function extractEvolutionMessageId(payload: unknown): string {
  const p = payload as Record<string, unknown> | null;
  if (!p) return "";
  const keyRoot = p.key as Record<string, unknown> | undefined;
  if (keyRoot && typeof keyRoot.id === "string") return keyRoot.id;
  const messages = p.messages as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(messages) && messages.length > 0) {
    const first = messages[0];
    const k = first?.key as Record<string, unknown> | undefined;
    if (k && typeof k.id === "string") return k.id;
  }
  const maybeId = p.messageId ?? p.id;
  if (typeof maybeId === "string") return maybeId;
  return "";
}

function pickEvolutionErrorMessage(payload: unknown, fallback: string): string {
  const p = payload as Record<string, unknown> | null;
  if (!p) return fallback;
  const candidates = [p.message, p.error, p.response, p.reason];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c;
    if (c && typeof c === "object") {
      const inner = (c as Record<string, unknown>).message;
      if (typeof inner === "string" && inner.trim()) return inner;
    }
  }
  const code = typeof p.code === "string" ? p.code.trim() : "";
  if (code) return `Evolution: ${code}`;
  return fallback;
}

function isUnauthorizedCode(resp: unknown): boolean {
  const p = resp as Record<string, unknown> | null;
  if (!p) return false;
  const code = typeof p.code === "string" ? p.code.toUpperCase() : "";
  const msg = typeof p.message === "string" ? p.message.toUpperCase() : "";
  return /UNAUTHORIZED/.test(code) || /UNAUTHORIZED/.test(msg);
}

Deno.serve(async (req: Request) => {
  const startTime = Date.now();

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  type LogRow = {
    user_id?: string | null;
    lead_id?: string | null;
    stage: string;
    http_status?: number;
    evolution_endpoint?: string;
    request_payload?: unknown;
    evolution_response?: unknown;
    error_message?: string;
    number_used?: string;
    jid_used?: string;
    phone_original?: string;
    variant?: string;
    duration_ms?: number;
    meta?: unknown;
  };

  async function logStage(row: LogRow) {
    try {
      await admin.from("whatsapp_send_logs").insert({
        user_id: row.user_id ?? null,
        lead_id: row.lead_id ?? null,
        stage: row.stage,
        http_status: row.http_status ?? 0,
        evolution_endpoint: row.evolution_endpoint ?? "",
        request_payload: (row.request_payload ?? {}) as Record<string, unknown>,
        evolution_response: (row.evolution_response ?? {}) as Record<string, unknown>,
        error_message: row.error_message ?? "",
        number_used: row.number_used ?? "",
        jid_used: row.jid_used ?? "",
        phone_original: row.phone_original ?? "",
        variant: row.variant ?? "",
        duration_ms: row.duration_ms ?? Date.now() - startTime,
        meta: (row.meta ?? {}) as Record<string, unknown>,
      });
    } catch (_err) {
      // telemetry must never break the flow
    }
  }

  try {
    const body = await req.json().catch(() => ({}));
    await logStage({ stage: "boot", request_payload: body, meta: { method: req.method } });

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      await logStage({ stage: "auth_missing", error_message: "no token" });
      return json(401, { error: "Missing authorization token" });
    }

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
    });
    if (!userRes.ok) {
      await logStage({ stage: "auth_invalid", http_status: userRes.status });
      return json(401, { error: "Invalid authentication" });
    }
    const user = (await userRes.json()) as { id?: string };
    if (!user?.id) {
      await logStage({ stage: "auth_invalid", error_message: "missing id" });
      return json(401, { error: "Invalid authentication" });
    }

    const leadId = (body?.lead_id as string | undefined)?.trim();
    const content = (body?.content as string | undefined) ?? "";
    const aiGenerated = Boolean(body?.ai_generated);

    if (!leadId) {
      await logStage({ user_id: user.id, stage: "bad_request", error_message: "missing lead_id" });
      return json(400, { error: "lead_id é obrigatório" });
    }
    if (!content.trim()) {
      await logStage({ user_id: user.id, stage: "bad_request", error_message: "empty content" });
      return json(400, { error: "Mensagem vazia" });
    }

    await logStage({ user_id: user.id, lead_id: leadId, stage: "auth_ok" });

    const { data: lead, error: leadErr } = await admin
      .from("leads")
      .select("id, user_id, phone, message_count, whatsapp_jid, instance_id")
      .eq("id", leadId)
      .maybeSingle();

    if (leadErr || !lead) {
      await logStage({
        user_id: user.id,
        lead_id: leadId,
        stage: "lead_missing",
        error_message: leadErr?.message || "not found",
      });
      return json(404, { error: "Lead não encontrado" });
    }
    if (lead.user_id !== user.id) {
      await logStage({ user_id: user.id, lead_id: leadId, stage: "lead_forbidden" });
      return json(403, { error: "Acesso negado" });
    }

    const storedJid = (lead as { whatsapp_jid: string | null }).whatsapp_jid || "";
    const phoneOriginal = typeof lead.phone === "string" ? lead.phone : "";

    await logStage({
      user_id: user.id,
      lead_id: leadId,
      stage: "lead_loaded",
      phone_original: phoneOriginal,
      jid_used: storedJid,
    });

    const leadInstanceId = (lead as { instance_id: string | null }).instance_id || null;
    let instanceQuery = admin
      .from("whatsapp_instances")
      .select("id, instance_name, status, evolution_api_key")
      .eq("user_id", user.id);
    if (leadInstanceId) {
      instanceQuery = instanceQuery.eq("id", leadInstanceId);
    } else {
      instanceQuery = instanceQuery.eq("status", "connected").order("created_at", { ascending: true }).limit(1);
    }
    const { data: instance, error: instErr } = await instanceQuery.maybeSingle();

    if (instErr || !instance) {
      await logStage({
        user_id: user.id,
        lead_id: leadId,
        stage: "instance_missing",
        error_message: instErr?.message || "no instance",
      });
      return json(400, { error: "Nenhuma instância do WhatsApp configurada" });
    }

    const { data: settings } = await admin
      .from("admin_settings")
      .select("key, value")
      .in("key", ["EVOLUTION_API_URL", "EVOLUTION_GLOBAL_KEY"]);

    const evoUrl = settings?.find((s) => s.key === "EVOLUTION_API_URL")?.value?.replace(/\/+$/, "");
    const evoKey = settings?.find((s) => s.key === "EVOLUTION_GLOBAL_KEY")?.value;

    if (!evoUrl || !evoKey) {
      await logStage({ user_id: user.id, lead_id: leadId, stage: "evolution_misconfigured" });
      return json(400, { error: "Evolution API não configurada" });
    }

    const instanceKey = (instance as { evolution_api_key?: string }).evolution_api_key?.trim() || "";
    const apiKeyForInstance = instanceKey || evoKey;
    const evoHeaders = {
      "Content-Type": "application/json",
      apikey: apiKeyForInstance,
    };
    const instanceName = instance.instance_name;

    // STATE CHECK
    let stateOk = false;
    let stateJson: unknown = {};
    try {
      const stateRes = await fetch(
        `${evoUrl}/instance/connectionState/${encodeURIComponent(instanceName)}`,
        { method: "GET", headers: evoHeaders },
      );
      stateJson = await stateRes.json().catch(() => ({}));
      const stateValue =
        (stateJson as Record<string, unknown>)?.instance &&
        ((stateJson as Record<string, Record<string, unknown>>).instance?.state as string);
      const rootState = (stateJson as Record<string, unknown>)?.state as string | undefined;
      const currentState = (stateValue || rootState || "").toString().toLowerCase();
      stateOk = stateRes.ok && currentState === "open";

      await logStage({
        user_id: user.id,
        lead_id: leadId,
        stage: "state_checked",
        http_status: stateRes.status,
        evolution_endpoint: `${evoUrl}/instance/connectionState/${instanceName}`,
        evolution_response: stateJson,
        meta: { state: currentState, ok: stateOk },
      });

      if (!stateOk) {
        await admin
          .from("whatsapp_instances")
          .update({ status: "disconnected", last_error: JSON.stringify(stateJson).slice(0, 500) })
          .eq("user_id", user.id);
        return json(409, {
          error: "WhatsApp desconectado, reconecte pelo QR Code",
          requires_reconnect: true,
          evolutionResponse: stateJson,
        });
      }
    } catch (err) {
      await logStage({
        user_id: user.id,
        lead_id: leadId,
        stage: "state_check_failed",
        error_message: err instanceof Error ? err.message : String(err),
      });
      return json(502, {
        error: "Não foi possível verificar a conexão com a Evolution",
        details: err instanceof Error ? err.message : String(err),
      });
    }

    // RESOLVE NUMBER VIA EVOLUTION whatsappNumbers (authoritative JID lookup)
    const candidates = candidateNumbers(phoneOriginal, storedJid);
    let resolvedJid = "";
    let resolvedNumber = "";

    if (storedJid.endsWith("@lid")) {
      // Private LID contacts can only be reached via the stored JID.
      resolvedJid = storedJid;
      resolvedNumber = storedJid;
    } else if (candidates.length > 0) {
      try {
        const probeUrl = `${evoUrl}/chat/whatsappNumbers/${encodeURIComponent(instanceName)}`;
        const probeRes = await fetch(probeUrl, {
          method: "POST",
          headers: evoHeaders,
          body: JSON.stringify({ numbers: candidates }),
        });
        const probeJson = (await probeRes.json().catch(() => [])) as Array<{
          exists?: boolean;
          jid?: string;
          number?: string;
        }>;

        await logStage({
          user_id: user.id,
          lead_id: leadId,
          stage: "numbers_probed",
          http_status: probeRes.status,
          evolution_endpoint: probeUrl,
          request_payload: { numbers: candidates },
          evolution_response: probeJson as unknown,
        });

        if (Array.isArray(probeJson)) {
          const hit = probeJson.find((r) => r?.exists && typeof r?.jid === "string");
          if (hit && hit.jid) {
            resolvedJid = hit.jid;
            resolvedNumber = onlyDigits(hit.jid.split("@")[0]) || candidates[0];
          }
        }
      } catch (err) {
        await logStage({
          user_id: user.id,
          lead_id: leadId,
          stage: "numbers_probe_failed",
          error_message: err instanceof Error ? err.message : String(err),
        });
      }

      if (!resolvedNumber) {
        // Fallback: use stored JID digits if it exists, else first candidate.
        const fallback =
          (storedJid.endsWith("@s.whatsapp.net") && onlyDigits(storedJid.split("@")[0])) ||
          candidates[0];
        resolvedNumber = fallback;
        resolvedJid = storedJid || `${fallback}@s.whatsapp.net`;
      }
    } else {
      await logStage({
        user_id: user.id,
        lead_id: leadId,
        stage: "no_valid_number",
        phone_original: phoneOriginal,
      });
      return json(400, { error: "Número do lead inválido" });
    }

    const numberToSend = resolvedNumber;

    // Cache the verified JID on the lead so future sends skip the probe.
    if (resolvedJid && resolvedJid !== storedJid && resolvedJid.endsWith("@s.whatsapp.net")) {
      try {
        await admin.from("leads").update({ whatsapp_jid: resolvedJid }).eq("id", leadId);
      } catch (_err) {
        // best-effort
      }
    }

    const typingDelay = Math.min(3000, Math.max(800, content.length * 40));

    try {
      await fetch(`${evoUrl}/chat/sendPresence/${encodeURIComponent(instanceName)}`, {
        method: "POST",
        headers: evoHeaders,
        body: JSON.stringify({ number: numberToSend, delay: typingDelay, presence: "composing" }),
      });
    } catch (_err) {
      // best-effort
    }

    const textPayload: Record<string, unknown> = {
      number: numberToSend,
      text: content,
      delay: typingDelay,
      linkPreview: false,
    };
    const textEndpoint = `${evoUrl}/message/sendText/${encodeURIComponent(instanceName)}`;

    const textRes = await fetch(textEndpoint, {
      method: "POST",
      headers: evoHeaders,
      body: JSON.stringify(textPayload),
    });
    const textRaw = await textRes.text();
    let textJson: unknown = {};
    try {
      textJson = textRaw ? JSON.parse(textRaw) : {};
    } catch {
      textJson = { raw: textRaw.slice(0, 500) };
    }

    await logStage({
      user_id: user.id,
      lead_id: leadId,
      stage: "evolution_called",
      http_status: textRes.status,
      evolution_endpoint: textEndpoint,
      request_payload: textPayload,
      evolution_response: textJson,
      number_used: numberToSend,
      jid_used: resolvedJid,
      phone_original: phoneOriginal,
      variant: "text",
    });

    if (!textRes.ok) {
      const unauthorized = isUnauthorizedCode(textJson);

      if (unauthorized) {
        await admin
          .from("whatsapp_instances")
          .update({
            status: "disconnected",
            last_error: JSON.stringify(textJson).slice(0, 500),
          })
          .eq("user_id", user.id);
      }

      await admin.from("messages").insert({
        user_id: user.id,
        lead_id: leadId,
        direction: "out",
        content,
        status: "failed",
        ai_generated: aiGenerated,
        approved_by_user: true,
      });

      await admin.from("lead_activities").insert({
        user_id: user.id,
        lead_id: leadId,
        action: "message_send_failed",
        meta: {
          type: "text",
          ai: aiGenerated,
          http_status: textRes.status,
          number_sent: numberToSend,
          jid_used: resolvedJid,
          phone_original: phoneOriginal,
          evolution_response: textJson,
        },
      });

      const errMessage = pickEvolutionErrorMessage(textJson, "Falha ao enviar mensagem");
      return json(textRes.status, {
        error: errMessage,
        evolutionResponse: textJson,
        requires_reconnect: unauthorized,
      });
    }

    const waId = extractEvolutionMessageId(textJson);

    const { data: saved } = await admin
      .from("messages")
      .insert({
        user_id: user.id,
        lead_id: leadId,
        direction: "out",
        content,
        whatsapp_message_id: waId,
        status: "sent",
        ai_generated: aiGenerated,
        approved_by_user: true,
        instance_id: (instance as { id: string }).id,
      })
      .select()
      .maybeSingle();

    await admin
      .from("leads")
      .update({
        last_message: content,
        last_activity_at: new Date().toISOString(),
        message_count: (lead.message_count || 0) + 1,
        ...(leadInstanceId ? {} : { instance_id: (instance as { id: string }).id }),
      })
      .eq("id", leadId);

    await admin.from("lead_activities").insert({
      user_id: user.id,
      lead_id: leadId,
      action: "message_sent",
      meta: {
        type: "text",
        ai: aiGenerated,
        whatsapp_message_id: waId,
        number_sent: numberToSend,
        jid_used: resolvedJid,
      },
    });

    await logStage({
      user_id: user.id,
      lead_id: leadId,
      stage: "finished",
      http_status: 200,
      number_used: numberToSend,
      jid_used: resolvedJid,
    });

    return json(200, {
      message: saved,
      evolution: textJson,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    await logStage({ stage: "exception", error_message: message });
    return json(500, { error: message });
  }
});
