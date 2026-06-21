// Edge Function: categorize-item
// Single or batch classification of shopping items via Claude.
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
type Category = (typeof ALLOWED)[number];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const isCat = (s: string): s is Category =>
  (ALLOWED as readonly string[]).includes(s);

const titleCaseFallback = (s: string) =>
  s.trim().replace(/\s+/g, " ").replace(/^\w/, (c) => c.toUpperCase());

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");

    // ---- BATCH MODE ----
    if (Array.isArray(body?.items)) {
      const rawItems: string[] = body.items
        .map((s: unknown) => (typeof s === "string" ? s.trim() : ""))
        .filter((s: string) => s.length > 0);

      if (rawItems.length === 0) {
        return Response.json({ results: [] }, { headers: corsHeaders });
      }

      const fallback = rawItems.map((t) => ({
        display_name: titleCaseFallback(t),
        category: "misc" as Category,
      }));

      if (!apiKey) {
        return Response.json(
          { results: fallback, error: "missing_api_key" },
          { headers: corsHeaders },
        );
      }

      const numbered = rawItems
        .map((t, i) => `${i + 1}. ${t}`)
        .join("\n");

      const prompt = `You will clean up and classify a list of shopping items.

For each item:
- "display_name": fix obvious spelling, punctuation and capitalisation only. Do NOT reword, expand, translate, pluralise or add detail. Keep the user's wording.
- "category": one of exactly: produce, bakery, deli, meat, dairy, frozen, pantry, household, lollies_chocolate, misc. Route confectionery (chocolate, lollies, sweets, candy, gum, gummies, marshmallows, etc.) to lollies_chocolate. If genuinely unsure, use "misc".

Items (in order):
${numbered}

Respond with ONLY a JSON array of length ${rawItems.length}, each element {"display_name": string, "category": string}, in the same order as the input. No prose, no markdown fences.`;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5",
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!res.ok) {
        return Response.json(
          { results: fallback, error: `claude_${res.status}` },
          { headers: corsHeaders },
        );
      }

      const data = await res.json();
      const raw: string = data?.content?.[0]?.text ?? "";
      let parsed: Array<{ display_name?: unknown; category?: unknown }> = [];
      try {
        const match = raw.match(/\[[\s\S]*\]/);
        parsed = JSON.parse(match ? match[0] : raw);
      } catch {
        return Response.json(
          { results: fallback, error: "parse_failed" },
          { headers: corsHeaders },
        );
      }

      const results = rawItems.map((orig, i) => {
        const row = parsed[i] ?? {};
        const name =
          typeof row.display_name === "string" && row.display_name.trim()
            ? row.display_name.trim()
            : titleCaseFallback(orig);
        const catRaw =
          typeof row.category === "string"
            ? row.category.trim().toLowerCase().replace(/[^a-z_]/g, "")
            : "";
        const category: Category = isCat(catRaw) ? catRaw : "misc";
        return { display_name: name, category };
      });

      return Response.json({ results }, { headers: corsHeaders });
    }

    // ---- SINGLE MODE (unchanged contract) ----
    const input =
      typeof body?.text === "string" ? body.text.trim() : "";
    if (!input) {
      return Response.json({ category: "misc" }, { headers: corsHeaders });
    }
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
    const guess = raw.trim().toLowerCase().replace(/[^a-z_]/g, "");
    const category = isCat(guess) ? guess : "misc";
    return Response.json({ category }, { headers: corsHeaders });
  } catch (e) {
    return Response.json(
      { category: "misc", error: String(e) },
      { headers: corsHeaders },
    );
  }
});
