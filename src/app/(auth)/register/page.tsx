// AdminLTE 3.2.0 register page (pages/examples/register.html) as JSX.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { AuthForm } from "../login/auth-form";

export const metadata = { title: "Create account — Hubex Market" };

export default async function RegisterPage() {
  if (await getSessionUser()) redirect("/");
  return (
    <div className="register-box">
      <div className="card card-outline card-primary">
        <div className="card-header text-center">
          <Link href="/" className="h1">
            <b>Hubex</b> Market
          </Link>
        </div>
        <div className="card-body register-card-body">
          <p className="login-box-msg">Register a new account</p>
          <AuthForm mode="register" />
          <p className="mb-0 mt-3">
            <Link href="/login" className="text-center">
              I already have an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
