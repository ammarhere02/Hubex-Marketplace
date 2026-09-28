// Shown for unknown routes and for notFound() (unknown/hidden products, orders).
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container text-center py-5">
      <h1 className="display-4">404</h1>
      <p className="lead">This page could not be found.</p>
      <Link href="/products" className="btn btn-primary">
        Browse products
      </Link>
    </div>
  );
}
