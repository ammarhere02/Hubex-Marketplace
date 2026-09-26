import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="main-footer mm-footer">
      <div className="container">
        <div className="row">
          <div className="col-md-5 mb-4">
            <h3 className="mm-footer-brand">Hubex Market</h3>
            <p className="mb-1">Catalog synced from our Shopify store.</p>
            <p>
              <i className="fas fa-money-bill-wave mr-2" />
              Pay with Cash on Delivery
            </p>
          </div>
          <div className="col-6 col-md-3 mb-4">
            <h6 className="mm-footer-title">Shop</h6>
            <ul className="list-unstyled">
              <li>
                <Link href="/products">All products</Link>
              </li>
              <li>
                <Link href="/cart">Cart</Link>
              </li>
              <li>
                <Link href="/checkout">Checkout</Link>
              </li>
            </ul>
          </div>
          <div className="col-6 col-md-4 mb-4">
            <h6 className="mm-footer-title">Customer service</h6>
            <ul className="list-unstyled">
              <li>Orders are confirmed by phone</li>
              <li>Payment on delivery only</li>
            </ul>
          </div>
        </div>
        <div className="mm-footer-bottom">© {new Date().getFullYear()} Hubex Market · Trainee exercise</div>
      </div>
    </footer>
  );
}
