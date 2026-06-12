import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { usePrivy, useLoginWithEmail, useConnectWallet } from "@privy-io/react-auth";
import { C, F } from "../../tokens";
import Logo from "../../components/layout/Logo";
import Spinner from "../../components/ui/Spinner";
import { useApp } from "../../context/AppContext";

function isValidEmail(e: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

export default function SignUp() {
  const navigate = useNavigate();
  const { dispatch } = useApp();
  const { authenticated } = usePrivy();
  const { sendCode } = useLoginWithEmail();
  const { connectWallet } = useConnectWallet({
    onSuccess({ wallet }) {
      dispatch({ type: "SET_AUTHENTICATED", walletAddress: wallet.address });
      navigate("/onboarding/persona");
    },
    onError() { setError("Something went wrong. Please try again."); },
  });

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [focused, setFocused] = useState(false);

  useEffect(() => { if (authenticated) navigate("/onboarding/persona"); }, [authenticated]);

  const valid = isValidEmail(email);

  const handleSubmit = async () => {
    if (!valid || loading) return;
    if (!isValidEmail(email)) { setError("Please enter a valid email address"); return; }
    setLoading(true); setError("");
    try {
      dispatch({ type: "SET_EMAIL", email });
      await sendCode({ email });
      navigate("/check-email");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
      <div style={{ position: "absolute", top: "24px", left: "32px" }}>
        <button onClick={() => navigate("/")} style={{ background: "none", border: "none", color: C.textMute, cursor: "pointer", fontFamily: F.body, fontSize: "13px" }}>← Back</button>
      </div>

      <div style={{ width: "100%", maxWidth: "420px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "40px" }}>
        {/* Logo */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "24px" }}>
          <Logo size="md" />
        </div>

        <h1 style={{ fontSize: "24px", fontWeight: 700, fontFamily: F.display, color: C.white, textAlign: "center", marginBottom: "8px" }}>
          Create your account
        </h1>
        <p style={{ fontSize: "14px", color: C.textSec, fontFamily: F.body, textAlign: "center", lineHeight: 1.55, marginBottom: "28px" }}>
          Enter your email to get started. We'll create your Web3 wallet automatically.
        </p>

        {/* Email field */}
        <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: C.textSec, fontFamily: F.body, marginBottom: "8px" }}>
          Email address
        </label>
        <input
          type="email"
          value={email}
          onChange={e => { setEmail(e.target.value); setError(""); }}
          onKeyDown={e => e.key === "Enter" && handleSubmit()}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="you@example.com"
          autoFocus
          style={{
            width: "100%", boxSizing: "border-box",
            background: C.surface2, border: `1px solid ${error ? C.danger : focused ? C.purple : C.border}`,
            borderRadius: "8px", padding: "12px 16px",
            color: C.white, fontFamily: F.body, fontSize: "14px", outline: "none",
            transition: "border-color 0.15s",
          }}
        />
        {error && <p style={{ fontSize: "12px", color: C.danger, fontFamily: F.body, marginTop: "8px" }}>{error}</p>}

        {/* Primary button */}
        <button
          onClick={handleSubmit}
          disabled={!valid || loading}
          style={{
            width: "100%", marginTop: "16px",
            background: C.purple, border: "none", borderRadius: "8px", padding: "14px",
            color: C.white, fontFamily: F.body, fontSize: "15px", fontWeight: 600,
            cursor: !valid || loading ? "not-allowed" : "pointer",
            opacity: !valid || loading ? 0.55 : 1, transition: "opacity 0.15s",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
          }}
        >
          {loading ? <><Spinner size={15} color="#fff" /> Sending…</> : "Send magic link"}
        </button>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "24px 0" }}>
          <div style={{ flex: 1, height: "1px", background: C.border }} />
          <span style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body }}>or</span>
          <div style={{ flex: 1, height: "1px", background: C.border }} />
        </div>

        {/* MetaMask */}
        <button
          onClick={() => { setError(""); connectWallet(); }}
          style={{
            width: "100%", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: "8px",
            padding: "14px", color: C.textSec, fontFamily: F.body, fontSize: "15px", fontWeight: 600,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
            transition: "border-color 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = C.purple)}
          onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M21.315 5.1L13.41 11.07l1.47-3.465L21.315 5.1z" fill="#E2761B" />
            <path d="M2.685 5.1l7.845 6.03-1.395-3.525L2.685 5.1z" fill="#E4761B" />
          </svg>
          Connect MetaMask instead
        </button>

        {/* Fine print */}
        <p style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body, textAlign: "center", marginTop: "24px", lineHeight: 1.5 }}>
          By continuing you agree to Byuld's <span style={{ color: C.purple, cursor: "pointer" }}>Terms of Service</span>
        </p>
      </div>
    </div>
  );
}
