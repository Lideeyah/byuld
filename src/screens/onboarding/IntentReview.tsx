import { useNavigate } from "react-router-dom";
import { C, F, R } from "../../tokens";
import Logo from "../../components/layout/Logo";
import Button from "../../components/ui/Button";
import { useApp } from "../../context/AppContext";
import ProgressStep from "../../components/ui/ProgressStep";
import { getSections } from "../../lib/contracts";
import type { Section } from "../../types";

const STEPS = ["You", "Wallet", "Chain", "Goal", "Review"];

const WILL_BUILD = [
  "A state machine defining the payment stages",
  "Access-control rules for the buyer, seller, and arbiter",
  "A deposit function that locks payment securely",
  "Dispute resolution with safe payout logic",
];

const SECURITY = ["Reentrancy protection", "Access-control verification", "State-machine integrity"];

function readIntent(): { projectName?: string; description?: string } {
  try { return JSON.parse(sessionStorage.getItem("byuld_intent") ?? "{}"); } catch { return {}; }
}

export default function IntentReview() {
  const navigate = useNavigate();
  const { state, dispatch } = useApp();
  const intent = readIntent();
  const projectName = state.projectName || intent.projectName || "Your Escrow Contract";
  const description = intent.description || "A secure way to hold a payment between two parties, released only when the deal is done.";

  const startBuilding = () => {
    const sections: Section[] = getSections().map((def, i) => ({
      id: def.id, title: def.title, status: i === 0 ? "active" : "locked", code: "",
    }));
    dispatch({ type: "SET_SECTIONS", sections });
    navigate("/build");
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
      <div style={{ width: "100%", maxWidth: "560px" }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <Logo size="md" />
          <div style={{ marginTop: "32px", marginBottom: "12px" }}>
            <ProgressStep steps={STEPS} current={4} />
          </div>
          <h1 style={{ fontSize: "26px", fontWeight: 700, fontFamily: F.display, color: C.white, marginTop: "28px", marginBottom: "8px" }}>
            Here's what Byuld understood
          </h1>
          <p style={{ fontSize: "14px", color: C.textSec, fontFamily: F.body }}>
            Review this, then start building it line by line.
          </p>
        </div>

        {/* Project overview */}
        <div style={{ padding: "20px 22px", background: C.surface, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.purple}`, borderRadius: R.lg, marginBottom: "16px" }}>
          <div style={{ fontSize: "11px", color: C.purple, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "8px" }}>Your project</div>
          <div style={{ fontSize: "18px", fontWeight: 700, fontFamily: F.display, color: C.white, marginBottom: "6px" }}>{projectName}</div>
          <div style={{ fontSize: "13px", color: C.textMute, fontFamily: F.body, marginBottom: "10px" }}>Contract type: <span style={{ color: C.textSec }}>P2P Escrow Contract</span></div>
          <p style={{ fontSize: "13px", color: C.textSec, fontFamily: F.body, lineHeight: 1.6, margin: 0 }}>{description}</p>
        </div>

        {/* What you'll build */}
        <div style={{ padding: "18px 22px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.lg, marginBottom: "12px" }}>
          <div style={{ fontSize: "11px", color: C.textMute, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "12px" }}>What you'll build</div>
          {WILL_BUILD.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start", marginBottom: i < WILL_BUILD.length - 1 ? "10px" : 0 }}>
              <span style={{ color: C.purple, fontSize: "13px", flexShrink: 0, fontFamily: F.mono }}>{String(i + 1).padStart(2, "0")}</span>
              <span style={{ fontSize: "13px", color: C.textSec, fontFamily: F.body, lineHeight: 1.5 }}>{item}</span>
            </div>
          ))}
        </div>

        {/* Security */}
        <div style={{ padding: "16px 22px", background: `${C.mint}08`, border: `1px solid ${C.mint}22`, borderRadius: R.lg, marginBottom: "24px" }}>
          <div style={{ fontSize: "11px", color: C.mint, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "10px" }}>Security built in</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {SECURITY.map(s => (
              <span key={s} style={{ fontSize: "12px", color: C.textSec, fontFamily: F.body, padding: "4px 10px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.full }}>✓ {s}</span>
            ))}
          </div>
        </div>

        <Button fullWidth size="lg" onClick={startBuilding}>Start Building →</Button>
        <button onClick={() => navigate("/onboarding/goal")} style={{ width: "100%", marginTop: "12px", background: "none", border: "none", color: C.textMute, fontFamily: F.body, fontSize: "12px", cursor: "pointer" }}>
          ← Edit my description
        </button>
      </div>
    </div>
  );
}
