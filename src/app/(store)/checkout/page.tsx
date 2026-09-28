import Link from "next/link";
import { SectionTitle } from "@/app/_components/product-card";
import { CartView } from "@/app/(store)/cart/cart-view";
import { CheckoutForm } from "./checkout-form";

export default function CheckoutPage() {
  return (
    <div className="container">
      <SectionTitle lead="Secure" accent="Checkout" />
      <div className="row">
        <div className="col-lg-7 order-2 order-lg-1">
          <CheckoutForm />
        </div>
        <div className="col-lg-5 order-1 order-lg-2">
          <h5 className="mb-3">Order summary</h5>
          <CartView editable={false} />
          <Link href="/cart" className="d-inline-block mb-4">
            <i className="fas fa-pen mr-1" /> Edit cart
          </Link>
        </div>
      </div>
    </div>
  );
}
