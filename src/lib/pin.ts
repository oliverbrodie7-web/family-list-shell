// PIN hashing using Web Crypto (SHA-256 + random salt).
// Stored format: "sha256$<saltHex>$<hashHex>"

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

async function sha256(saltBytes: Uint8Array, pin: string): Promise<string> {
  const pinBytes = new TextEncoder().encode(pin);
  const combined = new Uint8Array(saltBytes.length + pinBytes.length);
  combined.set(saltBytes, 0);
  combined.set(pinBytes, saltBytes.length);
  const digest = await crypto.subtle.digest("SHA-256", combined);
  return toHex(digest);
}

export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await sha256(salt, pin);
  return `sha256$${toHex(salt.buffer)}$${hash}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "sha256") return false;
  const saltBytes = fromHex(parts[1]);
  const hash = await sha256(saltBytes, pin);
  // constant-time-ish compare
  if (hash.length !== parts[2].length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ parts[2].charCodeAt(i);
  return diff === 0;
}
