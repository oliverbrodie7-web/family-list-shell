// Edge Function: create-household
// Lets a brand-new authenticated user create their OWN household and become its
// first household-member link. A freshly signed-up user isn't in any household
// yet, so RLS blocks them from inserting these rows directly. Like redeem-invite,
// this uses the service-role key to perform those inserts on their behalf — but
// only after validating the caller's own auth token, and only for themselves.

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
      console.error("create-household: missing env");
      return json(500, { error: "Server not configured" });
    }

    const body = (await req.json().catch(() => ({}))) as {
      familyName?: string;
      access_token?: string;
    };

    // Caller's access token: prefer the Authorization: Bearer header, fall back
    // to an access_token in the JSON body.
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
    const bearer = authHeader?.replace(/^Bearer\s+/i, "").trim();
    const accessToken = bearer || body.access_token;
    if (!accessToken) {
      return json(401, { error: "Not authenticated" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Verify the caller is a real authenticated user.
    const { data: userData, error: userErr } = await admin.auth.getUser(accessToken);
    if (userErr || !userData?.user?.id) {
      console.log("create-household: invalid token", userErr?.message);
      return json(401, { error: "Not authenticated" });
    }
    const userId = userData.user.id;

    // 2. SAFETY: if this user already belongs to a household, return it instead
    //    of creating a second one. Makes the call idempotent.
    const { data: existing, error: existErr } = await admin
      .from("shopping_household_members")
      .select("household_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (existErr) {
      console.error("create-household: membership lookup failed", existErr.message);
      return json(500, { error: "Lookup failed" });
    }
    if (existing?.household_id) {
      console.log(`create-household: user already in household ${existing.household_id}`);
      return json(200, { household_id: existing.household_id, created: false });
    }

    // 3. Create the new household.
    const name = (body.familyName ?? "").trim() || "My Family";
    const { data: household, error: hhErr } = await admin
      .from("shopping_households")
      .insert({ name })
      .select("id")
      .single();

    if (hhErr || !household?.id) {
      console.error("create-household: household insert failed", hhErr?.message);
      return json(500, { error: "Could not create household" });
    }
    const householdId = household.id;

    // 4. Link the caller to the new household as its first member.
    const { error: linkErr } = await admin
      .from("shopping_household_members")
      .insert({ user_id: userId, household_id: householdId });

    if (linkErr) {
      console.error("create-household: member link failed", linkErr.message);
      // Best-effort cleanup so we don't leave an orphan household behind.
      await admin.from("shopping_households").delete().eq("id", householdId);
      return json(500, { error: "Could not link user to household" });
    }

    // 5. Return the new household id.
    console.log(`create-household: created household ${householdId} for user ${userId}`);
    return json(200, { household_id: householdId, created: true });
  } catch (e) {
    console.error("create-household: unexpected", e instanceof Error ? e.message : e);
    return json(500, { error: "Unexpected error" });
  }
});
