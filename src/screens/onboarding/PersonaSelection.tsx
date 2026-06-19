import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Lightbulb, GraduationCap, Code2, Zap } from "lucide-react";
import { C, F, R } from "../../tokens";
import Logo from "../../components/layout/Logo";
import Button from "../../components/ui/Button";
import { useApp } from "../../context/AppContext";
import type { Persona, ExperienceLevel } from "../../types";
import ProgressStep from "../../components/ui/ProgressStep";
import { getDemo, DEMO_CONTENT, sleep } from "../../lib/demo";
import { apiUrl } from "../../lib/api";
import { useScreenTime } from "../../lib/analytics";

// Self-described experience level (P1). Each maps onto the existing two-tone
// persona ("founder" plain-language vs "developer" technical) and also records the
// finer level for adaptive explanations (P4) and admin analytics.
const OPTIONS: { level: Exclude<ExperienceLevel, null>; persona: Persona; Icon: typeof Lightbulb; title: string; desc: string }[] = [
  { level: "founder",   persona: "founder",   Icon: Lightbulb,     title: "Non-Technical Founder", desc: "I have a product idea but I'm not a developer. Byuld teaches you as you build — plain English, no jargon." },
  { level: "student",   persona: "founder",   Icon: GraduationCap, title: "Student", desc: "I'm here to learn. Byuld explains the concepts as you go, with extra context where it helps." },
  { level: "developer", persona: "developer", Icon: Code2,         title: "Developer", desc: "I can code but I'm new to Web3. Map what I already know to blockchain patterns — less hand-holding." },
  { level: "expert",    persona: "developer", Icon: Zap,           title: "Experienced Web3 Builder", desc: "I know smart contracts. Keep explanations minimal and let me move fast." },
];

const LANGUAGES = ["JavaScript", "TypeScript", "Python", "Java", "Rust", "Go", "Other"];

const personaOf = (level: ExperienceLevel): Persona =>
  level === "developer" || level === "expert" ? "developer" : "founder";

