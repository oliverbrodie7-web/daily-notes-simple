import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Header } from "../components/Header";
import { ManagerScreen } from "../components/ManagerScreen";
import { OutputScreen } from "../components/OutputScreen";
import { SettingsScreen } from "../components/SettingsScreen";
import { ScreenFrame, SidebarControlProvider } from "../components/ScreenBar";
import { Sidebar } from "../components/Sidebar";
import { SignIn } from "../components/SignIn";
import { TemplatesScreen } from "../components/TemplatesScreen";
import { TodayScreen } from "../components/TodayScreen";
import { TrackerScreen } from "../components/TrackerScreen";
import { ViewSwitcher, type AppView } from "../components/ViewSwitcher";
import { useNavLabels } from "../hooks/useNavLabels";
import { usePinGate } from "../hooks/usePinGate";
import { useSidebar } from "../hooks/useSidebar";
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
  const { theme, selectTheme } = useTheme();
  const { collapsed, toggleSidebar } = useSidebar();
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [view, setView] = useState<AppView>("today");
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [templatesDirty, setTemplatesDirty] = useState(false);

  // One shared PIN lock for the Manager and Settings screens, held in
  // memory only in this single hook instance.
  const pinGate = usePinGate(Boolean(session));
  // The screen names, read once and held here beside the colour scheme, so
  // every screen sees the same set.
  const { labels, applyNavLabels } = useNavLabels(Boolean(session));

  function handleViewChange(next: AppView) {
    if (next === view) return;
    if (view === "settings" && settingsDirty) {
      const leave = window.confirm(
        "There are unsaved changes to the email template. Leave this screen and lose them?",
      );
      if (!leave) return;
      setSettingsDirty(false);
    }
    if (view === "templates" && templatesDirty) {
      const leave = window.confirm(
        "There are unsaved changes to the templates. Leave this screen and lose them?",
      );
      if (!leave) return;
      setTemplatesDirty(false);
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

  // One tap, no confirmation. Any unsaved Settings edit is discarded with
  // the screen, so the stale dirty flag is cleared too; leaving it set
  // would warn about changes that no longer exist.
  function handleLockNow() {
    setSettingsDirty(false);
    setTemplatesDirty(false);
    pinGate.lockNow();
  }

  return (
    <div className={`app-root theme-${theme}`}>
      {checkingSession ? (
        <div className="app-status">
          <p className="app-status-text">Loading</p>
        </div>
      ) : session ? (
        <>
          <Header
            theme={theme}
            onSelectTheme={selectTheme}
            showLock={!pinGate.locked}
            onLock={handleLockNow}
            onSignOut={handleSignOut}
          />
          <SidebarControlProvider value={{ collapsed, onToggle: toggleSidebar }}>
            <div className="app-shell">
              <Sidebar
                view={view}
                onViewChange={handleViewChange}
                pinLocked={pinGate.locked}
                collapsed={collapsed}
                theme={theme}
                onSelectTheme={selectTheme}
                showLock={!pinGate.locked}
                onLock={handleLockNow}
                onSignOut={handleSignOut}
                labels={labels}
              />
              <main className="app-main">
                {/* One bar, rendered here, above whichever screen is on.
                    No screen renders its own. */}
                <ScreenFrame title={labels.screens[view]}>
                  {view === "output" ? (
                    <OutputScreen />
                  ) : view === "parents" ? (
                    <TrackerScreen pinGate={pinGate} />
                  ) : view === "manager" ? (
                    <ManagerScreen pinGate={pinGate} />
                  ) : view === "templates" ? (
                    <TemplatesScreen onDirtyChange={setTemplatesDirty} pinGate={pinGate} />
                  ) : view === "settings" ? (
                    <SettingsScreen
                      onDirtyChange={setSettingsDirty}
                      pinGate={pinGate}
                      labels={labels}
                      onLabelsChange={applyNavLabels}
                    />
                  ) : (
                    <TodayScreen />
                  )}
                </ScreenFrame>
              </main>
            </div>
          </SidebarControlProvider>
          <ViewSwitcher
            view={view}
            onViewChange={handleViewChange}
            pinLocked={pinGate.locked}
            labels={labels}
          />
        </>
      ) : (
        <SignIn />
      )}
    </div>
  );
}
