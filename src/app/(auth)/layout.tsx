// AdminLTE auth-page backdrop. The template puts .login-page on <body>, but the
// root layout owns <body> for the storefront shell; the class works the same on
// a wrapper div (flex-centered, grey backdrop) so header/footer stay in place.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="login-page" style={{ minHeight: "70vh", padding: "2rem 1rem" }}>
      {children}
    </div>
  );
}
