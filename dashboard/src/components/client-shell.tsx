"use client";

import { usePathname } from "next/navigation";
import { TopNav } from "./top-nav";

export function ClientShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === "/";

  return (
    <>
      {!isHome && <TopNav />}
      <div className={isHome ? "min-h-screen" : "min-h-screen pt-12"}>
        {children}
      </div>
    </>
  );
}
