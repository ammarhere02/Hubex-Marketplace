// AdminLTE 3.2.0 login page (pages/examples/login.html) as JSX.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { AuthForm } from "./auth-form";

export const metadata = { title: "Sign in — Hubex Market" };

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/");
  return (
    <div className="login-box">
      <div className="card card-outline card-primary">
        <div className="card-header text-center">
          <Link href="/" className="h1">
            <b>Hubex</b> Market
          </Link>
        </div>
        <div className="card-body login-card-body">
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
