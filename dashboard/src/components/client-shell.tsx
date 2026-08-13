"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";

export function ClientShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const noShell = pathname === "/" || pathname.startsWith("/best");
  return (
    <>
      {!noShell && <Sidebar />}
      <div className={noShell ? "min-h-screen" : "ml-56 min-h-screen"}>
        {children}
      </div>
    </>
  );
}
