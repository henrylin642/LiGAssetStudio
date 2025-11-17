"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { AuthProvider } from "./auth/auth-provider";

const ENABLE_DEVTOOLS = process.env.NEXT_PUBLIC_ENABLE_DEVTOOLS === "true";

const DevtoolsComponent = ENABLE_DEVTOOLS
  ? dynamic(
      () =>
        import("@tanstack/react-query-devtools").then((mod) => ({
          default: mod.ReactQueryDevtools,
        })),
      { ssr: false },
    )
  : (() => null);

function useHasHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    // Safe to toggle after first paint so server/client markup stay in sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, []);
  return hydrated;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );
  const hasHydrated = useHasHydrated();
  const devtoolsVisible = ENABLE_DEVTOOLS && hasHydrated;

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        {children}
        {devtoolsVisible ? <DevtoolsComponent initialIsOpen={false} /> : null}
      </QueryClientProvider>
    </AuthProvider>
  );
}
