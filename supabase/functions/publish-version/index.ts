// Edge Function: publish-version
// Records a "what's new" note into shopping_app_versions exactly once per version.
// The app calls this on load with the version baked into its code; the first call
// for a given version inserts the note, and every later call is a no-op. Uses the
// service-role key because RLS only allows normal users to SELECT this table, not
// INSERT. Idempotent by version, and race-safe when a UNIQUE(version) constraint
// exists (a duplicate-key insert is treated as "already recorded").
//
// Alexa-style public endpoint: the app may call this before/around auth, so it is
// deployed WITHOUT JWT verification (supabase/config.toml: verify_jwt = false).
// It is harmless — it only inserts a predefined, app-supplied release note.

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
      console.error("publish-version: missing env");
      return json(500, { error: "Server not configured" });
    }

    const body = (await req.json().catch(() => ({}))) as {
      version?: string;
      title?: string;
      notes?: string;
    };
    const version = typeof body.version === "string" ? body.version.trim() : "";
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    const title =
      typeof body.title === "string" && body.title.trim() !== ""
        ? body.title.trim()
        : null;

    if (!version || !notes) {
      return json(400, { error: "Missing version or notes" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Already recorded? → no-op.
    const { data: existing, error: selErr } = await admin
      .from("shopping_app_versions")
      .select("id")
      .eq("version", version)
      .limit(1)
      .maybeSingle();

    if (selErr) {
      console.error("publish-version: select failed", selErr.message);
      return json(500, { error: "Lookup failed" });
    }
    if (existing) {
      console.log(`publish-version: version ${version} already recorded`);
      return json(200, { created: false });
    }

    // 2. Insert the note. If two devices race, a UNIQUE(version) constraint makes
    //    the loser fail with 23505 — which we treat as "already recorded".
    const { error: insErr } = await admin
      .from("shopping_app_versions")
      .insert({ version, title, notes });

    if (insErr) {
      if ((insErr as { code?: string }).code === "23505") {
        console.log(`publish-version: version ${version} inserted by a concurrent call`);
        return json(200, { created: false });
      }
      console.error("publish-version: insert failed", insErr.message);
      return json(500, { error: "Could not record version" });
    }

    console.log(`publish-version: recorded version ${version}`);
    return json(200, { created: true });
  } catch (e) {
    console.error("publish-version: unexpected", e instanceof Error ? e.message : e);
    return json(500, { error: "Unexpected error" });
  }
});
