import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";

export function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await signIn(email.trim(), password);
    if (error) setError(error);
    setSubmitting(false);
  };

  return (
    <div
      className="flex min-h-[100dvh] items-center justify-center px-5"
      style={{ background: "var(--clay-bg)" }}
    >
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1
            className="text-[40px] leading-none"
            style={{ fontFamily: "Fraunces, serif", color: "var(--clay-ink)" }}
          >
            Our Pantry
          </h1>
          <p className="mt-2 text-[13px]" style={{ color: "var(--clay-muted)" }}>
            Sign in to continue
          </p>
        </div>
        <form
          onSubmit={onSubmit}
          className="rounded-[14px] bg-white p-5 space-y-3"
          style={{ border: "1px solid var(--clay-border)" }}
        >
          <Field label="Email">
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-[10px] bg-white px-3.5 py-3 text-[16px] outline-none"
              style={{ border: "1px solid var(--clay-border)", color: "var(--clay-ink)" }}
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-[10px] bg-white px-3.5 py-3 text-[16px] outline-none"
              style={{ border: "1px solid var(--clay-border)", color: "var(--clay-ink)" }}
            />
          </Field>
          {error && (
            <p className="text-sm" style={{ color: "#B0452A" }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="mt-1 w-full rounded-[12px] py-3 text-[15px] font-semibold text-white transition active:scale-[0.99] disabled:opacity-60"
            style={{ background: "var(--clay-accent)" }}
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span
        className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em]"
        style={{ color: "var(--clay-muted)" }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
