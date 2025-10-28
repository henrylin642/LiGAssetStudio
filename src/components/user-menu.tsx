"use client";

import { User } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/components/auth/auth-provider";

export function UserMenu() {
  const { user, logout, token } = useAuth();

  const initials = useMemo(() => {
    if (!user?.name && !user?.email) return null;
    const source = user?.name ?? user?.email ?? "";
    return source
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [user]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="inline-flex items-center gap-2 px-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
            {initials ?? <User className="h-4 w-4" />}
          </span>
          <span className="hidden text-sm font-medium text-slate-700 md:inline">
            {user?.name ?? user?.email ?? "Session"}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>
          <p className="text-xs uppercase text-slate-500">Signed in</p>
          <p className="truncate text-sm font-medium text-slate-900">
            {user?.email ?? "Token active"}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-xs text-slate-500">
          <div className="flex flex-col">
            <span className="font-medium text-slate-700">Token</span>
            <span className="truncate">{token?.slice(0, 24)}...</span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => logout()} className="text-red-600">
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

