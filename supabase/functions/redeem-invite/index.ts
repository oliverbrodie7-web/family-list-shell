// Edge Function: redeem-invite
// Validates a family-invite token and returns auth tokens so the new device
// can sign into the shared family Supabase account without seeing the password.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE =
      Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      console.error("redeem-invite: missing env");
      return json(500, { error: "Server not configured" });
    }

    const { token } = (await req.json().catch(() => ({}))) as { token?: string };
    if (!token || typeof token !== "string") {
      return json(400, { error: "Missing token" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Look up invite
    const { data: invite, error: invErr } = await admin
      .from("shopping_family_invites")
      .select("id, token, household_id, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (invErr) {
      console.error("redeem-invite: invite query failed", invErr.message);
      return json(500, { error: "Lookup failed" });
    }
    if (!invite) {
      console.log("redeem-invite: token not found");
      return json(400, { error: "This invite link is invalid or has expired" });
    }
    if (new Date(invite.expires_at).getTime() <= Date.now()) {
      console.log("redeem-invite: token expired");
      return json(400, { error: "This invite link is invalid or has expired" });
    }

    // 2. Find the family account user_id linked to this household
    const { data: memberRow, error: memErr } = await admin
      .from("shopping_household_members")
      .select("user_id")
      .eq("household_id", invite.household_id)
      .limit(1)
      .maybeSingle();

    if (memErr || !memberRow?.user_id) {
      console.error("redeem-invite: no household member user", memErr?.message);
      return json(500, { error: "Family account not found" });
    }

    // 3. Get email for that user
    const { data: userData, error: userErr } = await admin.auth.admin.getUserById(
      memberRow.user_id,
    );
    if (userErr || !userData?.user?.email) {
      console.error("redeem-invite: getUserById failed", userErr?.message);
      return json(500, { error: "Family account not found" });
    }
    const email = userData.user.email;

    // 4. Generate magic link → returns hashed_token usable with verifyOtp
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr || !linkData?.properties?.hashed_token) {
      console.error("redeem-invite: generateLink failed", linkErr?.message);
      return json(500, { error: "Could not create session" });
    }

    console.log(`redeem-invite: success for household ${invite.household_id}`);
    return json(200, {
      email,
      token_hash: linkData.properties.hashed_token,
      household_id: invite.household_id,
    });
  } catch (e) {
    console.error("redeem-invite: unexpected", e instanceof Error ? e.message : e);
    return json(500, { error: "Unexpected error" });
  }
});
