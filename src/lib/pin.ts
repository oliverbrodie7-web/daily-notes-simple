import { supabase } from "./supabase";

// The digits themselves are never stored. The PIN is scrambled with the
// browser's built in SHA-256, mixed with this fixed text so the same four
// digits do not produce a well known result.
const PIN_SALT = "touch-points-manager-lock";

const SETTINGS_ROW_ID = 1;

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export async function hashPin(pin: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${PIN_SALT}:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

// Reads the stored scrambled PIN. hash is null when no PIN has been set.
export async function fetchPinHash(): Promise<{ hash: string | null; failed: boolean }> {
  const { data, error } = await supabase
    .from("daily_notes_settings")
    .select("manager_pin_hash")
    .eq("id", SETTINGS_ROW_ID)
    .single();
  if (error || !data) return { hash: null, failed: true };
  const value = ((data.manager_pin_hash as string | null) ?? "").trim();
  return { hash: value || null, failed: false };
}

export async function savePinHash(hash: string): Promise<boolean> {
  const { error } = await supabase
    .from("daily_notes_settings")
    .update({ manager_pin_hash: hash })
    .eq("id", SETTINGS_ROW_ID);
  return !error;
}
