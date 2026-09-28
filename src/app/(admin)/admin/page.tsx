// Admin home: the operator's landing page after an admin login. Separate from
// the storefront on purpose — the admin is not a customer, so this shell has
// its own navbar (brand, session, sign out) instead of the shop header, and
// (store)/layout.tsx redirects an admin session here from any shop page.
// Anonymous visitors never reach this file (the proxy gate redirects to
// /login); signed-in non-admins get 404, same as the queue board.
import Link from "next/link";
import { notFound } from "next/navigation";
import { LogoutButton } from "@/app/_components/logout-button";
import { isAdmin } from "@/lib/auth/admin";
import { getSessionUser } from "@/lib/auth/session";

export const metadata = { title: "Admin — Hubex Market" };

export default async function AdminHome() {
  const user = await getSessionUser();
  if (!isAdmin(user)) notFound();

  return (
    <div className="wrapper">
      <nav className="main-header navbar navbar-expand navbar-dark bg-primary">
        <span className="navbar-brand mb-0 h1 ml-2">
          <b>Hubex</b> Admin
        </span>
        <ul className="navbar-nav ml-auto align-items-center">
          <li className="nav-item d-none d-sm-block">
            <span className="nav-link text-white-50">{user!.email}</span>
          </li>
          <li className="nav-item">
            <LogoutButton />
          </li>
        </ul>
      </nav>

      <div className="content-wrapper p-4" style={{ minHeight: "80vh" }}>
        <div className="row">
          <div className="col-12 col-md-6 col-lg-4">
            <div className="card card-outline card-primary">
              <div className="card-header">
                <h3 className="card-title">
                  <i className="fas fa-layer-group mr-2" />
                  Queue board
                </h3>
              </div>
              <div className="card-body">
                <p className="mb-3">
                  Bull Board for the <code>orders</code> (checkout → Shopify submission) and{" "}
                  <code>catalog</code> (product sync) queues: job states, retries, and failures.
                </p>
                <Link href="/admin/queues" className="btn btn-primary">
                  Open queue board
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
