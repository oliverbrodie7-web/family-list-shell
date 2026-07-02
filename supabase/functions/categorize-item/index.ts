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
  "toiletries",
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

const extractJsonArray = (text: string) => {
  const withoutFences = text
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = withoutFences.indexOf("[");
  const end = withoutFences.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  return withoutFences
    .slice(start, end + 1)
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim();
};

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

Return ONLY a raw JSON array. Do not include any preamble, explanation, markdown, code fences, or text outside the array.

Every array element must be an object with exactly these keys:
- "clean_name": fix spelling, punctuation and capitalisation only. Do NOT reword, expand, translate, pluralise, add detail, or change quantities. Keep the user's wording.
- "category": exactly one of "produce", "bakery", "deli", "meat", "dairy", "frozen", "pantry", "household", "toiletries", "lollies_chocolate", "misc".

The array must contain exactly ${rawItems.length} objects and preserve the input order.

Route confectionery (chocolate, lollies, sweets, candy, gum, gummies, marshmallows, etc.) to "lollies_chocolate".
Route personal-care / bathroom items used on the body (shampoo, conditioner, soap, body wash, hand soap, shower gel, toothpaste, toothbrush, floss, mouthwash, deodorant, razors, shaving cream, moisturiser, sunscreen, cotton buds, sanitary/period products, tampons, pads, nappies) to "toiletries".
Cleaning and home supplies (dishwashing liquid, laundry powder/detergent, bin bags, paper towel, cling wrap, sponges, surface spray, toilet paper) stay in "household" — do NOT put those in toiletries.
If genuinely unsure, use "misc".

Input items (in order):
${numbered}

Exact output format example:
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
          system:
            "You return only valid JSON. Never wrap JSON in markdown fences or add prose.",
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
      const jsonText = extractJsonArray(raw);

      console.log(
        `[categorize-item][batch][diag] items=${rawItems.length} stop_reason=${String(data?.stop_reason ?? "n/a")} usage=${JSON.stringify(data?.usage ?? null)} raw_len=${raw.length} extraction_ok=${jsonText !== null} raw=${JSON.stringify(raw)}`,
      );

      if (!jsonText) {
        return Response.json(
          { results: fallback, error: "parse_failed" },
          { headers: corsHeaders },
        );
      }

      let parsed: Array<{
        clean_name?: unknown;
        display_name?: unknown;
        category?: unknown;
      }> = [];
      try {
        const p = JSON.parse(jsonText);
        if (Array.isArray(p)) parsed = p;
      } catch (parseErr) {
        console.log(
          `[categorize-item][batch][diag] parse_error=${parseErr instanceof Error ? parseErr.message : String(parseErr)} text=${JSON.stringify(jsonText)}`,
        );
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

    // ---- SINGLE MODE ----
    const input =
      typeof body?.text === "string" ? body.text.trim() : "";
    if (!input) {
      return Response.json(
        { display_name: "", category: "misc" },
        { headers: corsHeaders },
      );
    }
    const fallbackName = titleCaseFallback(input);
    if (!apiKey) {
      return Response.json(
        { display_name: fallbackName, category: "misc", error: "missing_api_key" },
        { headers: corsHeaders },
      );
    }

    const prompt = `You clean up and classify a single shopping list item.

Return ONLY a raw JSON object. No preamble, no explanation, no markdown, no code fences.

The object must have exactly these keys:
- "clean_name": fix spelling, punctuation and capitalisation only. Do NOT reword, expand, translate, pluralise, add detail, or change quantities. Correct obvious misspellings. Only leave wording unchanged if it is a brand name or clearly deliberate.
- "category": exactly one of "produce", "bakery", "deli", "meat", "dairy", "frozen", "pantry", "household", "lollies_chocolate", "misc".

Route confectionery (chocolate, lollies, sweets, candy, gum, gummies, marshmallows, etc.) to "lollies_chocolate". If genuinely unsure about category, use "misc".

Item: "${input}"

Exact output format example (shows a typo being corrected):
{"clean_name":"Bananas","category":"produce"}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 200,
        system:
          "You return only valid JSON. Never wrap JSON in markdown fences or add prose.",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      return Response.json(
        { display_name: fallbackName, category: "misc", error: `claude_${res.status}` },
        { headers: corsHeaders },
      );
    }

    const data = await res.json();
    const raw: string = data?.content?.[0]?.text ?? "";

    // Extract JSON object
    const stripped = raw.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    let parsed: { clean_name?: unknown; category?: unknown } | null = null;
    if (start !== -1 && end > start) {
      try {
        parsed = JSON.parse(stripped.slice(start, end + 1));
      } catch {
        parsed = null;
      }
    }

    const nameRaw =
      parsed && typeof parsed.clean_name === "string" ? parsed.clean_name.trim() : "";
    const display_name = nameRaw || fallbackName;
    const catRaw =
      parsed && typeof parsed.category === "string"
        ? parsed.category.trim().toLowerCase().replace(/[^a-z_]/g, "")
        : "";
    const category: Category = isCat(catRaw) ? catRaw : "misc";

    return Response.json({ display_name, category }, { headers: corsHeaders });
  } catch (e) {
    return Response.json(
      { category: "misc", error: String(e) },
      { headers: corsHeaders },
    );
  }
});
