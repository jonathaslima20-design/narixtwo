import { createClient } from "npm:@supabase/supabase-js@2.80.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
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

function interpolateMessage(
  template: string,
  leadName: string | null,
  phone: string,
): string {
  let result = template || "";
  if (leadName) {
    result = result.replace(/\{nome\}/gi, leadName);
  } else {
    // Remove {nome} and any extra space left around it to avoid double spaces
    result = result.replace(/\s*\{nome\}\s*/gi, (match, offset, str) => {
      const before = str[offset - 1];
      const after = str[offset + match.length];
      if (before && after && before !== " " && after !== " ") return " ";
      return "";
    });
  }
  return result.replace(/\{telefone\}/gi, phone || "");
}

function isWithinWindow(start: string, end: string): boolean {
  if (!start || !end) return true;
  const now = new Date();
  const hh = now.getUTCHours() - 3;
  const mm = now.getUTCMinutes();
  const current = (hh < 0 ? hh + 24 : hh) * 60 + mm;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  return current >= startMin && current <= endMin;
}

const BUDGET_MS = 100_000;

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
    const campaignId = (body?.campaign_id as string | undefined)?.trim();
    if (!campaignId) return json(400, { error: "campaign_id é obrigatório" });

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: campaign, error: campErr } = await admin
      .from("campaigns")
      .select("*")
      .eq("id", campaignId)
      .maybeSingle();

    if (campErr || !campaign)
      return json(404, { error: "Campanha não encontrada" });
    if (campaign.user_id !== user.id)
      return json(403, { error: "Acesso negado" });
    if (
      campaign.status !== "sending" &&
      campaign.status !== "scheduled" &&
      campaign.status !== "draft"
    ) {
      return json(400, {
        error: `Campanha com status '${campaign.status}' não pode ser enviada`,
      });
    }

    if (campaign.status !== "sending") {
      await admin
        .from("campaigns")
        .update({
          status: "sending",
          started_at: campaign.started_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", campaignId);
    }

    const selectedInstanceIds: string[] = Array.isArray(campaign.instance_ids)
      ? (campaign.instance_ids as string[])
      : [];

    let instanceQuery = admin
      .from("whatsapp_instances")
      .select("id, instance_name, status, evolution_api_key")
      .eq("user_id", user.id);
    if (selectedInstanceIds.length > 0) {
      instanceQuery = instanceQuery.in("id", selectedInstanceIds);
    }
    const { data: instancesRaw } = await instanceQuery;

    const instances = (instancesRaw || []).filter(
      (i: { status: string }) => i.status === "connected",
    );

    if (instances.length === 0)
      return json(400, { error: "Nenhuma instância do WhatsApp conectada" });

    const { data: settings } = await admin
      .from("admin_settings")
      .select("key, value")
      .in("key", ["EVOLUTION_API_URL", "EVOLUTION_GLOBAL_KEY"]);

    const evoUrl = settings
      ?.find((s: { key: string }) => s.key === "EVOLUTION_API_URL")
      ?.value?.replace(/\/+$/, "");
    const evoKey = settings?.find(
      (s: { key: string }) => s.key === "EVOLUTION_GLOBAL_KEY",
    )?.value;

    if (!evoUrl || !evoKey)
      return json(400, { error: "Evolution API não configurada" });

    type InstanceCtx = {
      id: string;
      instance_name: string;
      evolution_api_key: string | null;
      headers: Record<string, string>;
    };

    const instanceCtxAll: InstanceCtx[] = instances.map((i: { id: string; instance_name: string; evolution_api_key: string | null }) => {
      const key = (i.evolution_api_key || "").trim() || evoKey;
      return {
        id: i.id,
        instance_name: i.instance_name,
        evolution_api_key: i.evolution_api_key,
        headers: { "Content-Type": "application/json", apikey: key },
      };
    });

    // Verify connection state for each selected instance
    const liveInstances: InstanceCtx[] = [];
    for (const ctx of instanceCtxAll) {
      try {
        const stateRes = await fetch(
          `${evoUrl}/instance/connectionState/${encodeURIComponent(ctx.instance_name)}`,
          { method: "GET", headers: ctx.headers },
        );
        const stateJson = (await stateRes.json().catch(() => ({}))) as Record<string, unknown>;
        const stateValue = stateJson?.instance &&
          ((stateJson as Record<string, Record<string, unknown>>).instance?.state as string);
        const rootState = stateJson?.state as string | undefined;
        const currentState = (stateValue || rootState || "").toString().toLowerCase();
        if (stateRes.ok && currentState === "open") {
          liveInstances.push(ctx);
        }
      } catch {
        // skip this instance
      }
    }

    if (liveInstances.length === 0) {
      await admin
        .from("campaigns")
        .update({ status: "paused", updated_at: new Date().toISOString() })
        .eq("id", campaignId);
      return json(409, {
        error: "Nenhuma instância conectada disponível. Campanha pausada.",
      });
    }

    let mediaBase64 = "";
    if (campaign.message_type !== "text" && campaign.media_url) {
      if (
        campaign.media_url.startsWith("http://") ||
        campaign.media_url.startsWith("https://")
      ) {
        mediaBase64 = campaign.media_url;
      } else {
        const { data: file } = await admin.storage
          .from("campaign-media")
          .download(campaign.media_url);
        if (file) {
          const buf = new Uint8Array(await file.arrayBuffer());
          let binary = "";
          for (let i = 0; i < buf.length; i++)
            binary += String.fromCharCode(buf[i]);
          mediaBase64 = btoa(binary);
        }
      }
    }

    const { data: recipients } = await admin
      .from("campaign_recipients")
      .select("id, lead_id, phone, lead_name, status")
      .eq("campaign_id", campaignId)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(500);

    if (!recipients || recipients.length === 0) {
      await admin
        .from("campaigns")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", campaignId);
      return json(200, {
        completed: true,
        sent: 0,
        failed: 0,
        remaining: 0,
      });
    }

    // Check subscription quota for trial users
    const { data: subRow } = await admin
      .from("client_subscriptions")
      .select("send_count, plan_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let currentSendCount = subRow?.send_count ?? 0;
    let maxSends = -1;
    if (subRow?.plan_id) {
      const { data: planRow } = await admin
        .from("plans")
        .select("max_sends")
        .eq("id", subRow.plan_id)
        .maybeSingle();
      maxSends = planRow?.max_sends ?? -1;
    }

    const delayMin = Math.max(15000, campaign.delay_ms ?? 20000);
    const delayMax = Math.max(delayMin + 15000, campaign.delay_ms_max ?? delayMin + 20000);
    const startTime = Date.now();
    let sentCount = 0;
    let failedCount = 0;
    let rrIndex = 0;

    for (const recipient of recipients) {
      const ctx = liveInstances[rrIndex % liveInstances.length];
      rrIndex++;
      const instanceName = ctx.instance_name;
      const evoHeaders = ctx.headers;
      if (Date.now() - startTime > BUDGET_MS) break;

      if (!isWithinWindow(campaign.send_window_start, campaign.send_window_end)) break;

      const { data: freshCampaign } = await admin
        .from("campaigns")
        .select("status")
        .eq("id", campaignId)
        .maybeSingle();

      if (
        !freshCampaign ||
        freshCampaign.status === "paused" ||
        freshCampaign.status === "cancelled"
      ) {
        break;
      }

      // Quota check: skip remaining if trial limit reached
      if (maxSends !== -1 && currentSendCount >= maxSends) {
        await admin
          .from("campaign_recipients")
          .update({ status: "skipped", error_message: "Limite de envios do plano atingido" })
          .eq("id", recipient.id);
        failedCount++;
        continue;
      }

      const phone = recipient.phone;
      const isLid = phone.startsWith("lid:") || phone.endsWith("@lid");
      let number: string;
      if (isLid) {
        number = phone;
      } else {
        const normalized = normalizeBrPhone(phone);
        if (!normalized) {
          await admin
            .from("campaign_recipients")
            .update({ status: "skipped", error_message: "Número inválido" })
            .eq("id", recipient.id);
          failedCount++;
          continue;
        }
        number = normalized;
      }

      await admin
        .from("campaign_recipients")
        .update({ status: "sending", instance_id: ctx.id })
        .eq("id", recipient.id);

      const messageContent = interpolateMessage(
        campaign.content,
        recipient.lead_name,
        recipient.phone,
      );
      const captionContent = interpolateMessage(
        campaign.caption || "",
        recipient.lead_name,
        recipient.phone,
      );

      let sendRes: Response;
      try {
        if (campaign.message_type === "text") {
          sendRes = await fetch(
            `${evoUrl}/message/sendText/${encodeURIComponent(instanceName)}`,
            {
              method: "POST",
              headers: evoHeaders,
              body: JSON.stringify({
                number,
                text: messageContent,
                linkPreview: false,
              }),
            },
          );
        } else if (campaign.message_type === "audio") {
          sendRes = await fetch(
            `${evoUrl}/message/sendWhatsAppAudio/${encodeURIComponent(instanceName)}`,
            {
              method: "POST",
              headers: evoHeaders,
              body: JSON.stringify({
                number,
                audio: mediaBase64,
                encoding: true,
              }),
            },
          );
        } else {
          const isUrl =
            mediaBase64.startsWith("http://") ||
            mediaBase64.startsWith("https://");
          sendRes = await fetch(
            `${evoUrl}/message/sendMedia/${encodeURIComponent(instanceName)}`,
            {
              method: "POST",
              headers: evoHeaders,
              body: JSON.stringify({
                number,
                mediatype:
                  campaign.message_type === "image" ? "image" : "document",
                mimetype: campaign.media_type || "application/octet-stream",
                caption: captionContent || messageContent,
                media: isUrl ? mediaBase64 : mediaBase64,
                fileName: campaign.media_filename || "file",
              }),
            },
          );
        }
      } catch (err) {
        await admin
          .from("campaign_recipients")
          .update({
            status: "failed",
            error_message:
              err instanceof Error ? err.message : "Erro de rede",
          })
          .eq("id", recipient.id);
        failedCount++;
        continue;
      }

      const rawText = await sendRes.text();
      let sendJson: unknown = {};
      try {
        sendJson = rawText ? JSON.parse(rawText) : {};
      } catch {
        sendJson = { raw: rawText.slice(0, 500) };
      }

      const waId = extractEvolutionMessageId(sendJson);

      if (sendRes.ok && waId) {
        await admin
          .from("campaign_recipients")
          .update({
            status: "sent",
            whatsapp_message_id: waId,
            sent_at: new Date().toISOString(),
          })
          .eq("id", recipient.id);

        // Insert into messages table so the message appears in chat
        if (recipient.lead_id) {
          const isMedia = campaign.message_type !== "text" && campaign.message_type !== "audio";
          const isAudio = campaign.message_type === "audio";
          const mediaUrl = campaign.media_url || "";
          const mediaIsUrl = mediaUrl.startsWith("http://") || mediaUrl.startsWith("https://");

          await admin.from("messages").insert({
            user_id: user.id,
            lead_id: recipient.lead_id,
            direction: "out",
            content: isMedia ? (captionContent || messageContent) : messageContent,
            whatsapp_message_id: waId,
            status: "sent",
            instance_id: ctx.id,
            media_url: (isMedia || isAudio) && mediaIsUrl ? mediaUrl : "",
            media_type: isAudio ? "audio" : isMedia ? (campaign.message_type || "") : "",
            media_mime: isMedia ? (campaign.media_type || "") : "",
            media_caption: isMedia ? (captionContent || "") : "",
            media_filename: isMedia ? (campaign.media_filename || "") : "",
          });
        }

        sentCount++;
        currentSendCount++;
        await admin
          .from("client_subscriptions")
          .update({ send_count: currentSendCount, updated_at: new Date().toISOString() })
          .eq("user_id", user.id);
      } else {
        const errMsg =
          typeof (sendJson as Record<string, unknown>)?.message === "string"
            ? ((sendJson as Record<string, unknown>).message as string)
            : `HTTP ${sendRes.status}`;
        await admin
          .from("campaign_recipients")
          .update({
            status: "failed",
            error_message: errMsg,
          })
          .eq("id", recipient.id);
        failedCount++;
      }

      await admin
        .from("campaigns")
        .update({
          sent_count: (campaign.sent_count ?? 0) + sentCount,
          failed_count: (campaign.failed_count ?? 0) + failedCount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", campaignId);

      const actualDelay = Math.floor(Math.random() * (delayMax - delayMin + 1)) + delayMin;
      await new Promise((r) => setTimeout(r, actualDelay));
    }

    const { data: finalRecipients } = await admin
      .from("campaign_recipients")
      .select("status")
      .eq("campaign_id", campaignId);

    const finalSent =
      finalRecipients?.filter(
        (r: { status: string }) =>
          r.status === "sent" ||
          r.status === "delivered" ||
          r.status === "read",
      ).length ?? 0;
    const finalFailed =
      finalRecipients?.filter(
        (r: { status: string }) =>
          r.status === "failed" || r.status === "skipped",
      ).length ?? 0;
    const finalPending =
      finalRecipients?.filter(
        (r: { status: string }) =>
          r.status === "pending" || r.status === "sending",
      ).length ?? 0;

    const isComplete = finalPending === 0;

    await admin
      .from("campaigns")
      .update({
        sent_count: finalSent,
        failed_count: finalFailed,
        ...(isComplete
          ? { status: "completed", completed_at: new Date().toISOString() }
          : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaignId);

    return json(200, {
      completed: isComplete,
      sent: sentCount,
      failed: failedCount,
      remaining: finalPending,
      elapsed_ms: Date.now() - startTime,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return json(500, { error: message });
  }
});
