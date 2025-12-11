"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthGuard } from "@/components/auth/auth-guard";
import { UserMenu } from "@/components/user-menu";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Gallery" },
  // { href: "/tools", label: "Tools" },
  // { href: "/jobs", label: "Jobs" },
  { href: "/scenes", label: "Scenes" },
  // { href: "/docs", label: "Docs" },
  // { href: "/gen", label: "Gen" },
];

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AuthGuard>
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70">
          <div className="mx-auto flex w-full items-center justify-between gap-4 px-6 py-4">
            <Link href="/" className="text-lg font-semibold tracking-tight text-slate-900">
              LiG Assets Studio
            </Link>
            <nav className="flex items-center gap-4 text-sm text-slate-600">
              {NAV_ITEMS.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/" || pathname.startsWith("/asset")
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "rounded-md px-2 py-1 transition",
                      active ? "bg-black !text-white" : "hover:bg-slate-100 hover:text-slate-900",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <UserMenu />
          </div>
        </header>
        <main className="mx-auto flex w-full flex-1 flex-col gap-6 px-6 py-8">
          {children}
        </main>
      </div>
    </AuthGuard>
  );
}
