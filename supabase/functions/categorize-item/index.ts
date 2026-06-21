// Edge Function: categorize-item
// Classifies a shopping item into one of the fixed categories using Claude.
// Reads ANTHROPIC_API_KEY from Supabase secrets.

const ALLOWED = [
  "produce",
  "bakery",
  "deli",
  "meat",
  "dairy",
  "frozen",
  "pantry",
  "household",
  "lollies_chocolate",
  "misc",
] as const;


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text } = await req.json();
    const input = typeof text === "string" ? text.trim() : "";
    if (!input) {
      return Response.json(
        { category: "misc" },
        { headers: corsHeaders },
      );
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return Response.json(
        { category: "misc", error: "missing_api_key" },
        { headers: corsHeaders },
      );
    }

    const prompt = `Classify this shopping list item into exactly one of these categories: produce, bakery, deli, meat, dairy, frozen, pantry, household, lollies_chocolate, misc.

Route confectionery — chocolate, lollies, sweets, candy, gum, gummies, marshmallows, etc. — to lollies_chocolate.

Item: "${input}"

Respond with ONLY the single category word, lowercase, no punctuation, no explanation. If you are genuinely unsure, respond with: misc`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 10,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      return Response.json(
        { category: "misc", error: `claude_${res.status}` },
        { headers: corsHeaders },
      );
    }

    const data = await res.json();
    const raw: string = data?.content?.[0]?.text ?? "";
    const guess = raw.trim().toLowerCase().replace(/[^a-z]/g, "");
    const category = (ALLOWED as readonly string[]).includes(guess)
      ? guess
      : "misc";

    return Response.json({ category }, { headers: corsHeaders });
  } catch (e) {
    return Response.json(
      { category: "misc", error: String(e) },
      { headers: corsHeaders },
    );
  }
});
