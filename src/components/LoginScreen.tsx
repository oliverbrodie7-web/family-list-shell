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
      className="flex min-h-[100dvh] items-center justify-center px-6"
      style={{ background: "var(--clay-bg)" }}
    >
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1
            className="font-display text-[40px] leading-none"
            style={{ color: "var(--clay-ink)", letterSpacing: "-0.015em" }}
          >
            Our Pantry
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--clay-muted)" }}>
            Sign in to continue
          </p>
        </div>

        <div
          className="rounded-[14px] bg-white p-5"
          style={{ border: "1px solid var(--clay-border)" }}
        >
          <form onSubmit={onSubmit} className="space-y-3.5">
            <Field label="Email">
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="clay-input"
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="clay-input"
              />
            </Field>
            {error && (
              <p className="text-sm" style={{ color: "#B4441F" }}>
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="clay-btn-primary mt-1"
            >
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em]"
        style={{ color: "var(--clay-muted)" }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
