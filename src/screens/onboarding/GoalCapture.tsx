import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { C, F, R } from "../../tokens";
import Logo from "../../components/layout/Logo";
import Button from "../../components/ui/Button";
import Textarea from "../../components/ui/Textarea";
import { useApp } from "../../context/AppContext";
import ProgressStep from "../../components/ui/ProgressStep";
import Spinner from "../../components/ui/Spinner";
import { getDemo, DEMO_CONTENT, sleep } from "../../lib/demo";

const STEPS = ["You", "Wallet", "Chain", "Goal", "Review"];

const EXAMPLES = [
  "A secure way to pay someone without trusting them upfront",
  "An escrow for trading goods online",
  "Holding a freelancer's payment until the work is delivered",
  "A safe deposit between a buyer and seller with a referee",
  "Releasing funds only when both sides are happy",
];

export default function GoalCapture() {
  const navigate = useNavigate();
  const { state, dispatch } = useApp();
  const [goal, setGoal] = useState("");
  const [showExamples, setShowExamples] = useState(false);
  const loading = false;

  const canContinue = goal.trim().length >= 15;

  // ── Demo autopilot: type the goal, then submit ──────────────────────────────
  useEffect(() => {
    const demo = getDemo();
    if (!demo) return;
    let cancelled = false;
    (async () => {
      await sleep(900);
      const g = DEMO_CONTENT[demo.persona].goal;
      // animate typing word by word
      const words = g.split(" ");
      let acc = "";
      for (const w of words) {
        if (cancelled) return;
        acc += (acc ? " " : "") + w;
        setGoal(acc);
        await sleep(70);
      }
      await sleep(900);
      if (cancelled) return;
      sessionStorage.removeItem("byuld_intent");
      dispatch({ type: "SET_GOAL", goal: g, contractType: "escrow", projectName: "Escrow Contract" });
      // Upgrade to the friendly AI name (e.g. "Marketplace Payment Escrow") when it lands.
      fetch("/api/classify-goal", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: g, persona: demo.persona }),
      }).then(r => r.ok ? r.json() : null).then(d => {
        if (!d) return;
        sessionStorage.setItem("byuld_intent", JSON.stringify(d));
        if (d.projectName) dispatch({ type: "SET_GOAL", goal: g, contractType: "escrow", projectName: d.projectName });
      }).catch(() => {});
      navigate("/onboarding/review");
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleContinue = () => {
    if (!canContinue || loading) return;
    const g = goal.trim();
    // V1: every goal maps to escrow — no need to WAIT on the API to move forward.
    // Set a sensible name now, navigate instantly, and personalise in the background.
    // Generic placeholder; IntentReview generates the real tailored name (plan.projectName).
    sessionStorage.removeItem("byuld_intent");
    dispatch({ type: "SET_GOAL", goal: g, contractType: "escrow", projectName: "New Build" });
    navigate("/onboarding/review");

    // Fire-and-forget: cache a description for the review screen's escrow fallback.
    fetch("/api/classify-goal", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: g, persona: state.persona ?? "founder" }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) sessionStorage.setItem("byuld_intent", JSON.stringify(data)); })
      .catch(() => {});
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
      <div style={{ width: "100%", maxWidth: "540px" }}>
        <div style={{ textAlign: "center", marginBottom: "36px" }}>
          <Logo size="md" />
          <div style={{ marginTop: "32px", marginBottom: "12px" }}>
            <ProgressStep steps={STEPS} current={3} />
          </div>
          <h1 style={{ fontSize: "26px", fontWeight: 700, fontFamily: F.display, color: C.white, marginTop: "28px", marginBottom: "8px" }}>
            What do you want to build?
          </h1>
          <p style={{ fontSize: "14px", color: C.textSec, fontFamily: F.body, lineHeight: 1.6 }}>
            Describe it in plain language. No technical terms needed.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "24px" }}>
          <Textarea
            value={goal}
            onChange={e => setGoal(e.target.value)}
            placeholder={`e.g. "${EXAMPLES[0]}"`}
            maxChars={500}
            style={{ minHeight: "120px" }}
            autoFocus
          />

          <button onClick={() => setShowExamples(!showExamples)} style={{ background: "none", border: "none", cursor: "pointer", color: C.purple, fontFamily: F.body, fontSize: "12px", textAlign: "left", padding: 0 }}>
            {showExamples ? "Hide examples" : "Not sure? See examples ▾"}
          </button>

          {showExamples && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.md, overflow: "hidden" }}>
              {EXAMPLES.map((ex, i) => (
                <button key={i} onClick={() => { setGoal(ex); setShowExamples(false); }} style={{ width: "100%", padding: "11px 16px", textAlign: "left", background: "transparent", border: "none", borderBottom: i < EXAMPLES.length - 1 ? `1px solid ${C.border}` : "none", color: C.textSec, fontFamily: F.body, fontSize: "13px", cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget.style.background = C.surface2)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                  {ex}
                </button>
              ))}
            </div>
          )}
        </div>

        <Button fullWidth size="lg" disabled={!canContinue || loading} onClick={handleContinue} style={{ gap: "10px" }}>
          {loading ? <><Spinner size={16} color="#fff" /> Byuld is reading your idea…</> : "Analyse my idea →"}
        </Button>
      </div>
    </div>
  );
}
