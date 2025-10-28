"use client";

import { useCallback } from "react";
import { useAuth } from "@/components/auth/auth-provider";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api";

interface ApiRequestOptions extends RequestInit {
  ignoreAuth?: boolean;
}

export function useApi() {
  const { token, handleUnauthorized } = useAuth();

  const apiFetch = useCallback(
    async (input: string, init?: ApiRequestOptions) => {
      const headers = new Headers(init?.headers);
      if (!init?.ignoreAuth && token) {
        headers.set("Authorization", `Bearer ${token}`);
      }

      if (init?.body && !headers.has("Content-Type") && !(init.body instanceof FormData)) {
        headers.set("Content-Type", "application/json");
      }

      const response = await fetch(`${API_BASE}${input}`, {
        ...init,
        headers,
      });

      if (response.status === 401) {
        handleUnauthorized();
        throw new Error("Unauthorized");
      }

      return response;
    },
    [token, handleUnauthorized],
  );

  return apiFetch;
}
