import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Header } from "../components/Header";
import { OutputScreen } from "../components/OutputScreen";
import { SettingsScreen } from "../components/SettingsScreen";
import { SignIn } from "../components/SignIn";
import { TodayScreen } from "../components/TodayScreen";
import { ViewSwitcher, type AppView } from "../components/ViewSwitcher";
import { useTheme } from "../hooks/useTheme";
import { fallbackNameFromEmail } from "../lib/names";
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
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [displayName, setDisplayName] = useState("");

  const email = session?.user.email?.trim().toLowerCase() ?? "";

  // The signed in person's display name, held here so every screen can use
  // it. The app_users row wins; otherwise the email's local part stands in.
  useEffect(() => {
    if (!email) {
      setDisplayName("");
      return;
    }
    setDisplayName(fallbackNameFromEmail(email));
    let cancelled = false;
    supabase
      .from("app_users")
      .select("display_name")
      .eq("email", email)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const name = ((data?.display_name as string | null) ?? "").trim();
        if (name) setDisplayName(name);
      });
    return () => {
      cancelled = true;
    };
  }, [email]);

  function handleViewChange(next: AppView) {
    if (next === view) return;
    if (view === "settings" && settingsDirty) {
      const leave = window.confirm(
        "There are unsaved changes to the email template. Leave this screen and lose them?",
      );
      if (!leave) return;
      setSettingsDirty(false);
    }
    setView(next);
  }

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
          <ViewSwitcher variant="tabs" view={view} onViewChange={handleViewChange} />
          <main className="app-main">
            {view === "output" ? (
              <OutputScreen />
            ) : view === "settings" ? (
              <SettingsScreen
                onDirtyChange={setSettingsDirty}
                currentEmail={email}
                onOwnNameChange={setDisplayName}
              />
            ) : (
              <TodayScreen displayName={displayName} />
            )}
          </main>
          <ViewSwitcher variant="bar" view={view} onViewChange={handleViewChange} />
        </>
      ) : (
        <SignIn />
      )}
    </div>
  );
}
