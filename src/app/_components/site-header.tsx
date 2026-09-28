// Header: welcome strip, brand, and nav links. Category filters live on /products.
import Link from "next/link";
import { Suspense } from "react";
import { CartBadge } from "./cart-badge";
import { HeaderAuth } from "./header-auth";

export function SiteHeader() {
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
            Hubex Market
          </Link>
          <ul className="navbar-nav ml-auto">
            <li className="nav-item">
              <Link href="/" className="nav-link">
                <i className="fas fa-home mr-1" /> Home
              </Link>
            </li>
            <li className="nav-item">
              <Link href="/products" className="nav-link">
                <i className="fas fa-th-large mr-1" /> All products
              </Link>
            </li>
            <li className="nav-item">
              <CartBadge />
            </li>
            {/* Session read is request-time; Suspense keeps the shell prerenderable. */}
            <Suspense fallback={null}>
              <HeaderAuth />
            </Suspense>
          </ul>
        </div>
      </nav>
    </header>
  );
}
