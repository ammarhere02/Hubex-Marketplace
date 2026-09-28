import Link from "next/link";
import { SectionTitle } from "@/app/_components/product-card";
import { CartView } from "./cart-view";

export default function CartPage() {
  return (
    <div className="container">
      <SectionTitle lead="Your" accent="Cart" />
      <CartView />
      <div className="d-flex justify-content-between mt-3">
        <Link href="/products" className="btn btn-default">
          <i className="fas fa-arrow-left mr-1" /> Continue shopping
        </Link>
        <Link href="/checkout" className="btn btn-primary">
          Proceed to checkout <i className="fas fa-arrow-right ml-1" />
        </Link>
      </div>
    </div>
  );
}
