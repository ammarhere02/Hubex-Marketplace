import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { AuthForm } from "./auth-form";

export const metadata = { title: "Sign in — Hubex Market" };

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/");
  return (
    <div className="container py-4">
      <div className="row justify-content-center">
        <div className="col-md-6 col-lg-4">
          <div className="card card-outline card-primary">
            <div className="card-header">
              <h3 className="card-title">Sign in</h3>
            </div>
            <div className="card-body">
              <AuthForm mode="login" />
              <p className="mt-3 mb-0 text-center">
                New here? <Link href="/register">Create an account</Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
