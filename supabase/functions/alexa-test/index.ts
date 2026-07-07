// Edge Function: alexa-test
// Bare-bones "hello world" pipe test proving an Amazon Alexa skill can reach our
// Supabase backend. It accepts Alexa's POST skill-request JSON, logs the body so
// we can see what Alexa actually sent (Supabase → Functions → alexa-test → Logs),
// and returns a valid Alexa response that makes Alexa SPEAK a confirmation.
//
// This is NOT the real add-item logic — just a connectivity test.
//
// IMPORTANT: Alexa does NOT send a Supabase JWT, so this function must be
// deployed with JWT verification DISABLED. That is configured (per-function,
// without affecting any other function) in supabase/config.toml:
//   [functions.alexa-test]
//   verify_jwt = false

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // Preflight (Alexa calls server-to-server and won't send this, but harmless).
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Log whatever Alexa sent, so it's visible in the Supabase function logs.
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  console.log("alexa-test: incoming request body:", JSON.stringify(body));

  const requestType =
    (body as { request?: { type?: string } } | null)?.request?.type ?? "unknown";
  console.log(`alexa-test: request.type = ${requestType}`);

  // Valid Alexa response that makes Alexa speak the confirmation.
  const alexaResponse = {
    version: "1.0",
    response: {
      outputSpeech: {
        type: "PlainText",
        text: "Great news. Our Pantry is connected.",
      },
      shouldEndSession: true,
    },
  };

  return new Response(JSON.stringify(alexaResponse), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
