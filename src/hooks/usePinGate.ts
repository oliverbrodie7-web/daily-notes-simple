import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPinHash, hashPin, savePinHash } from "../lib/pin";

const UNLOCK_MS = 15 * 60 * 1000;

export type PinGateState = "checking" | "setup" | "locked" | "unlocked" | "failed";

export type PinGate = {
  state: PinGateState;
  storedHash: string | null;
  locked: boolean;
  touch: () => void;
  lockNow: () => void;
  verify: (pin: string) => Promise<boolean>;
  saveNewPin: (pin: string) => Promise<boolean>;
  notePinChanged: (hash: string) => void;
};

// One shared lock for the Manager and Settings screens: a single PIN, a
// single fifteen minute window, and a single relock watcher. Unlocking
// either screen unlocks both, activity on either resets the window, and the
// state lives in memory only, so a reload or sign out always locks both.
export function usePinGate(enabled: boolean): PinGate {
  const untilRef = useRef(0);
  const [state, setState] = useState<PinGateState>("checking");
  const [storedHash, setStoredHash] = useState<string | null>(null);

  // Signing out, or the session dropping for any reason, locks everything.
  useEffect(() => {
    if (enabled) return;
    untilRef.current = 0;
    setState("checking");
  }, [enabled]);

  // Find out whether a PIN exists whenever the gate needs deciding.
  useEffect(() => {
    if (!enabled || state !== "checking") return;
    let cancelled = false;
    fetchPinHash().then(({ hash, failed }) => {
      if (cancelled) return;
      if (failed) {
        setState("failed");
        return;
      }
      setStoredHash(hash);
      setState(hash ? "locked" : "setup");
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, state]);

  // While unlocked, watch the clock and relock the moment time runs out.
  useEffect(() => {
    if (state !== "unlocked") return;
    const check = () => {
      if (untilRef.current - Date.now() <= 0) setState("checking");
    };
    check();
    const timer = window.setInterval(check, 1000);
    return () => window.clearInterval(timer);
  }, [state]);

  const touch = useCallback(() => {
    untilRef.current = Date.now() + UNLOCK_MS;
  }, []);

  // Lock both screens at once, right now. The window is cancelled so the
  // relock watcher has nothing left to count down, and the gate goes
  // straight to its lock panel rather than back through a fetch, so the
  // screen behind it is hidden in the same frame as the tap.
  const lockNow = useCallback(() => {
    untilRef.current = 0;
    setState((current) => {
      if (current !== "unlocked") return current;
      return storedHash ? "locked" : "checking";
    });
  }, [storedHash]);

  const verify = useCallback(
    async (pin: string) => {
      if (!storedHash) return false;
      const hash = await hashPin(pin);
      if (hash !== storedHash) return false;
      untilRef.current = Date.now() + UNLOCK_MS;
      setState("unlocked");
      return true;
    },
    [storedHash],
  );

  const saveNewPin = useCallback(async (pin: string) => {
    const hash = await hashPin(pin);
    const ok = await savePinHash(hash);
    if (!ok) return false;
    setStoredHash(hash);
    untilRef.current = Date.now() + UNLOCK_MS;
    setState("unlocked");
    return true;
  }, []);

  const notePinChanged = useCallback((hash: string) => {
    setStoredHash(hash);
  }, []);

  return {
    state,
    storedHash,
    locked: state !== "unlocked",
    touch,
    lockNow,
    verify,
    saveNewPin,
    notePinChanged,
  };
}
