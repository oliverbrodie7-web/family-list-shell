// Tracks how often each item is added on this device.
// Best-effort only — never throw, never block the add.

const KEY = "our-pantry:regulars:v1";

export type RegularsMap = Record<string, { name: string; count: number; last: number }>;

export function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function readRegulars(): RegularsMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as RegularsMap) : {};
  } catch {
    return {};
  }
}

export function bumpRegular(displayName: string): void {
  try {
    const key = normalizeName(displayName);
    if (!key) return;
    const map = readRegulars();
    const prev = map[key];
    map[key] = {
      name: prev?.name ?? displayName.trim(),
      count: (prev?.count ?? 0) + 1,
      last: Date.now(),
    };
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function topRegulars(n = 8): { name: string; count: number }[] {
  try {
    const map = readRegulars();
    return Object.values(map)
      .sort((a, b) => b.count - a.count || b.last - a.last)
      .slice(0, n)
      .map(({ name, count }) => ({ name, count }));
  } catch {
    return [];
  }
}
