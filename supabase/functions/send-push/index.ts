// Edge Function: send-push
// Sends Web Push notifications using VAPID to subscriptions stored in
// shopping_push_subscriptions. Invalid (404/410) subscriptions are removed.

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SubRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface Body {
  title?: string;
  body?: string;
  target?: { user_id?: string; household_id?: string };
  exclude_endpoint?: string;
  subscriptions?: SubRow[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const rawPub = Deno.env.get("VAPID_PUBLIC_KEY");
    const rawPriv = Deno.env.get("VAPID_PRIVATE_KEY");
    const rawSubject = Deno.env.get("VAPID_SUBJECT");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!rawPub || !rawPriv || !rawSubject) {
      throw new Error("Missing VAPID secrets");
    }
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      throw new Error("Missing Supabase service env");
    }

    // Normalise to URL-safe base64 without padding (what web-push/VAPID requires)
    const toUrlSafeB64 = (s: string) =>
      s.trim().replace(/\s+/g, "").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    const VAPID_PUBLIC_KEY = toUrlSafeB64(rawPub);
    const VAPID_PRIVATE_KEY = toUrlSafeB64(rawPriv);
    let VAPID_SUBJECT = rawSubject.trim();
    if (!/^mailto:|^https?:\/\//i.test(VAPID_SUBJECT)) {
      VAPID_SUBJECT = `mailto:${VAPID_SUBJECT}`;
    }
    console.log(
      `send-push: vapid pub len=${VAPID_PUBLIC_KEY.length} priv len=${VAPID_PRIVATE_KEY.length} subject=${VAPID_SUBJECT}`,
    );

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const payload = (await req.json()) as Body;
    const title = payload.title ?? "Our Pantry";
    const body = payload.body ?? "You have a new update.";

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    let subs: SubRow[] = [];
    if (payload.subscriptions && payload.subscriptions.length > 0) {
      subs = payload.subscriptions;
    } else if (payload.target?.user_id) {
      const { data, error } = await supabase
        .from("shopping_push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .eq("user_id", payload.target.user_id);
      if (error) throw new Error(`Query failed: ${error.message}`);
      subs = (data ?? []) as SubRow[];
    } else if (payload.target?.household_id) {
      const { data, error } = await supabase
        .from("shopping_push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .eq("household_id", payload.target.household_id);
      if (error) throw new Error(`Query failed: ${error.message}`);
      subs = (data ?? []) as SubRow[];
    } else {
      throw new Error("Provide target.user_id, target.household_id, or subscriptions[]");
    }

    console.log(`send-push: found ${subs.length} subscription(s)`);

    const notificationPayload = JSON.stringify({ title, body });
    let sent = 0;
    let removed = 0;
    let failed = 0;

    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: s.endpoint,
              keys: { p256dh: s.p256dh, auth: s.auth },
            },
            notificationPayload,
          );
          sent++;
          console.log(`send-push: sent to ${s.endpoint.slice(0, 60)}...`);
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          console.log(
            `send-push: error status=${status} for ${s.endpoint.slice(0, 60)}: ${
              (err as Error).message
            }`,
          );
          if (status === 404 || status === 410) {
            const { error: delErr } = await supabase
              .from("shopping_push_subscriptions")
              .delete()
              .eq("id", s.id);
            if (delErr) console.log(`send-push: delete failed: ${delErr.message}`);
            else removed++;
          } else {
            failed++;
          }
        }
      }),
    );

    const summary = { found: subs.length, sent, removed, failed };
    console.log(`send-push: summary ${JSON.stringify(summary)}`);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`send-push: fatal ${msg}`);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