export default function PersonaSelection() {
  const navigate = useNavigate();
  const { state, dispatch } = useApp();
  const [selected, setSelected] = useState<ExperienceLevel>(null);
  const [hov, setHov] = useState<ExperienceLevel>(null);
  useScreenTime("onboarding");
  const [langs, setLangs] = useState<string[]>([]);

  const persona = personaOf(selected);
  const toggleLang = (l: string) =>
    setLangs(prev => prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l]);

  // Only the "Developer" level must pick languages (used for analogies); experts can skip.
  const canContinue = !!selected && (selected !== "developer" || langs.length > 0);

  const commit = (level: ExperienceLevel, languages: string[]) => {
    const p = personaOf(level);
    dispatch({ type: "SET_PERSONA", persona: p });
    dispatch({ type: "SET_EXPERIENCE", level });
    if (p === "developer" && languages.length) dispatch({ type: "SET_LANGUAGES", languages });
    // Record the onboarding role for analytics (best-effort).
    if (state.email) {
      fetch(apiUrl("/api/track"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: state.email, persona: p, experienceLevel: level, stage: "onboarding" }),
      }).catch(() => {});
    }
  };

  const handleContinue = () => {
    if (!canContinue) return;
    commit(selected, langs);
    navigate("/onboarding/wallet");
  };

  // ── Demo autopilot ──────────────────────────────────────────────────────────
  useEffect(() => {
    const demo = getDemo();
    if (!demo) return;
    const level: ExperienceLevel = demo.persona === "developer" ? "developer" : "founder";
    let cancelled = false;
    (async () => {
      await sleep(1100);
      if (cancelled) return;
      setSelected(level);
      let languages: string[] = [];
      if (demo.persona === "developer") {
        await sleep(700);
        for (const l of DEMO_CONTENT.developer.languages) {
          if (cancelled) return;
          setLangs(prev => prev.includes(l) ? prev : [...prev, l]);
          await sleep(400);
        }
        languages = DEMO_CONTENT.developer.languages;
      }
      await sleep(900);
      if (cancelled) return;
      commit(level, languages);
      navigate("/onboarding/wallet");
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{
      minHeight: "100vh", background: C.bg,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "40px 20px",
    }}>
      <div style={{ width: "100%", maxWidth: "560px" }}>
        <div style={{ textAlign: "center", marginBottom: "36px" }}>
          <Logo size="md" />
          <div style={{ marginTop: "32px", marginBottom: "12px" }}>
            <ProgressStep steps={["You", "Wallet", "Chain", "Goal", "Review"]} current={0} />
          </div>
          <h1 style={{ fontSize: "28px", fontWeight: 700, fontFamily: F.display, color: C.white, marginBottom: "8px", marginTop: "28px" }}>
            Welcome to Byuld. Let's build something.
          </h1>
          <p style={{ fontSize: "14px", color: C.textSec, fontFamily: F.body }}>
            How would you describe yourself?
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "24px" }}>
          {OPTIONS.map(opt => {
            const isSelected = selected === opt.level;
            const isHov = hov === opt.level;
            return (
              <button
                key={opt.level}
                onClick={() => setSelected(opt.level)}
                onMouseEnter={() => setHov(opt.level)}
                onMouseLeave={() => setHov(null)}
                style={{
                  padding: "18px 20px",
                  background: isSelected ? `${C.purple}12` : C.surface,
                  border: `1px solid ${isSelected ? C.purple : C.border}`,
                  borderRadius: R.lg, cursor: "pointer", textAlign: "left", transition: "all 0.15s",
                  boxShadow: isSelected ? `0 0 0 1px ${C.purple}44` : "none",
                  display: "flex", gap: "16px", alignItems: "flex-start", outline: "none",
                }}
              >
                <div style={{
                  width: "40px", height: "40px", borderRadius: R.lg, flexShrink: 0,
                  background: isSelected ? `${C.purple}25` : C.surface2,
                  border: `1px solid ${isSelected ? C.purple + "55" : C.border}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: isSelected ? C.purple : (isHov ? C.textSec : C.textMute), transition: "all 0.15s",
                }}>
                  <opt.Icon size={20} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "15px", fontWeight: 600, fontFamily: F.body, color: isSelected ? C.white : C.textSec, marginBottom: "3px", transition: "color 0.15s" }}>
                    {opt.title}
                  </div>
                  <div style={{ fontSize: "13px", color: C.textMute, fontFamily: F.body, lineHeight: 1.5 }}>
                    {opt.desc}
                  </div>
                </div>
                <div style={{
                  width: "20px", height: "20px", borderRadius: "50%", flexShrink: 0, marginTop: "2px",
                  border: `2px solid ${isSelected ? C.purple : C.border}`,
                  background: isSelected ? C.purple : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s",
                }}>
                  {isSelected && <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#fff" }} />}
                </div>
              </button>
            );
          })}
        </div>

        {/* Language multi-select for technical roles */}
        {persona === "developer" && (
          <div style={{ marginBottom: "24px", padding: "20px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.lg, animation: "fadeIn 0.2s ease" }}>
            <div style={{ fontSize: "14px", fontWeight: 600, color: C.white, fontFamily: F.body, marginBottom: "4px" }}>
              What languages are you familiar with?{selected === "expert" && <span style={{ color: C.textMute, fontWeight: 400 }}> (optional)</span>}
            </div>
            <div style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body, marginBottom: "14px" }}>
              Byuld uses these to explain Solidity in terms you already know.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {LANGUAGES.map(l => {
                const on = langs.includes(l);
                return (
                  <button key={l} onClick={() => toggleLang(l)} style={{
                    padding: "7px 14px", borderRadius: R.full, cursor: "pointer",
                    fontSize: "13px", fontFamily: F.body, fontWeight: 500,
                    background: on ? `${C.purple}22` : C.surface2,
                    border: `1px solid ${on ? C.purple : C.border}`,
                    color: on ? C.white : C.textMute, transition: "all 0.12s",
                  }}>
                    {on ? "✓ " : ""}{l}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <Button fullWidth size="lg" disabled={!canContinue} onClick={handleContinue}>
          Continue
        </Button>
      </div>
    </div>
  );
}
