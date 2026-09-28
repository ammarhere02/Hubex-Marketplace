// AdminLTE auth-page backdrop (pages/examples/login.html puts .login-page on
// <body>; the class works the same on a wrapper div). No storefront header or
// footer here — signed-out visitors get only the auth card, with the brand
// link inside it, and reach the cart/catalog only after signing in.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="login-page" style={{ minHeight: "100vh", padding: "2rem 1rem" }}>
      {children}
    </div>
  );
}
