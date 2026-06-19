import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useLoginWithEmail } from "@privy-io/react-auth";
import { C, F, R } from "../../tokens";
import Logo from "../../components/layout/Logo";
import Button from "../../components/ui/Button";
import { useApp } from "../../context/AppContext";
import { resolveAuthDestination } from "../../lib/auth";
import type { Persona, ExperienceLevel } from "../../types";

export default function CheckEmail() {
  const navigate = useNavigate();
  const { state, dispatch } = useApp();
  const { loginWithCode, sendCode } = useLoginWithEmail({
    async onComplete(args) {
      // Returning user → straight to their dashboard. New user → onboarding.
      // Privy's `isNewUser === false` means this account has signed in before, so
      // even without a server record we skip onboarding. Works on any device.
      const a = args as { isNewUser?: boolean; user?: { email?: { address?: string } } };
      const email = state.email || a?.user?.email?.address || "";
      const priorAccount = a?.isNewUser === false;
      const dest = await resolveAuthDestination(email, state.persona, priorAccount);
      if (dest.persona) {
        dispatch({ type: "SET_PERSONA", persona: dest.persona as Persona });
        if (dest.experienceLevel) dispatch({ type: "SET_EXPERIENCE", level: dest.experienceLevel as ExperienceLevel });
      }
      navigate(dest.path, { replace: true });
    },
    onError(err) {
      setError(typeof err === "string" ? err : "Invalid code. Please try again.");
      setLoading(false);
    },
  });

  const [code, setCode]       = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [countdown, setCountdown] = useState(60);
  const [resent, setResent]   = useState(false);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown(c => c - 1), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  const handleVerify = async () => {
    if (code.length < 6 || loading) return;
    setLoading(true);
    setError("");
    try {
      await loginWithCode({ code });
      // onComplete callback handles navigation
    } catch {
      // onError handles the message
    }
  };

  const handleResend = async () => {
    if (countdown > 0 || !state.email) return;
    setCountdown(60);
    setResent(true);
    setError("");
    setTimeout(() => setResent(false), 3000);
    try {
      await sendCode({ email: state.email });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to resend. Try again.";
      setError(msg);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", background: C.bg,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "40px 20px",
    }}>
      <div style={{ width: "100%", maxWidth: "400px", textAlign: "center" }}>
        <div style={{ marginBottom: "32px" }}>
          <Logo size="md" />
        </div>

        {/* Email icon */}
        <div style={{
          width: "72px", height: "72px", borderRadius: "18px",
          background: `${C.purple}18`, border: `1px solid ${C.purple}33`,
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 28px", fontSize: "32px",
        }}>
          ✉
        </div>

        <h2 style={{ fontSize: "24px", fontWeight: 700, fontFamily: F.display, color: C.white, marginBottom: "12px" }}>
          Check your inbox
        </h2>
        <p style={{ fontSize: "14px", color: C.textSec, fontFamily: F.body, lineHeight: 1.6, marginBottom: "28px" }}>
          We sent a 6-digit code to{" "}
          <strong style={{ color: C.white }}>{state.email || "your email"}</strong>.
        </p>

        {/* OTP input */}
        <div style={{ marginBottom: "16px", textAlign: "left" }}>
          <label style={{ fontSize: "12px", color: C.textSec, fontFamily: F.body, fontWeight: 500, display: "block", marginBottom: "6px" }}>
            Enter code
          </label>
          <input
            value={code}
            onChange={e => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
            onKeyDown={e => e.key === "Enter" && handleVerify()}
            placeholder="000000"
            autoFocus
            inputMode="numeric"
            style={{
              width: "100%", padding: "12px 16px",
              background: C.surface2,
              border: `1px solid ${error ? C.danger : C.border}`,
              borderRadius: R.md,
              color: C.white, fontFamily: F.mono, fontSize: "22px",
              letterSpacing: "0.25em", textAlign: "center",
              outline: "none", transition: "border-color 0.15s",
              boxSizing: "border-box",
            }}
          />
          {error && (
            <p style={{ fontSize: "12px", color: C.danger, fontFamily: F.body, marginTop: "6px" }}>{error}</p>
          )}
        </div>

        {resent && (
          <div style={{
            padding: "10px 16px", borderRadius: "8px",
            background: `${C.mint}12`, border: `1px solid ${C.mint}33`,
            fontSize: "13px", color: C.mint, fontFamily: F.body, marginBottom: "12px",
          }}>
            ✓ New code sent!
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <Button fullWidth onClick={handleVerify} disabled={code.length < 6 || loading}>
            {loading ? "Verifying…" : "Verify code →"}
          </Button>

          <button
            onClick={handleResend}
            disabled={countdown > 0}
            style={{
              background: "none", border: "none", cursor: countdown > 0 ? "not-allowed" : "pointer",
              color: countdown > 0 ? C.textMute : C.purple, fontFamily: F.body, fontSize: "13px",
              padding: "8px",
            }}
          >
            {countdown > 0 ? `Resend code in ${countdown}s` : "Resend code"}
          </button>

          <button
            onClick={() => navigate("/auth")}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: C.textMute, fontFamily: F.body, fontSize: "12px",
            }}
          >
            Use a different email
          </button>
        </div>
      </div>
    </div>
  );
}
