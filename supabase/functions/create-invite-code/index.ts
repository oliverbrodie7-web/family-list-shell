// Edge Function: create-invite-code
// Generates a short, human-friendly join code (e.g. PANTRY-4Q7X) for the logged-in
// user's household and stores it in shopping_family_invites. A matching long token
// is also written so existing link/NOT-NULL assumptions still hold. The code is
// redeemed (single-use) via redeem-invite. Uses the service-role key to insert
// rows the caller's own RLS permissions may not allow.

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

// Unambiguous alphabet — no 0/O, 1/I/L.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  let suffix = "";
  for (let i = 0; i < 4; i++) {
    suffix += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return `PANTRY-${suffix}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE =
      Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      console.error("create-invite-code: missing env");
      return json(500, { error: "Server not configured" });
    }

    // Caller's access token from the Authorization: Bearer header.
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
    const accessToken = authHeader?.replace(/^Bearer\s+/i, "").trim();
    if (!accessToken) {
      return json(401, { error: "Not authenticated" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Verify the caller is a real authenticated user.
    const { data: userData, error: userErr } = await admin.auth.getUser(accessToken);
    if (userErr || !userData?.user?.id) {
      console.log("create-invite-code: invalid token", userErr?.message);
      return json(401, { error: "Not authenticated" });
    }
    const userId = userData.user.id;

    // 2. Find the caller's household.
    const { data: memberRow, error: memErr } = await admin
      .from("shopping_household_members")
      .select("household_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (memErr) {
      console.error("create-invite-code: membership lookup failed", memErr.message);
      return json(500, { error: "Lookup failed" });
    }
    if (!memberRow?.household_id) {
      return json(400, { error: "You are not part of a household yet" });
    }
    const householdId = memberRow.household_id;

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // 3. Insert a fresh code, regenerating on unique-collision.
    const MAX_ATTEMPTS = 6;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const code = randomCode();
      const { data: inserted, error: insErr } = await admin
        .from("shopping_family_invites")
        .insert({
          household_id: householdId,
          code,
          token: crypto.randomUUID(),
          expires_at: expiresAt,
        })
        .select("code, expires_at")
        .single();

      if (!insErr && inserted) {
        console.log(`create-invite-code: created ${inserted.code} for household ${householdId}`);
        return json(200, { code: inserted.code, expires_at: inserted.expires_at });
      }

      // 23505 = unique_violation → collision on code, try again.
      if (insErr && (insErr as { code?: string }).code === "23505") {
        console.log(`create-invite-code: code collision, retrying (${attempt + 1})`);
        continue;
      }

      console.error("create-invite-code: insert failed", insErr?.message);
      return json(500, { error: "Could not create code" });
    }

    console.error("create-invite-code: exhausted code attempts");
    return json(500, { error: "Could not create a unique code, please try again" });
  } catch (e) {
    console.error("create-invite-code: unexpected", e instanceof Error ? e.message : e);
    return json(500, { error: "Unexpected error" });
  }
});
