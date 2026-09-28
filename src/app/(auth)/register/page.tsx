import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { AuthForm } from "../login/auth-form";

export const metadata = { title: "Create account — Hubex Market" };

export default async function RegisterPage() {
  if (await getSessionUser()) redirect("/");
  return (
    <div className="container py-4">
      <div className="row justify-content-center">
        <div className="col-md-6 col-lg-4">
          <div className="card card-outline card-primary">
            <div className="card-header">
              <h3 className="card-title">Create account</h3>
            </div>
            <div className="card-body">
              <AuthForm mode="register" />
              <p className="mt-3 mb-0 text-center">
                Already registered? <Link href="/login">Sign in</Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
