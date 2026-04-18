"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "./types";

const VIEW_MODE_KEY = "aiflex.viewMode";
type ViewMode = "admin" | "user";

interface AuthState {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  /**
   * True when the current session belongs to an admin AND they have not
   * switched the UI into "view as user" mode. Components should key admin
   * UI (banners, nav links, actions) off this, not off `user.role`.
   */
  isAdminView: boolean;
  /** Real server role — unaffected by the UI toggle. */
  isRealAdmin: boolean;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

function readInitialViewMode(): ViewMode {
  if (typeof window === "undefined") return "admin";
  const v = window.localStorage.getItem(VIEW_MODE_KEY);
  return v === "user" ? "user" : "admin";
}

/**
 * Client-side auth hook. Fetches /api/auth/me once on mount, re-runs when
 * `aiflex:auth-changed` fires. Also exposes the admin↔user view toggle so
 * admins can preview the platform as a regular creator.
 */
export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewModeState] = useState<ViewMode>("admin");

  async function refresh() {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const data = await res.json();
      setUser(data.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    // Reset view mode on logout so the next admin login starts fresh.
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(VIEW_MODE_KEY);
    }
    setViewModeState("admin");
    window.dispatchEvent(new Event("aiflex:auth-changed"));
  }

  const setViewMode = useCallback((mode: ViewMode) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(VIEW_MODE_KEY, mode);
    }
    setViewModeState(mode);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("aiflex:view-mode-changed"));
    }
  }, []);

  useEffect(() => {
    setViewModeState(readInitialViewMode());
    refresh();
    const authHandler = () => refresh();
    const viewHandler = () => setViewModeState(readInitialViewMode());
    window.addEventListener("aiflex:auth-changed", authHandler);
    window.addEventListener("aiflex:view-mode-changed", viewHandler);
    return () => {
      window.removeEventListener("aiflex:auth-changed", authHandler);
      window.removeEventListener("aiflex:view-mode-changed", viewHandler);
    };
  }, []);

  const isRealAdmin = user?.role === "admin";
  const isAdminView = isRealAdmin && viewMode === "admin";

  return {
    user,
    loading,
    refresh,
    logout,
    isAdminView,
    isRealAdmin,
    viewMode,
    setViewMode,
  };
}
