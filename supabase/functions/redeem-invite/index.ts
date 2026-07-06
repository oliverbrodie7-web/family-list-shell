// Edge Function: redeem-invite
// Validates a family invite — either a long { token } (link flow) or a short
// { code } (typed-code flow) — and returns auth tokens so the new device can
// sign into the shared family Supabase account without seeing the password.
// Short codes are single-use: they're marked redeemed after a successful redeem.

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

    const body = (await req.json().catch(() => ({}))) as {
      token?: string;
      code?: string;
    };
    const token = typeof body.token === "string" ? body.token : "";
    // Prefer the link token when present; otherwise use the typed code.
    const isCodeRedeem = !token && typeof body.code === "string" && body.code.trim() !== "";
    const normalizedCode = isCodeRedeem ? body.code!.trim().toUpperCase() : "";

    if (!token && !normalizedCode) {
      return json(400, { error: "Missing token or code" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Look up invite — by token (link) or by code (case-insensitive).
    let query = admin
      .from("shopping_family_invites")
      .select("id, token, code, household_id, expires_at, redeemed_at");
    query = isCodeRedeem ? query.ilike("code", normalizedCode) : query.eq("token", token);

    const { data: invite, error: invErr } = await query.maybeSingle();

    if (invErr) {
      console.error("redeem-invite: invite query failed", invErr.message);
      return json(500, { error: "Lookup failed" });
    }
    if (!invite) {
      console.log("redeem-invite: invite not found");
      return json(400, { error: "This invite link is invalid or has expired" });
    }
    if (new Date(invite.expires_at).getTime() <= Date.now()) {
      console.log("redeem-invite: invite expired");
      return json(400, { error: "This invite link is invalid or has expired" });
    }
    if (invite.redeemed_at) {
      console.log("redeem-invite: invite already redeemed");
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

    // 5. SINGLE-USE for codes: mark the invite redeemed so the code can't be
    //    reused. Link (token) redeems keep their existing multi-use behaviour.
    if (isCodeRedeem) {
      const { error: markErr } = await admin
        .from("shopping_family_invites")
        .update({ redeemed_at: new Date().toISOString() })
        .eq("id", invite.id);
      if (markErr) {
        console.error("redeem-invite: failed to mark code redeemed", markErr.message);
      }
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
