// Storefront chrome: header (nav, cart badge, account) and footer wrap every
// shopping page. Auth pages live in the sibling (auth) group without this
// shell, so signed-out visitors see only the login/register card — no cart or
// catalog links to poke at before authenticating.
import { SiteFooter } from "@/app/_components/site-footer";
import { SiteHeader } from "@/app/_components/site-header";

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="wrapper">
      <SiteHeader />
      <div className="content-wrapper mm-content">{children}</div>
      <SiteFooter />
    </div>
  );
}
