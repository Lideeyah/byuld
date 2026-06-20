import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { C, F, R } from "../../tokens";
import Logo from "../../components/layout/Logo";
import Button from "../../components/ui/Button";
import Textarea from "../../components/ui/Textarea";
import { useApp } from "../../context/AppContext";
import ProgressStep from "../../components/ui/ProgressStep";
import Spinner from "../../components/ui/Spinner";
import { useIsMobile } from "../../hooks/useIsMobile";
import { getDemo, DEMO_CONTENT, sleep } from "../../lib/demo";
import { apiUrl } from "../../lib/api";
import { trackStage, trackProjectSelected } from "../../lib/analytics";
import { STARTERS, type Starter } from "../../lib/starters";

const STEPS = ["You", "Wallet", "Chain", "Goal", "Review"];

export default function GoalCapture() {
  const navigate = useNavigate();
  const { state, dispatch } = useApp();
  const isMobile = useIsMobile(640);
  const [goal, setGoal] = useState("");
  // The custom free-text box is collapsed by default (beginners pick a card);
  // the demo types into it, so auto-open there.
  const [showCustom, setShowCustom] = useState(!!getDemo());
  const [hov, setHov] = useState<string | null>(null);
  const loading = false;

  const canContinue = goal.trim().length >= 15;

  // Shared launch: set the goal/type, record it, and head into the plan flow.
  const launch = (g: string, contractType: string, projectName: string, project: string, custom: boolean) => {
    sessionStorage.removeItem("byuld_intent");
    trackProjectSelected(project, custom);
    trackStage("onboarding_complete", { project });
    dispatch({ type: "SET_GOAL", goal: g, contractType, projectName });
    navigate("/onboarding/review");
    // Fire-and-forget: cache a friendly description for the review screen.
    fetch(apiUrl("/api/classify-goal"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: g, persona: state.persona ?? "founder" }),
    }).then(r => r.ok ? r.json() : null).then(d => { if (d) sessionStorage.setItem("byuld_intent", JSON.stringify(d)); }).catch(() => {});
  };

  const startStarter = (s: Starter) => launch(s.goal, s.contractType, s.name, s.contractType, false);
  const handleContinue = () => { if (canContinue) launch(goal.trim(), "escrow", "New Build", "custom", true); };

  // ── Demo autopilot: type the goal into the custom box, then submit ───────────
  useEffect(() => {
    const demo = getDemo();
    if (!demo) return;
    let cancelled = false;
    (async () => {
      await sleep(900);
      const g = DEMO_CONTENT[demo.persona].goal;
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
      fetch(apiUrl("/api/classify-goal"), {
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

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 20px 64px" }}>
      <div style={{ width: "100%", maxWidth: "720px" }}>
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <Logo size="md" />
          <div style={{ marginTop: "32px", marginBottom: "12px" }}>
            <ProgressStep steps={STEPS} current={3} />
          </div>
          <h1 style={{ fontSize: "26px", fontWeight: 700, fontFamily: F.display, color: C.white, marginTop: "28px", marginBottom: "8px" }}>
            Pick something to build
          </h1>
          <p style={{ fontSize: "14px", color: C.textSec, fontFamily: F.body, lineHeight: 1.6 }}>
            Start with a guided project — you'll understand every line as you build it.
          </p>
        </div>

        {/* Starter gallery — one click to begin */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px" }}>
          {STARTERS.map(s => {
            const isHov = hov === s.id;
            return (
              <button
                key={s.id}
                onClick={() => startStarter(s)}
                onMouseEnter={() => setHov(s.id)}
                onMouseLeave={() => setHov(null)}
                style={{
                  textAlign: "left", cursor: "pointer", padding: "16px 18px",
                  background: isHov ? `${C.purple}0E` : C.surface,
                  border: `1px solid ${isHov ? C.purple : C.border}`,
                  borderRadius: R.lg, transition: "all 0.14s", display: "flex", flexDirection: "column", gap: "10px",
                  boxShadow: isHov ? `0 0 0 1px ${C.purple}44` : "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ width: "38px", height: "38px", borderRadius: "10px", flexShrink: 0, background: isHov ? `${C.purple}22` : C.surface2, border: `1px solid ${isHov ? C.purple + "55" : C.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: isHov ? C.purple : C.textSec, transition: "all 0.14s" }}>
                    <s.Icon size={19} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "15px", fontWeight: 600, color: C.white, fontFamily: F.body, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
                      {s.recommended && <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: C.mint, background: `${C.mint}18`, border: `1px solid ${C.mint}33`, borderRadius: R.full, padding: "1px 7px", whiteSpace: "nowrap", flexShrink: 0 }}>Good first build</span>}
                    </div>
                    <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, marginTop: "2px" }}>
                      {s.difficulty} · ~{s.minutes} min
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: "12.5px", color: C.textSec, fontFamily: F.body, lineHeight: 1.5 }}>{s.blurb}</div>
                <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body }}>
                  You'll learn: {s.concepts.join(" · ")}
                </div>
              </button>
            );
          })}
        </div>

        {/* Custom idea — collapsed so beginners aren't faced with a blank page */}
        <div style={{ marginTop: "20px" }}>
          {!showCustom ? (
            <button onClick={() => setShowCustom(true)} style={{ background: "none", border: "none", cursor: "pointer", color: C.purple, fontFamily: F.body, fontSize: "13px", padding: "4px 0" }}>
              Have your own idea? Describe it instead ▾
            </button>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ fontSize: "13px", color: C.textSec, fontFamily: F.body }}>Describe what you want to build, in plain language:</div>
              <Textarea
                value={goal}
                onChange={e => setGoal(e.target.value)}
                placeholder={`e.g. "A safe way to pay someone without trusting them upfront"`}
                maxChars={500}
                style={{ minHeight: "100px" }}
                autoFocus
              />
              <Button fullWidth size="lg" disabled={!canContinue || loading} onClick={handleContinue} style={{ gap: "10px" }}>
                {loading ? <><Spinner size={16} color="#fff" /> Byuld is reading your idea…</> : "Analyse my idea →"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
