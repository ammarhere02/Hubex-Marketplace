"use client";

// Shared login/register form in AdminLTE auth-page style (icon input groups).
// Posts JSON to the auth API and does a full refresh on success so the
// server-rendered header picks up the new session.
import { useRouter } from "next/navigation";
import { useState } from "react";

type Mode = "login" | "register";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    const body: Record<string, string> = {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    };
    if (mode === "register") body.name = String(form.get("name") ?? "");
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Something went wrong. Please try again.");
        return;
      }
      // Return to where the visitor was sent from (e.g. /admin/queues), but only
      // accept a same-site path — never an absolute URL — to avoid open redirects.
      const next = new URLSearchParams(window.location.search).get("next");
      if (next && next.startsWith("/") && !next.startsWith("//")) {
        window.location.assign(next);
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {error && <div className="alert alert-danger py-2">{error}</div>}
      {mode === "register" && (
        <div className="input-group mb-3">
          <input name="name" className="form-control" placeholder="Full name" aria-label="Full name" required maxLength={255} />
          <div className="input-group-append">
            <div className="input-group-text">
              <span className="fas fa-user" />
            </div>
          </div>
        </div>
      )}
      <div className="input-group mb-3">
        <input name="email" type="email" className="form-control" placeholder="Email" aria-label="Email" required maxLength={255} />
        <div className="input-group-append">
          <div className="input-group-text">
            <span className="fas fa-envelope" />
          </div>
        </div>
      </div>
      <div className="input-group mb-3">
        <input
          name="password"
          type="password"
          className="form-control"
          placeholder={mode === "register" ? "Password (min 8 characters)" : "Password"}
          aria-label="Password"
          required
          minLength={mode === "register" ? 8 : 1}
          autoComplete={mode === "register" ? "new-password" : "current-password"}
        />
        <div className="input-group-append">
          <div className="input-group-text">
            <span className="fas fa-lock" />
          </div>
        </div>
      </div>
      <div className="row">
        <div className="col-12">
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? "Please wait…" : mode === "register" ? "Register" : "Sign In"}
          </button>
        </div>
      </div>
    </form>
  );
}
