// Storefront shell. AdminLTE 3.2.0 (vendored CSS only — React owns all behaviour,
// no jQuery/Bootstrap JS) with a MegaMart-inspired theme layered on in globals.css.
import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { SiteFooter } from "./_components/site-footer";
import { SiteHeader } from "./_components/site-header";
// Vendored AdminLTE 3.2.0 + its Font Awesome (see src/vendor/README.md); theme last.
import "@/vendor/adminlte-3.2.0/fontawesome/css/all.min.css";
import "@/vendor/adminlte-3.2.0/css/adminlte.min.css";
import "./globals.css";

const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-poppins" });

export const metadata: Metadata = {
  title: "Hubex Market",
  description: "Shop the Hubex catalog with Cash on Delivery.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={poppins.variable}>
      <body className="hold-transition layout-top-nav">
        <div className="wrapper">
          <SiteHeader />
          <div className="content-wrapper mm-content">{children}</div>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
