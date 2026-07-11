import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coffee Shop Floor",
  description: "Floor management for snooker, cards, and playstation sessions",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body className="bg-neutral-950 text-neutral-100 min-h-screen antialiased">
        <nav
          className="sticky top-0 z-40 bg-neutral-900/95 backdrop-blur border-b border-neutral-800"
          aria-label="Top navigation"
        >
          <ul className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex items-center gap-2 md:gap-4">
            <li>
              <Link
                href="/"
                className="px-4 py-2 rounded-xl font-bold text-white bg-neutral-800 hover:bg-neutral-700 min-h-[48px] inline-flex items-center"
              >
                الأرضية
              </Link>
            </li>
            <li>
              <Link
                href="/history"
                className="px-4 py-2 rounded-xl font-semibold text-neutral-200 hover:bg-neutral-800 min-h-[48px] inline-flex items-center"
              >
                السجل
              </Link>
            </li>
            <li>
              <Link
                href="/products"
                className="px-4 py-2 rounded-xl font-semibold text-neutral-200 hover:bg-neutral-800 min-h-[48px] inline-flex items-center"
              >
                المنتجات
              </Link>
            </li>
          </ul>
        </nav>
        {children}
      </body>
    </html>
  );
}
