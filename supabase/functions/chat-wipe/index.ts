import { createClient } from "npm:@supabase/supabase-js@2.80.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const AUDIO_BUCKET = "lead-audio-messages";
const CONFIRM_WORD = "LIMPAR";

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Admin = ReturnType<typeof createClient>;

interface AudioResult {
  removed: number;
  warnings: string[];
}

async function deleteAllAudioObjects(admin: Admin, userId: string): Promise<AudioResult> {
  const result: AudioResult = { removed: 0, warnings: [] };
  const queue: string[] = [userId];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const prefix = queue.shift()!;
    if (seen.has(prefix)) continue;
    seen.add(prefix);

    let offset = 0;
    for (;;) {
      const { data, error } = await admin.storage
        .from(AUDIO_BUCKET)
        .list(prefix, { limit: 100, offset });

      if (error) {
        const msg = (error.message || "").toLowerCase();
        if (!msg.includes("not found") && !msg.includes("no such")) {
          result.warnings.push(`list ${prefix}: ${error.message}`);
        }
        break;
      }
      if (!data || data.length === 0) break;

      const files: string[] = [];
      for (const entry of data) {
        const path = `${prefix}/${entry.name}`;
        const isFolder = entry.id === null || entry.metadata === null;
        if (isFolder) {
          queue.push(path);
        } else {
          files.push(path);
        }
      }

      if (files.length > 0) {
        const { error: removeError } = await admin.storage.from(AUDIO_BUCKET).remove(files);
        if (removeError) {
          result.warnings.push(`remove ${prefix}: ${removeError.message}`);
        } else {
          result.removed += files.length;
        }
      }

      if (data.length < 100) break;
      offset += 100;
    }
  }
  return result;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  let step = "init";
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    step = "auth";
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return json(401, { error: "Missing authorization token", step });

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
    });
    if (!userRes.ok) return json(401, { error: "Invalid authentication", step });
    const user = (await userRes.json()) as { id?: string };
    if (!user?.id) return json(401, { error: "Invalid authentication", step });

    step = "parse_body";
    const body = (await req.json().catch(() => ({}))) as { confirm?: string };
    if (body.confirm !== CONFIRM_WORD) {
      return json(400, {
        error: `Confirmação inválida. Envie { confirm: "${CONFIRM_WORD}" } para prosseguir.`,
        step,
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const userId = user.id;

    step = "storage_wipe";
    console.log("[chat-wipe] step:", step, "user:", userId);
    let audioResult: AudioResult = { removed: 0, warnings: [] };
    try {
      audioResult = await deleteAllAudioObjects(admin, userId);
    } catch (err) {
      console.error("[chat-wipe] storage_wipe failed", err);
      audioResult.warnings.push(err instanceof Error ? err.message : String(err));
    }

    step = "rpc_wipe";
    console.log("[chat-wipe] step:", step);
    const { data: rpcData, error: rpcError } = await admin.rpc("wipe_user_chat_data", {
      target_user: userId,
    });
    if (rpcError) {
      console.error("[chat-wipe] rpc failed", rpcError);
      return json(500, {
        error: `Falha ao limpar dados: ${rpcError.message}`,
        step,
        code: rpcError.code,
        details: rpcError.details,
        hint: rpcError.hint,
      });
    }

    const counts = (rpcData as Record<string, number> | null) ?? {};
    step = "done";
    console.log("[chat-wipe] done", counts);

    return json(200, {
      ok: true,
      deleted: {
        leads: counts.leads ?? 0,
        messages: counts.messages ?? 0,
        ai_suggestions: counts.ai_suggestions ?? 0,
        lead_presence: counts.lead_presence ?? 0,
        scheduled_followups: counts.scheduled_followups ?? 0,
        lead_notes: counts.lead_notes ?? 0,
        lead_activities: counts.lead_activities ?? 0,
        whatsapp_history_sync_jobs: counts.whatsapp_history_sync_jobs ?? 0,
        audio_files: audioResult.removed,
      },
      storage_warnings: audioResult.warnings,
    });
  } catch (err) {
    console.error("[chat-wipe] unexpected error at step", step, err);
    const message = err instanceof Error ? err.message : "Erro inesperado";
    return json(500, { error: message, step });
  }
});
