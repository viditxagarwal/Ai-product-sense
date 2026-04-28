"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import { Session, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string, redirect?: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  getAccessToken: () => string | null;
  refreshToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    let mounted = true;

    async function initSession() {
      const { data: { session: stored } } = await supabase.auth.getSession();

      if (!stored) {
        // No session at all — user needs to log in
        if (mounted) {
          setSession(null);
          setUser(null);
          setLoading(false);
        }
        return;
      }

      // Always refresh the stored session to ensure we have a valid token
      // before rendering any authenticated content.
      const { data, error } = await supabase.auth.refreshSession();

      if (mounted) {
        if (error || !data.session) {
          // Refresh failed — stale/expired session, clear everything.
          // This ensures AppShell sees user=null and blocks all children.
          await supabase.auth.signOut();
          setSession(null);
          setUser(null);
        } else {
          setSession(data.session);
          setUser(data.session.user);
        }
        setLoading(false);
      }
    }

    initSession();

    // Listen for auth changes (login, logout, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setSession(session);
        setUser(session?.user ?? null);
        // Don't set loading=false here — initSession handles the initial load.
        // Subsequent auth changes (like signIn/signOut) happen after loading is already false.
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase.auth]);

  const signIn = useCallback(
    async (email: string, password: string, redirect?: string) => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) return { error: error.message };
      router.push(redirect || "/");
      return { error: null };
    },
    [supabase.auth, router]
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      const { error, data } = await supabase.auth.signUp({ email, password });
      if (error) return { error: error.message };

      // Seed default data for the new user
      if (data.session?.access_token) {
        const baseUrl =
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
        try {
          await fetch(`${baseUrl}/auth/init-user`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${data.session.access_token}`,
            },
          });
        } catch {
          // Non-critical — user can seed manually later
        }
      }

      router.push("/");
      return { error: null };
    },
    [supabase.auth, router]
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    router.push("/login");
  }, [supabase.auth, router]);

  const getAccessToken = useCallback(() => {
    return session?.access_token ?? null;
  }, [session]);

  const refreshToken = useCallback(async () => {
    const { data } = await supabase.auth.refreshSession();
    return data.session?.access_token ?? null;
  }, [supabase.auth]);

  return (
    <AuthContext.Provider
      value={{ user, session, loading, signIn, signUp, signOut, getAccessToken, refreshToken }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
