// AdminLTE 3.2.0 login page (pages/examples/login.html) as JSX.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { AuthForm } from "./auth-form";

export const metadata = { title: "Sign in — Hubex Market" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getSessionUser()) redirect("/");
  const { reason } = await searchParams;
  return (
    <div className="login-box">
      <div className="card card-outline card-primary">
        <div className="card-header text-center">
          <Link href="/" className="h1">
            <b>Hubex</b> Market
          </Link>
        </div>
        <div className="card-body login-card-body">
          {reason === "idle" && (
            <div className="alert alert-warning py-2 mb-3" role="alert">
              You were signed out after 5 minutes of inactivity.
            </div>
          )}
          <p className="login-box-msg">Sign in to start your session</p>
          <AuthForm mode="login" />
          <p className="mb-0 mt-3">
            <Link href="/register" className="text-center">
              Register a new account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
