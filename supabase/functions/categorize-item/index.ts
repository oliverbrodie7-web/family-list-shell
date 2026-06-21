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

      const prompt = `You clean up and classify shopping list items.

For each input item, return an object with:
- "clean_name": fix spelling, punctuation and capitalisation only. Do NOT reword, expand, translate, pluralise, add detail, or change quantities. Keep the user's wording.
- "category": exactly one of: produce, bakery, deli, meat, dairy, frozen, pantry, household, lollies_chocolate, misc. Route confectionery (chocolate, lollies, sweets, candy, gum, gummies, marshmallows, etc.) to lollies_chocolate. If genuinely unsure, use "misc".

Input items (in order):
${numbered}

Return ONLY a raw JSON array of length ${rawItems.length}, in the same order as the input. No preamble, no explanation, no markdown code fences.

Example for input:
1. milk
2. chocloate
3. apple

Exact expected output:
[{"clean_name":"Milk","category":"dairy"},{"clean_name":"Chocolate","category":"lollies_chocolate"},{"clean_name":"Apple","category":"produce"}]`;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5",
          max_tokens: 2048,
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

      // Strip code fences and extract the JSON array substring.
      const stripped = raw
        .replace(/^\s*```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .trim();
      const start = stripped.indexOf("[");
      const end = stripped.lastIndexOf("]");
      const jsonText =
        start !== -1 && end !== -1 && end > start
          ? stripped.slice(start, end + 1)
          : stripped;

      let parsed: Array<{
        clean_name?: unknown;
        display_name?: unknown;
        category?: unknown;
      }> = [];
      try {
        const p = JSON.parse(jsonText);
        if (Array.isArray(p)) parsed = p;
      } catch {
        return Response.json(
          { results: fallback, error: "parse_failed" },
          { headers: corsHeaders },
        );
      }

      // Per-item fallback: only the bad row degrades, not the whole batch.
      const results = rawItems.map((orig, i) => {
        const row = parsed[i];
        if (!row || typeof row !== "object") {
          return {
            display_name: titleCaseFallback(orig),
            category: "misc" as Category,
          };
        }
        const nameRaw =
          typeof row.clean_name === "string"
            ? row.clean_name
            : typeof row.display_name === "string"
              ? row.display_name
              : "";
        const name = nameRaw.trim() || titleCaseFallback(orig);
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
