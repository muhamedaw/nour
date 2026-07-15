"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoutButton from "@/components/auth/LogoutButton";

interface NavLink {
  href: string;
  label: string;
}

const LINKS: NavLink[] = [
  { href: "/", label: "الأرضية" },
  { href: "/history", label: "السجل" },
  { href: "/products", label: "المنتجات" },
  { href: "/dashboard", label: "لوحة التحكم" },
  { href: "/ac", label: "تكييف" },
  { href: "/settings", label: "الإعدادات" },
];

export default function NavBar() {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    // Exact match for "/", prefix match for everything else
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <nav
      className="sticky top-0 z-40 bg-espresso-900/95 backdrop-blur border-b border-espresso-700"
      aria-label="Top navigation"
    >
      <ul className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex flex-wrap items-center gap-2 md:gap-4">
        {LINKS.map((link) => {
          const active = isActive(link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                className={`px-4 py-2 rounded-xl font-bold min-h-[48px] inline-flex items-center transition-colors duration-200 ${
                  active
                    ? "bg-copper-700/80 text-espresso-50"
                    : "text-espresso-200 hover:bg-espresso-800 hover:text-espresso-50 font-semibold"
                }`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
        <li className="mr-auto">
          <LogoutButton />
        </li>
      </ul>
    </nav>
  );
}
