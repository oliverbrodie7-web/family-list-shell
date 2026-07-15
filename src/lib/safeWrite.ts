// Connection-aware write wrapper for Supabase mutations/reads.
//
// - Fast path: if the browser reports offline, DO NOT attempt the write — fail
//   immediately (no waiting on a timeout).
// - Otherwise attempt it. navigator.onLine only reports a network interface, not
//   working internet, so a returned error OR a thrown error is treated EXACTLY
//   like being offline: { ok: false }.
//
// Callers use { ok } to roll back optimistic state and notify, and read `data`
// on success (for inserts that .select()).
export async function safeWrite(
  op: () => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<{ ok: boolean; data: unknown }> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { ok: false, data: null };
  }
  try {
    const { data, error } = await op();
    if (error) return { ok: false, data: null };
    return { ok: true, data };
  } catch {
    return { ok: false, data: null };
  }
}
