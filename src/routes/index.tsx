import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Header } from "../components/Header";
import { OutputScreen } from "../components/OutputScreen";
import { SignIn } from "../components/SignIn";
import { ViewSwitcher, type AppView } from "../components/ViewSwitcher";
import { useTheme } from "../hooks/useTheme";
import { supabase } from "../lib/supabase";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Touch Points" },
      { name: "description", content: "Quick student touch points, collated each evening." },
      { property: "og:title", content: "Touch Points" },
      { property: "og:description", content: "Quick student touch points, collated each evening." },
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
  const [view, setView] = useState<AppView>("today");

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
      {checkingSession ? (
        <div className="app-status">
          <p className="app-status-text">Loading</p>
        </div>
      ) : session ? (
        <>
          <Header theme={theme} onToggleTheme={toggleTheme} onSignOut={handleSignOut} />
          <ViewSwitcher variant="tabs" view={view} onViewChange={setView} />
          <main className="app-main">{view === "output" ? <OutputScreen /> : null}</main>
          <ViewSwitcher variant="bar" view={view} onViewChange={setView} />
        </>
      ) : (
        <SignIn />
      )}
    </div>
  );
}
