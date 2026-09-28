// Storefront chrome: header (nav, cart badge, account) and footer wrap every
// shopping page. Auth pages live in the sibling (auth) group without this
// shell, so signed-out visitors see only the login/register card — no cart or
// catalog links to poke at before authenticating. The env-configured admin is
// an operator, not a customer: any shop page redirects an admin session to
// /admin, so the storefront (cart, checkout) is customers-only.
import { redirect } from "next/navigation";
import { SiteFooter } from "@/app/_components/site-footer";
import { SiteHeader } from "@/app/_components/site-header";
import { isAdmin } from "@/lib/auth/admin";
import { getSessionUser } from "@/lib/auth/session";

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  if (isAdmin(await getSessionUser())) redirect("/admin");
  return (
    <div className="wrapper">
      <SiteHeader />
      <div className="content-wrapper mm-content">{children}</div>
      <SiteFooter />
    </div>
  );
}
