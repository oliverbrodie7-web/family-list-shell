// Our Pantry to Woolies — popup logic.
// ADD ONLY: the single network call this extension ever makes is one POST to
// /api/v3/ui/trolley/update, run inside the Woolworths page itself. It never
// removes trolley items, never checks out, and never touches payment/delivery.
// No analytics, no telemetry, no other requests.

const tabWarning = document.getElementById("tab-warning");
const pasteBox = document.getElementById("paste-box");
const pasteHint = document.getElementById("paste-hint");
const parseError = document.getElementById("parse-error");
const skipNote = document.getElementById("skip-note");
const itemsCard = document.getElementById("items-card");
const itemList = document.getElementById("item-list");
const toggleAllBtn = document.getElementById("toggle-all");
const fillBtn = document.getElementById("fill-btn");
const resultEl = document.getElementById("result");

let wooliesTabId = null; // set only when the active tab is www.woolworths.com.au
let entries = []; // [{ stockcode:number, quantity:number, name:string, checked:boolean }]
let working = false;

// ---------- 1. Active tab check ----------
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs && tabs[0];
  let onWoolies = false;
  // Without the "tabs" permission, tab.url is only readable for hosts we hold
  // host_permissions for — so a readable matching URL is exactly the check.
  if (tab && typeof tab.url === "string") {
    try {
      onWoolies = new URL(tab.url).hostname === "www.woolworths.com.au";
    } catch {
      onWoolies = false;
    }
  }
  if (onWoolies) {
    wooliesTabId = tab.id;
  } else {
    tabWarning.hidden = false;
  }
  refreshFillButton();
});

// ---------- 2 + 3. Parse and validate on input ----------
pasteBox.addEventListener("input", () => {
  const raw = pasteBox.value.trim();
  entries = [];
  parseError.hidden = true;
  skipNote.hidden = true;
  resultEl.hidden = true;
  pasteHint.hidden = raw !== "";

  if (raw === "") {
    renderItems();
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    showParseError("That does not look like an Our Pantry list.");
    renderItems();
    return;
  }
  if (!Array.isArray(parsed)) {
    showParseError("That does not look like an Our Pantry list.");
    renderItems();
    return;
  }
  if (parsed.length === 0) {
    showParseError("That list is empty.");
    renderItems();
    return;
  }

  // Validate entries; combine duplicate stockcodes (sum quantities) so the
  // trolley call never receives the same stockcode twice.
  const byStockcode = new Map();
  let skipped = 0;
  for (const e of parsed) {
    const stockcode = Number(e && e.stockcode);
    if (!Number.isFinite(stockcode) || stockcode <= 0) {
      skipped++;
      continue;
    }
    let quantity = Number(e && e.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) quantity = 1;
    const name =
      e && typeof e.name === "string" && e.name.trim()
        ? e.name.trim()
        : `Item ${stockcode}`;
    const existing = byStockcode.get(stockcode);
    if (existing) {
      existing.quantity += quantity;
    } else {
      byStockcode.set(stockcode, { stockcode, quantity, name, checked: true });
    }
  }
  entries = [...byStockcode.values()];

  if (skipped > 0) {
    skipNote.textContent = `Skipped ${skipped} ${
      skipped === 1 ? "entry" : "entries"
    } without a usable product code.`;
    skipNote.hidden = false;
  }
  if (entries.length === 0 && skipped > 0) {
    showParseError("None of those entries had a usable product code.");
  }

  renderItems();
});

function showParseError(msg) {
  parseError.textContent = msg;
  parseError.hidden = false;
}

// ---------- 4 + 5. Review list ----------
function renderItems() {
  itemList.textContent = "";
  itemsCard.hidden = entries.length === 0;

  for (const entry of entries) {
    const li = document.createElement("li");
    const label = document.createElement("label");

    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = entry.checked;
    box.addEventListener("change", () => {
      entry.checked = box.checked;
      refreshFillButton();
      refreshToggleAll();
    });

    const nameSpan = document.createElement("span");
    nameSpan.className = "item-name";
    nameSpan.textContent = entry.name;
    nameSpan.title = entry.name;

    label.appendChild(box);
    label.appendChild(nameSpan);

    if (entry.quantity > 1) {
      const qty = document.createElement("span");
      qty.className = "item-qty";
      qty.textContent = `×${entry.quantity}`;
      label.appendChild(qty);
    }

    li.appendChild(label);
    itemList.appendChild(li);
  }

  refreshFillButton();
  refreshToggleAll();
}

