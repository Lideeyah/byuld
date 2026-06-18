import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { C, F, R } from "../../tokens";
import Logo from "../../components/layout/Logo";
import Button from "../../components/ui/Button";
import Spinner from "../../components/ui/Spinner";
import { useApp } from "../../context/AppContext";
import ProgressStep from "../../components/ui/ProgressStep";
import { getSections } from "../../lib/contracts";
import type { Section, BuildPlan } from "../../types";
import { getDemo } from "../../lib/demo";
import { getContext } from "../../lib/learnContent";
import { Check } from "lucide-react";

const STEPS = ["You", "Wallet", "Chain", "Goal", "Review"];

// Escrow (demo) defaults — shown only on the self-running demo path.
const ESCROW_WILL_BUILD = [
  "A state machine defining the payment stages",
  "Access-control rules for the buyer, seller, and arbiter",
  "A deposit function that locks payment securely",
  "Dispute resolution with safe payout logic",
];
const ESCROW_SECURITY = ["Reentrancy protection", "Access-control verification", "State-machine integrity"];

const LOADING_LINES = [
  "Reading your idea…",
  "Choosing the right contract pattern…",
  "Breaking it into steps you'll build yourself…",
  "Writing the guidance for each part…",
  "Compiling a reference to check your work against…",
  "Almost there — finishing your tailored build…",
];

function readIntent(): { projectName?: string; description?: string } {
  try { return JSON.parse(sessionStorage.getItem("byuld_intent") ?? "{}"); } catch { return {}; }
}

