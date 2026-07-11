import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coffee Shop Floor",
  description: "Floor management for snooker, cards, and playstation sessions",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-neutral-950 text-neutral-100 min-h-screen">
        {children}
      </body>
    </html>
  );
}
