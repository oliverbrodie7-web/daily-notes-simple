import { useCallback, useEffect, useState } from "react";
import { DEFAULT_NAV_LABELS, readNavLabels, type NavLabels } from "../lib/navLabels";
import { supabase } from "../lib/supabase";

// The one settings row the app keeps, the same one the email template and
// the PIN live in.
const SETTINGS_ROW_ID = 1;

// Read once when the app loads and held alongside the colour scheme, so
// every screen sees the same names and a rename reaches all of them without
// a refresh.
export function useNavLabels(signedIn: boolean) {
  const [labels, setLabels] = useState<NavLabels>(DEFAULT_NAV_LABELS);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    supabase
      .from("daily_notes_settings")
      .select("nav_labels")
      .eq("id", SETTINGS_ROW_ID)
      .single()
      .then(({ data }) => {
        if (cancelled) return;
        // A failed read leaves the built in names in place rather than
        // blanking the navigation.
        setLabels(readNavLabels((data as { nav_labels?: unknown } | null)?.nav_labels));
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  // Settings calls this after a successful save, so the names change
  // straight away everywhere.
  const applyNavLabels = useCallback((next: NavLabels) => {
    setLabels(readNavLabels(next));
  }, []);

  return { labels, applyNavLabels };
}