export default function IntentReview() {
  const navigate = useNavigate();
  const { state, dispatch } = useApp();
  const demo = !!getDemo();
  const intent = readIntent();

  const [plan, setPlan] = useState<BuildPlan | null>(state.buildPlan);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">(
    demo || state.buildPlan ? "ready" : "loading"
  );
  const [err, setErr] = useState("");
  const [line, setLine] = useState(0);
  const started = useRef(false);

  // Generate the tailored build for real users (the demo always uses escrow).
  useEffect(() => {
    if (demo || state.buildPlan || started.current) return;
    started.current = true;
    let cancelled = false;
    const tick = setInterval(() => setLine(l => (l + 1) % LOADING_LINES.length), 9000);
    (async () => {
      try {
        const res = await fetch("/api/generate-build-plan", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ goal: state.goal, persona: state.persona ?? "founder", programmingLanguages: state.programmingLanguages }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || data.error || !data.sections?.length) {
          setErr(data.error || "Byuld couldn't design this build. Try rewording your idea."); setPhase("error"); return;
        }
        dispatch({ type: "SET_BUILD_PLAN", plan: data });
        setPlan(data);
        setPhase("ready");
      } catch {
        if (!cancelled) { setErr("Network error while designing your build."); setPhase("error"); }
      }
    })();
    return () => { cancelled = true; clearInterval(tick); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startBuilding = () => {
    // Generated builds already have their sections set by SET_BUILD_PLAN.
    if (demo || !plan) {
      const sections: Section[] = getSections().map((def, i) => ({
        id: def.id, title: def.title, status: i === 0 ? "active" : "locked", code: "",
      }));
      dispatch({ type: "SET_SECTIONS", sections });
    }
    // P3: pass through the Web3 mental-model primer before the editor.
    navigate("/onboarding/primer");
  };

  // Demo autopilot: pause to show the plan, then start building.
  useEffect(() => {
    if (!getDemo()) return;
    const t = setTimeout(startBuilding, 3200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (phase === "loading") {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
        <div style={{ width: "100%", maxWidth: "460px", textAlign: "center" }}>
          <Logo size="md" />
          <div style={{ margin: "36px auto 24px", width: "52px", height: "52px", borderRadius: "16px", background: `${C.purple}18`, border: `1px solid ${C.purple}33`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Spinner size={22} color={C.purple} />
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, fontFamily: F.display, color: C.white, marginBottom: "10px" }}>
            Designing your build
          </h1>
          <p style={{ fontSize: "14px", color: C.textSec, fontFamily: F.body, minHeight: "22px", transition: "opacity 0.3s" }}>
            {LOADING_LINES[line]}
          </p>
          <p style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body, marginTop: "20px" }}>
            Byuld is tailoring a real contract to your idea — this takes a moment.
          </p>
        </div>
      </div>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────────
  if (phase === "error") {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
        <div style={{ width: "100%", maxWidth: "460px", textAlign: "center" }}>
          <Logo size="md" />
          <h1 style={{ fontSize: "20px", fontWeight: 700, fontFamily: F.display, color: C.white, margin: "28px 0 10px" }}>Couldn't design that build</h1>
          <p style={{ fontSize: "13px", color: C.textSec, fontFamily: F.body, marginBottom: "24px" }}>{err}</p>
          <Button fullWidth onClick={() => navigate("/onboarding/goal")}>← Reword my idea</Button>
        </div>
      </div>
    );
  }

  // ── Ready: plan summary (dynamic for generated builds, escrow for the demo) ───
  const isGenerated = !!plan;
  const projectName = isGenerated ? (plan!.projectName || plan!.contractName) : (state.projectName || intent.projectName || "Your Escrow Contract");
  const contractLabel = isGenerated ? plan!.contractType.replace(/-/g, " ") : "P2P Escrow Contract";
  const description = isGenerated ? plan!.description : (intent.description || "A secure way to hold a payment between two parties, released only when the deal is done.");
  const willBuild = isGenerated ? plan!.sections.map(s => s.title) : ESCROW_WILL_BUILD;
  const security = isGenerated
    ? plan!.sections.filter(s => s.securityNote).map(s => s.securityNote!.title)
    : ESCROW_SECURITY;
  const ctx = getContext(plan);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
      <div style={{ width: "100%", maxWidth: "560px" }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <Logo size="md" />
          <div style={{ marginTop: "32px", marginBottom: "12px" }}>
            <ProgressStep steps={STEPS} current={4} />
          </div>
          <h1 style={{ fontSize: "26px", fontWeight: 700, fontFamily: F.display, color: C.white, marginTop: "28px", marginBottom: "8px" }}>
            What You're About To Build
          </h1>
          <p style={{ fontSize: "14px", color: C.textSec, fontFamily: F.body }}>
            A quick overview before you start. <span style={{ color: C.textMute }}>· ~{ctx.estimatedMinutes} min</span>
          </p>
        </div>

        <div style={{ padding: "20px 22px", background: C.surface, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.purple}`, borderRadius: R.lg, marginBottom: "16px" }}>
          <div style={{ fontSize: "11px", color: C.purple, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "8px" }}>Your project</div>
          <div style={{ fontSize: "18px", fontWeight: 700, fontFamily: F.display, color: C.white, marginBottom: "6px" }}>{projectName}</div>
          <div style={{ fontSize: "13px", color: C.textMute, fontFamily: F.body, marginBottom: "10px", textTransform: "capitalize" }}>Contract type: <span style={{ color: C.textSec }}>{contractLabel}</span></div>
          <p style={{ fontSize: "13px", color: C.textSec, fontFamily: F.body, lineHeight: 1.6, margin: 0 }}>{description}</p>
        </div>

        <div style={{ padding: "18px 22px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.lg, marginBottom: "12px" }}>
          <div style={{ fontSize: "11px", color: C.textMute, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "12px" }}>What you'll build</div>
          {willBuild.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start", marginBottom: i < willBuild.length - 1 ? "10px" : 0 }}>
              <span style={{ color: C.purple, fontSize: "13px", flexShrink: 0, fontFamily: F.mono }}>{String(i + 1).padStart(2, "0")}</span>
              <span style={{ fontSize: "13px", color: C.textSec, fontFamily: F.body, lineHeight: 1.5 }}>{item}</span>
            </div>
          ))}
        </div>

        {security.length > 0 && (
          <div style={{ padding: "16px 22px", background: `${C.mint}08`, border: `1px solid ${C.mint}22`, borderRadius: R.lg, marginBottom: "24px" }}>
            <div style={{ fontSize: "11px", color: C.mint, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "10px" }}>Security checked before deploy</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {security.map(s => (
                <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12px", color: C.textSec, fontFamily: F.body, padding: "4px 10px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.full }}><Check size={12} color={C.mint} /> {s}</span>
              ))}
            </div>
          </div>
        )}

        {/* P2: key concepts + why they matter */}
        {ctx.keyConcepts.length > 0 && (
          <div style={{ padding: "18px 22px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.lg, marginBottom: "24px" }}>
            <div style={{ fontSize: "11px", color: C.textMute, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "14px" }}>Key concepts — and why they matter</div>
            {ctx.keyConcepts.map((k, i) => (
              <div key={i} style={{ marginBottom: i < ctx.keyConcepts.length - 1 ? "12px" : 0 }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: C.white, fontFamily: F.body, marginBottom: "2px" }}>{k.concept}</div>
                <div style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body, lineHeight: 1.5 }}>{k.why}</div>
              </div>
            ))}
          </div>
        )}

        <Button fullWidth size="lg" onClick={startBuilding}>Start Building →</Button>
        <button onClick={() => navigate("/onboarding/goal")} style={{ width: "100%", marginTop: "12px", background: "none", border: "none", color: C.textMute, fontFamily: F.body, fontSize: "12px", cursor: "pointer" }}>
          ← Edit my description
        </button>
      </div>
    </div>
  );
}
