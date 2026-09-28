// Document shell only: fonts, vendored AdminLTE 3.2.0 CSS (React owns all
// behaviour, no jQuery/Bootstrap JS) and the nav progress bar. The storefront
// header/footer live in (store)/layout.tsx so auth pages render without them.
import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { Suspense } from "react";
import { NavProgress } from "./_components/nav-progress";
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
        {/* useSearchParams needs a Suspense boundary so it doesn't opt the shell out of prerendering. */}
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
