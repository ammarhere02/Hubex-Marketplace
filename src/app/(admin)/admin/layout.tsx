// AdminLTE admin shell: dark top navbar + fixed-width dark sidebar + content
// column. The root layout's body is `layout-top-nav` (storefront), so this
// builds the panel with its own flex frame instead of AdminLTE's body-class
// sidebar plumbing (which needs jQuery); the sidebar/nav-pill classes still
// come straight from the vendored theme. Bull Board (/admin/queues) is a route
// handler, so it renders its own UI outside this layout.
//
// Access: anonymous users never get here (proxy gate → /login); signed-in
// non-admins get 404 so the panel's existence isn't advertised.
import { notFound } from "next/navigation";
import { LogoutButton } from "@/app/_components/logout-button";
import { isAdmin } from "@/lib/auth/admin";
import { getSessionUser } from "@/lib/auth/session";
import { AdminSidebarNav } from "./_components/admin-sidebar";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await getSessionUser();
  if (!isAdmin(user)) notFound();

  return (
    <div className="d-flex" style={{ minHeight: "100vh" }}>
      <aside className="main-sidebar sidebar-dark-primary elevation-2 d-flex flex-column" // marginLeft/transform overrides: AdminLTE's mobile media query pushes
        // .main-sidebar off-canvas (it expects jQuery to toggle it back); this
        // panel keeps the sidebar always visible instead.
        style={{ position: "sticky", top: 0, height: "100vh", width: 230, minWidth: 230, marginLeft: 0, transform: "none" }}>
        <a href="/admin" className="brand-link text-center">
          <span className="brand-text font-weight-light">
            <b>Hubex</b> Admin
          </span>
        </a>
        <div className="sidebar flex-grow-1">
          <AdminSidebarNav />
        </div>
      </aside>

      <div className="d-flex flex-column flex-grow-1" style={{ minWidth: 0, background: "#f4f6f9" }}>
        <nav className="main-header navbar navbar-expand navbar-white navbar-light border-bottom mb-0">
          <ul className="navbar-nav ml-auto align-items-center">
            <li className="nav-item d-none d-sm-block">
              <span className="nav-link text-muted">
                <i className="fas fa-user-shield mr-1" /> {user!.email}
              </span>
            </li>
            <li className="nav-item">
              <LogoutButton />
            </li>
          </ul>
        </nav>
        <main className="flex-grow-1">{children}</main>
      </div>
    </div>
  );
}
