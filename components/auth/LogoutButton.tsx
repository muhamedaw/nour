"use client";

import { clearUnlocked } from "@/lib/localauth";

export default function LogoutButton() {
  return (
    <button
      type="button"
      onClick={() => {
        clearUnlocked();
        window.location.reload();
      }}
      className="px-4 py-2 rounded-xl font-semibold text-rust-400 hover:bg-rust-900/40 min-h-[48px] inline-flex items-center transition-colors duration-200"
    >
      خروج
    </button>
  );
}
