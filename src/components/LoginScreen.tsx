import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

type Mode = "login" | "signup";

export function LoginScreen() {
  const { signIn } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setStatus(null);
    setPassword("");
  };

  const onLogin = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await signIn(email.trim(), password);
    if (error) setError(error);
    setSubmitting(false);
  };

  const friendlySignupError = (msg: string): string => {
    const m = msg.toLowerCase();
    if (m.includes("already registered") || m.includes("already been registered") || m.includes("user already"))
      return "That email is already registered. Try logging in instead.";
    if (m.includes("password") && (m.includes("short") || m.includes("6") || m.includes("weak") || m.includes("characters")))
      return "Please use a password of at least 6 characters.";
    if (m.includes("invalid") && m.includes("email")) return "That doesn't look like a valid email address.";
    return msg;
  };

  const onSignup = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanEmail = email.trim();
    if (!cleanEmail) return setError("Please enter your email.");
    if (password.length < 6) return setError("Please use a password of at least 6 characters.");

    setSubmitting(true);
    try {
      setStatus("Creating your account…");
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
      });
      if (signUpErr) {
        setError(friendlySignupError(signUpErr.message));
        setStatus(null);
        setSubmitting(false);
        return;
      }

      // Ensure session (email confirmation is off, so signUp should sign us in).
      let session = signUpData.session;
      if (!session) {
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (signInErr || !signInData.session) {
          setError("Account created, but we couldn't sign you in. Please try logging in.");
          setStatus(null);
          setSubmitting(false);
          return;
        }
        session = signInData.session;
      }

      setStatus("Setting up your family…");
      const { data: hhData, error: hhErr } = await supabase.functions.invoke("create-household", {
        body: { familyName: "My Family" },
      });
      if (hhErr || !hhData?.household_id) {
        setError(
          "We couldn't finish setting things up. Tap 'Create account' again to retry.",
        );
        setStatus(null);
        setSubmitting(false);
        return;
      }

      // Fresh reload lands the user cleanly in member setup with correct household state.
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setStatus(null);
      setSubmitting(false);
    }
  };

  const isSignup = mode === "signup";

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
          <p className="mt-2 text-[15px]" style={{ color: "var(--clay-muted)" }}>
            {isSignup ? "Create your account to get started" : "Sign in to continue"}
          </p>
        </div>

        <div
          className="rounded-[14px] bg-white p-5"
          style={{ border: "1px solid var(--clay-border)" }}
        >
          <form onSubmit={isSignup ? onSignup : onLogin} className="space-y-3.5">
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
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="clay-input pr-16"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-semibold uppercase tracking-[0.08em]"
                  style={{ color: "var(--clay-muted)" }}
                  tabIndex={-1}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              {isSignup && (
                <p className="mt-1.5 text-[12px]" style={{ color: "var(--clay-muted)" }}>
                  At least 6 characters.
                </p>
              )}
            </Field>
            {error && (
              <p className="text-sm" style={{ color: "#B4441F" }}>
                {error}
              </p>
            )}
            {submitting && status && (
              <p className="text-sm" style={{ color: "var(--clay-muted)" }}>
                {status}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="clay-btn-primary mt-1"
            >
              {submitting
                ? isSignup
                  ? "Creating account…"
                  : "Signing in…"
                : isSignup
                ? "Create account"
                : "Sign in"}
            </button>
          </form>
        </div>

        <div className="mt-5 text-center text-[14px]" style={{ color: "var(--clay-muted)" }}>
          {isSignup ? (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => switchMode("login")}
                className="font-semibold"
                style={{ color: "var(--clay-accent)" }}
              >
                Log in
              </button>
            </>
          ) : (
            <>
              New here?{" "}
              <button
                type="button"
                onClick={() => switchMode("signup")}
                className="font-semibold"
                style={{ color: "var(--clay-accent)" }}
              >
                Create an account
              </button>
            </>
          )}
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
        className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.08em]"
        style={{ color: "var(--clay-muted)" }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
