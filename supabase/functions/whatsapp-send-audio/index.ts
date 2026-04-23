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

function normalizeBrPhone(raw: string): string {
  const digits = onlyDigits(raw);
  if (!digits) return "";
  if (digits.startsWith("55")) {
    const rest = digits.slice(2);
    if (rest.length === 10) {
      const ddd = rest.slice(0, 2);
      const first = rest.charAt(2);
      const subscriber = rest.slice(2);
      if (/[6-9]/.test(first)) {
        return `55${ddd}9${subscriber}`;
      }
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
  if (code) {
    if (/^UNAUTHORIZED/i.test(code)) {
      return "Evolution recusou a autenticação da instância (apikey inválida). Reconecte o WhatsApp pelo QR Code.";
    }
    return `Evolution retornou: ${code}`;
  }
  return fallback;
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
    const storagePath = (body?.storage_path as string | undefined)?.trim();
    const audioBase64Input = (body?.audio_base64 as string | undefined)?.trim();
    const durationSeconds = Math.max(1, Math.round(Number(body?.duration_seconds) || 1));

    if (!leadId) return json(400, { error: "lead_id é obrigatório" });
    if (!storagePath && !audioBase64Input) {
      return json(400, { error: "storage_path ou audio_base64 é obrigatório" });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: lead, error: leadErr } = await admin
      .from("leads")
      .select("id, user_id, phone, message_count, whatsapp_jid")
      .eq("id", leadId)
      .maybeSingle();

    if (leadErr || !lead) return json(404, { error: "Lead não encontrado" });
    if (lead.user_id !== user.id) return json(403, { error: "Acesso negado" });

    const { data: instance, error: instErr } = await admin
      .from("whatsapp_instances")
      .select("instance_name, status, evolution_api_key")
      .eq("user_id", user.id)
      .maybeSingle();

    if (instErr || !instance) {
      return json(400, { error: "Nenhuma instância do WhatsApp configurada" });
    }

    const { data: settings } = await admin
      .from("admin_settings")
      .select("key, value")
      .in("key", ["EVOLUTION_API_URL", "EVOLUTION_GLOBAL_KEY"]);

    const evoUrl = settings?.find((s) => s.key === "EVOLUTION_API_URL")?.value?.replace(/\/+$/, "");
    const evoKey = settings?.find((s) => s.key === "EVOLUTION_GLOBAL_KEY")?.value;

    if (!evoUrl || !evoKey) {
      return json(400, { error: "Evolution API não configurada" });
    }

    const instanceKey =
      (instance as { evolution_api_key?: string }).evolution_api_key?.trim() || "";
    const apiKeyForInstance = instanceKey || evoKey;

    const evoHeaders = {
      "Content-Type": "application/json",
      apikey: apiKeyForInstance,
    };

    const instanceName = instance.instance_name;

    try {
      const stateRes = await fetch(
        `${evoUrl}/instance/connectionState/${encodeURIComponent(instanceName)}`,
        { method: "GET", headers: evoHeaders },
      );
      const stateJson = await stateRes.json().catch(() => ({}));
      const stateValue =
        (stateJson as Record<string, unknown>)?.instance &&
        ((stateJson as Record<string, Record<string, unknown>>).instance?.state as string);
      const rootState = (stateJson as Record<string, unknown>)?.state as string | undefined;
      const currentState = (stateValue || rootState || "").toString().toLowerCase();
      if (!stateRes.ok || currentState !== "open") {
        await admin
          .from("whatsapp_instances")
          .update({ status: "disconnected" })
          .eq("user_id", user.id);
        return json(409, {
          error: "WhatsApp desconectado, reconecte pelo QR Code",
          evolutionResponse: stateJson,
        });
      }
      if (instance.status !== "connected") {
        await admin
          .from("whatsapp_instances")
          .update({ status: "connected" })
          .eq("user_id", user.id);
      }
    } catch (err) {
      return json(502, {
        error: "Não foi possível verificar a conexão com a Evolution",
        details: err instanceof Error ? err.message : String(err),
      });
    }

    const MAX_AUDIO_BYTES = 16 * 1024 * 1024;

    let audioBase64 = audioBase64Input ?? "";
    const savedPath = storagePath ?? "";

    if (!audioBase64 && storagePath) {
      const { data: file, error: dlErr } = await admin.storage
        .from("lead-audio-messages")
        .download(storagePath);
      if (dlErr || !file) {
        return json(400, { error: "Falha ao ler áudio do Storage" });
      }
      const buf = new Uint8Array(await file.arrayBuffer());
      if (buf.length > MAX_AUDIO_BYTES) {
        return json(413, { error: "Áudio excede o limite de 16 MB" });
      }
      let binary = "";
      for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
      audioBase64 = btoa(binary);
    }

    if (audioBase64.startsWith("data:")) {
      audioBase64 = audioBase64.replace(/^data:[^;]+;base64,/, "");
    }

    const approxBytes = Math.floor((audioBase64.length * 3) / 4);
    if (approxBytes > MAX_AUDIO_BYTES) {
      return json(413, { error: "Áudio excede o limite de 16 MB" });
    }

    const storedJid = (lead as { whatsapp_jid: string | null }).whatsapp_jid || "";
    const isLidLead =
      (typeof lead.phone === "string" && lead.phone.startsWith("lid:")) ||
      storedJid.endsWith("@lid");
    const originalNumber = onlyDigits(lead.phone);
    const normalizedPhone = normalizeBrPhone(lead.phone);
    let number: string;
    if (isLidLead) {
      if (!storedJid) return json(400, { error: "Contato privado sem identificador WhatsApp" });
      number = storedJid;
    } else {
      if (!normalizedPhone) return json(400, { error: "Número do lead inválido" });
      number = normalizedPhone;
    }

    const presenceDelay = Math.max(durationSeconds * 1000, 1500);

    try {
      await fetch(`${evoUrl}/chat/sendPresence/${encodeURIComponent(instanceName)}`, {
        method: "POST",
        headers: evoHeaders,
        body: JSON.stringify({
          number,
          delay: presenceDelay,
          presence: "recording",
        }),
      });
    } catch (_err) {
      // presence is best-effort; continue
    }

    const sendRes = await fetch(
      `${evoUrl}/message/sendWhatsAppAudio/${encodeURIComponent(instanceName)}`,
      {
        method: "POST",
        headers: evoHeaders,
        body: JSON.stringify({
          number,
          audio: audioBase64,
          delay: presenceDelay,
          encoding: true,
        }),
      },
    );

    const rawText = await sendRes.text();
    let sendJson: unknown = {};
    try {
      sendJson = rawText ? JSON.parse(rawText) : {};
    } catch {
      sendJson = { raw: rawText.slice(0, 500) };
    }

    const waId = extractEvolutionMessageId(sendJson);
    const succeeded = sendRes.ok && waId !== "";

    let mediaUrl = "";
    if (savedPath) {
      const { data: signed } = await admin.storage
        .from("lead-audio-messages")
        .createSignedUrl(savedPath, 60 * 60 * 24 * 365);
      mediaUrl = signed?.signedUrl ?? "";
    }

    if (!succeeded) {
      await admin.from("messages").insert({
        user_id: user.id,
        lead_id: leadId,
        direction: "out",
        content: "",
        media_url: mediaUrl,
        media_type: "audio",
        audio_duration_seconds: durationSeconds,
        status: "failed",
        ai_generated: false,
        approved_by_user: true,
      });

      await admin.from("lead_activities").insert({
        user_id: user.id,
        lead_id: leadId,
        action: "message_send_failed",
        meta: {
          type: "audio",
          duration: durationSeconds,
          http_status: sendRes.status,
          number_sent: number,
          number_original: originalNumber,
          evolution_response: sendJson,
        },
      });

      const errMessage = pickEvolutionErrorMessage(
        sendJson,
        sendRes.ok ? "Evolution não retornou ID do áudio" : "Falha ao enviar áudio",
      );
      return json(sendRes.ok ? 502 : sendRes.status, {
        error: errMessage,
        evolutionResponse: sendJson,
      });
    }

    if (!isLidLead && normalizedPhone && normalizedPhone !== originalNumber) {
      await admin.from("leads").update({ phone: normalizedPhone }).eq("id", leadId);
    }

    const { data: saved, error: saveErr } = await admin
      .from("messages")
      .insert({
        user_id: user.id,
        lead_id: leadId,
        direction: "out",
        content: "",
        media_url: mediaUrl,
        media_type: "audio",
        audio_duration_seconds: durationSeconds,
        whatsapp_message_id: waId,
        status: "sent",
        ai_generated: false,
        approved_by_user: true,
      })
      .select()
      .maybeSingle();

    if (saveErr) {
      return json(500, { error: "Áudio enviado, mas falhou ao salvar no histórico" });
    }

    await admin
      .from("leads")
      .update({
        last_message: "Mensagem de voz",
        last_activity_at: new Date().toISOString(),
        message_count: (lead.message_count || 0) + 1,
      })
      .eq("id", leadId);

    await admin.from("lead_activities").insert({
      user_id: user.id,
      lead_id: leadId,
      action: "message_sent",
      meta: {
        type: "audio",
        duration: durationSeconds,
        whatsapp_message_id: waId,
        number_sent: number,
      },
    });

    return json(200, { message: saved, evolution: sendJson });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return json(500, { error: message });
  }
});