toggleAllBtn.addEventListener("click", () => {
  const anyUnchecked = entries.some((e) => !e.checked);
  for (const e of entries) e.checked = anyUnchecked;
  renderItems();
});

function refreshToggleAll() {
  const anyUnchecked = entries.some((e) => !e.checked);
  toggleAllBtn.textContent = anyUnchecked ? "Select all" : "Deselect all";
}

function refreshFillButton() {
  const ticked = entries.filter((e) => e.checked).length;
  fillBtn.textContent =
    ticked > 0
      ? `Add ${ticked} ${ticked === 1 ? "item" : "items"} to trolley`
      : "Add to trolley";
  fillBtn.disabled = working || ticked === 0 || wooliesTabId == null;
}

// ---------- 6. Fill the trolley ----------
// Injected into the Woolworths page's MAIN world, so the POST runs in the
// page's own JavaScript context (session cookies + Akamai both satisfied),
// exactly as if typed into DevTools on that page. Must never throw uncaught,
// and must return only JSON-serialisable data.
async function postTrolleyUpdate(items) {
  try {
    const res = await fetch("/api/v3/ui/trolley/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ items }),
    });
    const status = res.status;
    const contentType = res.headers.get("content-type") || "";
    let data = null;
    let textSnippet = "";
    try {
      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        textSnippet = text.slice(0, 300);
      }
    } catch {
      /* unreadable body — report status alone */
    }
    return { reached: true, status, data, textSnippet };
  } catch (e) {
    return {
      reached: false,
      status: 0,
      error: e && e.message ? String(e.message) : "network error",
    };
  }
}

fillBtn.addEventListener("click", async () => {
  if (working || wooliesTabId == null) return;
  const ticked = entries.filter((e) => e.checked);
  if (ticked.length === 0) return;

  // ONE request for the whole shop; name is display-only and is dropped here.
  const items = ticked.map((e) => ({
    stockcode: e.stockcode,
    quantity: e.quantity,
  }));

  working = true;
  fillBtn.textContent = "Adding to trolley…";
  fillBtn.disabled = true;
  resultEl.hidden = true;

  let outcome = null;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: wooliesTabId },
      world: "MAIN",
      func: postTrolleyUpdate,
      args: [items],
    });
    outcome = results && results[0] ? results[0].result : null;
  } catch (e) {
    outcome = null;
  }

  working = false;
  showResult(outcome, items.length);
  refreshFillButton();
});

// ---------- 7. Honest reporting ----------
function showResult(outcome, sentCount) {
  let msg;

  if (!outcome || outcome.reached === false) {
    msg = "The request did not reach Woolworths. Check your connection and try again.";
  } else if (
    outcome.status === 401 ||
    outcome.status === 403 ||
    (outcome.textSnippet && /sign in|log ?in/i.test(outcome.textSnippet))
  ) {
    msg = "You are not signed in to Woolworths. Sign in and try again.";
  } else if (outcome.status >= 200 && outcome.status < 300) {
    const updated =
      outcome.data && Array.isArray(outcome.data.UpdatedItems)
        ? outcome.data.UpdatedItems.length
        : null;
    if (updated == null) {
      msg = `Woolworths replied (HTTP ${outcome.status}) but the response was unexpected. Check your trolley to see what was added.`;
    } else if (updated >= sentCount) {
      msg = `Added ${sentCount} ${sentCount === 1 ? "item" : "items"} to your trolley.`;
    } else {
      const missing = sentCount - updated;
      msg = `Added ${updated} of ${sentCount}. ${missing} ${
        missing === 1 ? "item" : "items"
      } could not be added (they may be out of stock or discontinued).`;
    }
  } else {
    const serverMsg =
      (outcome.data && outcome.data.Message) ||
      outcome.textSnippet ||
      "no message from Woolworths";
    msg = `Woolworths returned HTTP ${outcome.status}: ${serverMsg}`;
  }

  resultEl.textContent = msg;
  resultEl.hidden = false;
}
