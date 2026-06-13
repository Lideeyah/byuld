import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { C, F } from "../tokens";
import Logo from "../components/layout/Logo";
import { setDemo } from "../lib/demo";

// Entry point for the self-running demo. Seeds a clean authed session and starts
// the founder run; the per-screen autopilots take it from here.
export default function DemoStart() {
  const navigate = useNavigate();

  useEffect(() => {
    try {
      localStorage.setItem("byuld_seen_howto", "1"); // we'll show it deliberately in-build
      localStorage.setItem("byuld_session", JSON.stringify({
        email: "demo@byuld.xyz",
        walletAddress: "0x7e10f4781e11f5b64Af32Ca0758bE7115654493c",
        isAuthenticated: true,
        persona: null,
        programmingLanguages: [],
        goal: "", projectName: "", contractType: "escrow", chain: "sepolia",
        tokensUsed: 0, tokensLimit: 1000000,
        contractAddress: "", txHash: "", deployedAt: 0,
        sections: [], currentSection: 0, messages: [],
      }));
    } catch { /* ignore */ }
    setDemo("founder");
    // Hard reload into onboarding so AppContext picks up the seeded session.
    const t = setTimeout(() => { window.location.href = "/onboarding/persona"; }, 1400);
    return () => clearTimeout(t);
  }, [navigate]);

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
