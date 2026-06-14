import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { C, F } from "../tokens";
import Logo from "../components/layout/Logo";
import { setDemo } from "../lib/demo";
import { useApp } from "../context/AppContext";

// Entry point for the self-running demo. Resets to a clean authed session and
// starts the founder run; the per-screen autopilots take it from here.
export default function DemoStart() {
  const navigate = useNavigate();
  const { dispatch } = useApp();

  useEffect(() => {
    try { localStorage.setItem("byuld_seen_howto", "1"); } catch { /* ignore */ }
    // Wake the API immediately (Render free tier cold-starts ~50s). Pinging at the
    // very start of the demo gives it time to be warm before the first AI review and,
    // crucially, before the real on-chain deploy — so the deploy is fast (~18s) instead
    // of cold (~60s, which both looks stuck and can exceed the proxy timeout).
    fetch("/api/health").catch(() => {});
    // Drive AppContext directly — never go through a reload, so a stale prior
    // session in localStorage can't clobber the seed (that was the old bug).
    dispatch({ type: "RESET_SESSION", persona: null });
    setDemo("founder");
    const t = setTimeout(() => navigate("/onboarding/persona"), 1400);
    return () => clearTimeout(t);
  }, [navigate, dispatch]);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "24px" }}>
      <Logo size="lg" />
      <div style={{ fontSize: "15px", color: C.textSec, fontFamily: F.body }}>Starting the Byuld walkthrough…</div>
      <div style={{ width: "160px", height: "3px", background: C.surface2, borderRadius: "2px", overflow: "hidden" }}>
        <div style={{ height: "100%", width: "40%", background: C.purple, borderRadius: "2px", animation: "demoBar 1.2s ease-in-out infinite" }} />
      </div>
      <style>{`@keyframes demoBar { 0%{margin-left:-40%} 100%{margin-left:100%} }`}</style>
    </div>
  );
}
