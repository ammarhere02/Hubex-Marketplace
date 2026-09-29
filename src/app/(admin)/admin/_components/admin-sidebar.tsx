"use client";

// Sidebar nav links with active-state highlighting. Client component only for
// usePathname; the surrounding shell stays on the server.
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", icon: "fa-tachometer-alt", label: "Dashboard" },
  { href: "/admin/orders", icon: "fa-receipt", label: "Orders" },
  { href: "/admin/queues", icon: "fa-layer-group", label: "Queue board" },
] as const;

export function AdminSidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="mt-2">
      <ul className="nav nav-pills nav-sidebar flex-column" role="menu">
        {LINKS.map((l) => {
          const active = l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href);
          return (
            <li key={l.href} className="nav-item">
              {/* Bull Board is a non-Next route; a hard navigation is intended. */}
              {l.href === "/admin/queues" ? (
                <a href={l.href} className={`nav-link ${active ? "active" : ""}`}>
                  <i className={`nav-icon fas ${l.icon}`} />
                  <p>{l.label}</p>
                </a>
              ) : (
                <Link href={l.href} className={`nav-link ${active ? "active" : ""}`}>
                  <i className={`nav-icon fas ${l.icon}`} />
                  <p>{l.label}</p>
                </Link>
              )}
            </li>
          );
        })}
        <li className="nav-header">STOREFRONT</li>
        <li className="nav-item">
          <a href="/" className="nav-link">
            <i className="nav-icon fas fa-store" />
            <p>View shop</p>
          </a>
        </li>
      </ul>
    </nav>
  );
}
