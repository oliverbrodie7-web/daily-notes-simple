import { useRef, useState, type FormEvent } from "react";
import type { PinGate } from "../hooks/usePinGate";
import { isValidPin } from "../lib/pin";
import { LockIcon } from "./Icons";

type LockGateProps = {
  heading: string;
  gate: PinGate;
};

// The shared PIN gate shown by both the Manager and Settings screens. The
// heading is the only difference between the two. The first time panel and
// the lock panel are identical everywhere else.
export function LockGate({ heading, gate }: LockGateProps) {
  const [pinEntry, setPinEntry] = useState("");
  const [setupPin, setSetupPin] = useState("");
  const [setupConfirm, setSetupConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pinRef = useRef<HTMLInputElement | null>(null);

  async function handleUnlockSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const unlocked = await gate.verify(pinEntry);
    setBusy(false);
    if (!unlocked) {
      setMessage("That PIN is not right.");
      setPinEntry("");
      pinRef.current?.focus();
    }
  }

  async function handleSetupSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!isValidPin(setupPin)) {
      setMessage("A PIN is exactly four digits.");
      return;
    }
    if (setupPin !== setupConfirm) {
      setMessage("The two PINs do not match.");
      return;
    }
    setBusy(true);
    setMessage(null);
    const saved = await gate.saveNewPin(setupPin);
    setBusy(false);
    if (!saved) setMessage("The change could not be saved. Please try again.");
  }

  if (gate.state === "checking") {
    return (
      <div className="manager-gate">
        <p className="manager-gate-status">Loading</p>
      </div>
    );
  }

  if (gate.state === "failed") {
    return (
      <div className="manager-gate">
        <p className="manager-gate-status" role="alert">
          This screen could not be loaded. Please try again.
        </p>
      </div>
    );
  }

  if (gate.state === "setup") {
    return (
      <div className="manager-gate">
        <form className="gate-card" onSubmit={handleSetupSave}>
          <LockIcon className="gate-icon" size={24} />
          <h2 className="gate-heading">Set a PIN</h2>
          <p className="gate-sub">This keeps the Manager screen private on a shared device.</p>
          <label className="field-label" htmlFor="setup-pin">
            New PIN
          </label>
          <input
            id="setup-pin"
            className="text-field pin-field"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={setupPin}
            onChange={(event) => {
              setSetupPin(event.target.value.replace(/\D/g, "").slice(0, 4));
              setMessage(null);
            }}
          />
          <label className="field-label" htmlFor="setup-pin-confirm">
            Confirm PIN
          </label>
          <input
            id="setup-pin-confirm"
            className="text-field pin-field"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={setupConfirm}
            onChange={(event) => {
              setSetupConfirm(event.target.value.replace(/\D/g, "").slice(0, 4));
              setMessage(null);
            }}
          />
          <button type="submit" className="primary-button gate-button" disabled={busy}>
            {busy ? "Saving..." : "Save PIN"}
          </button>
          {message ? (
            <p className="gate-message" role="alert">
              {message}
            </p>
          ) : null}
        </form>
      </div>
    );
  }

  return (
    <div className="manager-gate">
      <form className="gate-card" onSubmit={handleUnlockSubmit}>
        <LockIcon className="gate-icon" size={24} />
        <h2 className="gate-heading">{heading}</h2>
        <p className="gate-sub">Enter your PIN to open this screen.</p>
        <label className="field-label" htmlFor="gate-pin">
          PIN
        </label>
        <input
          id="gate-pin"
          className="text-field pin-field"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          ref={pinRef}
          value={pinEntry}
          onChange={(event) => {
            setPinEntry(event.target.value.replace(/\D/g, "").slice(0, 4));
            setMessage(null);
          }}
        />
        <button type="submit" className="primary-button gate-button" disabled={busy}>
          {busy ? "Checking..." : "Unlock"}
        </button>
        {message ? (
          <p className="gate-message" role="alert">
            {message}
          </p>
        ) : null}
      </form>
    </div>
  );
}
