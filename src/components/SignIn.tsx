import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { StarIcon } from "./Icons";

export function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (signingIn) return;
    setSigningIn(true);
    setFailed(false);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setFailed(true);
    }
    // On success the auth listener in the route swaps this screen out.
    setSigningIn(false);
  }

  return (
    <div className="signin-wrap">
      <form className="signin-card" onSubmit={handleSubmit}>
        <div className="signin-brand">
          <StarIcon className="signin-star" size={22} />
          <span className="signin-title">Touch Points</span>
        </div>
        <p className="signin-subtitle">Sign in to add today's notes.</p>
        <label className="field-label" htmlFor="signin-email">
          Email
        </label>
        <input
          id="signin-email"
          className="text-field"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <label className="field-label" htmlFor="signin-password">
          Password
        </label>
        <input
          id="signin-password"
          className="text-field"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button type="submit" className="primary-button signin-submit" disabled={signingIn}>
          {signingIn ? "Signing in..." : "Sign in"}
        </button>
        {failed ? (
          <p className="form-message" role="alert">
            That email or password is not right.
          </p>
        ) : null}
      </form>
    </div>
  );
}
