"use client";
// Checkout form. Sends the cart (IDs + quantities) and customer fields to the
// server action; the server validates everything again and decides the prices.
import { useActionState } from "react";
import { checkoutAction, type CheckoutState } from "@/app/cart/actions";
import { useCart } from "@/app/cart/cart-store";

interface Field {
  name: string;
  label: string;
  required?: boolean;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  col?: string;
  autoComplete?: string;
}

const CONTACT: Field[] = [
  { name: "customerName", label: "Full name", required: true, autoComplete: "name", placeholder: "First and last name" },
  { name: "phone", label: "Phone", required: true, type: "tel", autoComplete: "tel", placeholder: "0300 1234567", col: "col-md-6" },
  { name: "email", label: "Email (optional)", type: "email", autoComplete: "email", col: "col-md-6" },
];
const ADDRESS: Field[] = [
  { name: "address1", label: "Address", required: true, autoComplete: "address-line1", placeholder: "House, street" },
  { name: "address2", label: "Apartment, suite (optional)", autoComplete: "address-line2" },
  { name: "city", label: "City", required: true, autoComplete: "address-level2", col: "col-md-6" },
  { name: "province", label: "Province (optional)", autoComplete: "address-level1", col: "col-md-6" },
  { name: "zip", label: "Postal code", required: true, autoComplete: "postal-code", col: "col-md-6" },
  { name: "country", label: "Country code", required: true, defaultValue: "PK", autoComplete: "country", col: "col-md-6" },
];

export function CheckoutForm() {
  const lines = useCart();
  const [state, action, pending] = useActionState<CheckoutState, FormData>(checkoutAction, {});
  if (lines.length === 0) return null;

  const renderField = (f: Field) => {
    const errors = state.fieldErrors?.[f.name];
    return (
      <div key={f.name} className={`form-group ${f.col ?? "col-12"}`}>
        <label htmlFor={f.name}>
          {f.label}
          {f.required && <span className="text-danger"> *</span>}
        </label>
        <input
          id={f.name}
          name={f.name}
          type={f.type ?? "text"}
          required={f.required}
          defaultValue={f.defaultValue}
          placeholder={f.placeholder}
          autoComplete={f.autoComplete}
          className={`form-control ${errors ? "is-invalid" : ""}`}
        />
        {errors?.map((e) => (
          <div key={e} className="invalid-feedback">
            {e}
          </div>
        ))}
      </div>
    );
  };

  return (
    <form action={action}>
      <input type="hidden" name="cart" value={JSON.stringify(lines)} />
      <div className="card card-outline card-primary">
        <div className="card-header">
          <h3 className="card-title">
            <i className="fas fa-user mr-2" />
            Contact
          </h3>
        </div>
        <div className="card-body row">{CONTACT.map(renderField)}</div>
      </div>
      <div className="card card-outline card-primary">
        <div className="card-header">
          <h3 className="card-title">
            <i className="fas fa-map-marker-alt mr-2" />
            Delivery address
          </h3>
        </div>
        <div className="card-body row">{ADDRESS.map(renderField)}</div>
      </div>
      <div className="card card-outline card-primary">
        <div className="card-header">
          <h3 className="card-title">
            <i className="fas fa-money-bill-wave mr-2" />
            Payment
          </h3>
        </div>
        <div className="card-body">
          <div className="custom-control custom-radio">
            <input className="custom-control-input" type="radio" id="cod" name="paymentMethod" value="COD" defaultChecked />
            <label htmlFor="cod" className="custom-control-label">
              Cash on Delivery — pay when your order arrives
            </label>
          </div>
          {state.fieldErrors?.paymentMethod && <div className="text-danger small">{state.fieldErrors.paymentMethod[0]}</div>}
        </div>
      </div>
      {state.formError && (
        <div className="alert alert-danger">
          <i className="fas fa-exclamation-circle mr-2" />
          {state.formError}
        </div>
      )}
      <button type="submit" className="btn btn-primary btn-lg btn-block mb-4" disabled={pending}>
        {pending ? (
          <>
            <i className="fas fa-spinner fa-spin mr-2" />
            Placing order…
          </>
        ) : (
          "Place order"
        )}
      </button>
    </form>
  );
}
