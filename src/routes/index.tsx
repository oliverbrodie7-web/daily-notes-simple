import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Header } from "../components/Header";
import { SignIn } from "../components/SignIn";
import { useTheme } from "../hooks/useTheme";
import { supabase } from "../lib/supabase";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Daily Notes" },
      { name: "description", content: "Quick daily notes, collated each evening." },
      { property: "og:title", content: "Daily Notes" },
      { property: "og:description", content: "Quick daily notes, collated each evening." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const { theme, toggleTheme } = useTheme();
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setCheckingSession(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <div className={`app-root theme-${theme}`}>
      <div className="app-frame">
        {checkingSession ? (
          <div className="app-status">
            <p className="app-status-text">Loading</p>
          </div>
        ) : session ? (
          <>
            <Header theme={theme} onToggleTheme={toggleTheme} onSignOut={handleSignOut} />
            <main className="app-main" />
          </>
        ) : (
          <SignIn />
        )}
      </div>
    </div>
  );
}
