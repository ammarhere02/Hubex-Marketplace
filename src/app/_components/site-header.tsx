// Header: welcome strip, brand + cart, and a category bar built from synced productTypes.
import Link from "next/link";
import { connection } from "next/server";
import { listCategories } from "@/lib/catalog";
import { CartBadge } from "./cart-badge";

export async function SiteHeader() {
  await connection(); // categories come from the latest sync
  const categories = await listCategories();

  return (
    <header>
      <div className="mm-topbar">
        <div className="container d-flex justify-content-between">
          <span>Welcome to Hubex Market</span>
          <span className="d-none d-sm-inline">
            <i className="fas fa-truck mr-1" /> Cash on Delivery on every order
          </span>
        </div>
      </div>
      <nav className="main-header navbar navbar-expand navbar-white navbar-light mm-navbar">
        <div className="container">
          <Link href="/" className="navbar-brand mm-brand">
            <i className="fas fa-bars mr-3" aria-hidden />
            Hubex Market
          </Link>
          <ul className="navbar-nav ml-auto">
            <li className="nav-item">
              <Link href="/products" className="nav-link">
                <i className="fas fa-th-large mr-1" /> All products
              </Link>
            </li>
            <li className="nav-item">
              <CartBadge />
            </li>
          </ul>
        </div>
      </nav>
      {categories.length > 0 && (
        <div className="mm-catbar">
          <div className="container">
            <Link href="/products" className="mm-pill">
              All
            </Link>
            {categories.map((c) => (
              <Link key={c.name} href={`/products?category=${encodeURIComponent(c.name)}`} className="mm-pill">
                {c.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
