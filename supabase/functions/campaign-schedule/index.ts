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

    const admin = createClient(supabaseUrl, serviceKey);

    // Find scheduled campaigns that are due
    const { data: dueCampaigns } = await admin
      .from("campaigns")
      .select("id, name, status, scheduled_at")
      .eq("user_id", user.id)
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true });

    // Find campaigns that are sending but may need resumption (timeout recovery)
    const { data: sendingCampaigns } = await admin
      .from("campaigns")
      .select("id, name, status")
      .eq("user_id", user.id)
      .eq("status", "sending");

    const campaignsToProcess = [
      ...(dueCampaigns || []),
      ...(sendingCampaigns || []),
    ];

    const results: Array<{
      campaign_id: string;
      name: string;
      action: string;
      send_result?: unknown;
    }> = [];

    for (const camp of campaignsToProcess) {
      const { count } = await admin
        .from("campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", camp.id)
        .eq("status", "pending");

      if (!count || count === 0) {
        if (camp.status === "scheduled") {
          await admin
            .from("campaigns")
            .update({
              status: "completed",
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", camp.id);
          results.push({
            campaign_id: camp.id,
            name: camp.name,
            action: "completed_no_recipients",
          });
        }
        continue;
      }

      // Actually trigger the campaign-send function
      try {
        const sendRes = await fetch(
          `${supabaseUrl}/functions/v1/campaign-send`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              apikey: anonKey,
            },
            body: JSON.stringify({ campaign_id: camp.id }),
          },
        );
        const sendJson = await sendRes.json().catch(() => ({}));

        results.push({
          campaign_id: camp.id,
          name: camp.name,
          action:
            camp.status === "scheduled"
              ? "triggered_scheduled"
              : "resume_sending",
          send_result: sendJson,
        });
      } catch (err) {
        results.push({
          campaign_id: camp.id,
          name: camp.name,
          action: "send_error",
          send_result:
            err instanceof Error ? err.message : "Failed to invoke send",
        });
      }
    }

    return json(200, {
      checked_at: new Date().toISOString(),
      campaigns: results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return json(500, { error: message });
  }
});
