'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getToken, setToken as persistToken, clearToken } from "@/lib/token-storage";
import type { AuthResponse } from "@/types/dto";

type AuthStatus = "loading" | "unauthenticated" | "loggingIn" | "authenticated" | "loginError";

interface AuthContextValue {
  status: AuthStatus;
  token: string | null;
  user?: AuthResponse["user"];
  error?: string;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  handleUnauthorized: () => void;
  setToken: (token: string, user?: AuthResponse["user"]) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [token, setTokenState] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthResponse["user"]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (status === "unauthenticated" && pathname !== "/login") {
      router.replace("/login");
    }
  }, [status, pathname, router]);

  const setToken = useCallback((nextToken: string, nextUser?: AuthResponse["user"]) => {
    persistToken(nextToken);
    setTokenState(nextToken);
    setUser(nextUser);
    setStatus("authenticated");
    setError(undefined);
  }, []);

  useEffect(() => {
    if (status !== "loading") return;

    const verifyToken = async (storedToken: string) => {
      try {
        const res = await fetch("/api/scenes?limit=1", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${storedToken}`,
          },
        });

        if (res.status === 401) {
          console.warn("Stored token is invalid (401). Logging out.");
          clearToken();
          setStatus("unauthenticated");
          return;
        }

        // Token seems valid (or at least not 401), proceed.
        setToken(storedToken);
      } catch (err) {
        console.error("Token verification failed (network error). Keeping token.", err);
        // If network error, we might still want to let them in and fail gracefully later?
        // Or assume valid to allow offline usage? 
        // Conservatively allow entry:
        setToken(storedToken);
      }
    };

    const storedToken = getToken();
    if (storedToken) {
      verifyToken(storedToken);
    } else {
      // Small delay to prevent flash? optional.
      queueMicrotask(() => setStatus("unauthenticated"));
    }
  }, [setToken, status]);

  const login = useCallback(
    async (email: string, password: string) => {
      setStatus("loggingIn");
      setError(undefined);
      try {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user: { email, password },
          }),
        });

        if (!response.ok) {
          const message = response.status === 401 ? "Invalid credentials" : "Unable to login";
          setError(message);
          setStatus("loginError");
          return;
        }

        const payload = (await response.json()) as AuthResponse;
        if (!payload?.token) {
          setError("Token missing in response");
          setStatus("loginError");
          return;
        }

        setToken(payload.token, payload.user);
        router.replace("/");
      } catch (err) {
        console.error("Auth login error", err);
        setError("Unexpected error while logging in");
        setStatus("loginError");
      }
    },
    [router, setToken],
  );

  const logout = useCallback(() => {
    clearToken();
    setTokenState(null);
    setUser(undefined);
    setStatus("unauthenticated");
    setError(undefined);
    router.replace("/login");
  }, [router]);

  const handleUnauthorized = useCallback(() => {
    logout();
  }, [logout]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      token,
      user,
      error,
      login,
      logout,
      handleUnauthorized,
      setToken,
    }),
    [status, token, user, error, login, logout, handleUnauthorized, setToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
