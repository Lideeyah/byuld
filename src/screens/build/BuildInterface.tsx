import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { C, F, R } from "../../tokens";
import BuildTopBar from "../../components/layout/BuildTopBar";
import FlowProgress from "../../components/ui/FlowProgress";
import { ClipboardList, MessageCircle, Check, AlertTriangle, Code2 } from "lucide-react";
import { useIsMobile } from "../../hooks/useIsMobile";
import { apiUrl } from "../../lib/api";
import { useScreenTime, trackQuestion, trackExplanation, trackConcept } from "../../lib/analytics";
import BuildSidebar from "../../components/layout/BuildSidebar";
import EditorPanel from "../../components/build/EditorPanel";
import ChatPanel from "../../components/build/ChatPanel";
import TaskGuide from "../../components/build/TaskGuide";
import HowItWorks from "../../components/build/HowItWorks";
import Button from "../../components/ui/Button";
import Spinner from "../../components/ui/Spinner";
import { useApp, UNLIMITED_TOKENS } from "../../context/AppContext";
import { getSections, getSectionDef } from "../../lib/contracts";
import { getDemo, DEMO_SECTION_IDS, DEMO_BODY_PARTS, DEMO_CONTENT, demoPrefix, appendToContract, setEditorValue, sleep } from "../../lib/demo";
import type { SecurityIssue, BuildSectionDef } from "../../types";

async function api<T>(endpoint: string, body: object): Promise<T> {
  // Generous timeout: the API may be waking from sleep (Render cold start).
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90_000);
  try {
    const res = await fetch(apiUrl(endpoint), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ─── Security Block Modal (critical issue — cannot dismiss) ────────────────────

function SecurityBlockModal({ issue, onRecheck, checking }: {
  issue: SecurityIssue; onRecheck: () => void; checking: boolean;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(255,90,90,0.10)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ width: "100%", maxWidth: "560px", background: C.surface, border: `2px solid ${C.danger}`, borderRadius: R.xl, padding: "32px" }}>
        <div style={{ fontSize: "11px", color: C.danger, fontFamily: F.body, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "12px", display: "flex", alignItems: "center", gap: "5px" }}><AlertTriangle size={12} /> Security Issue Found</div>
        <h2 style={{ fontSize: "20px", fontWeight: 700, fontFamily: F.display, color: C.danger, marginBottom: "16px" }}>{issue.name}</h2>
        <p style={{ fontSize: "13px", color: C.textSec, fontFamily: F.body, lineHeight: 1.7, marginBottom: "16px" }}>{issue.explanation}</p>
        {issue.historicalExample && (
          <div style={{ padding: "12px 16px", background: `${C.danger}0A`, border: `1px solid ${C.danger}22`, borderRadius: R.md, marginBottom: "16px" }}>
            <div style={{ fontSize: "11px", color: C.danger, fontFamily: F.body, fontWeight: 600, marginBottom: "4px" }}>Historical example</div>
            <p style={{ fontSize: "12px", color: C.textSec, fontFamily: F.body, fontStyle: "italic", lineHeight: 1.6, margin: 0 }}>{issue.historicalExample}</p>
          </div>
        )}
        {issue.fix && (
          <div style={{ padding: "12px 16px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: R.md, marginBottom: "20px" }}>
            <div style={{ fontSize: "11px", color: C.mint, fontFamily: F.body, fontWeight: 600, marginBottom: "6px" }}>How to fix it</div>
            <p style={{ fontSize: "12px", color: C.textSec, fontFamily: F.body, lineHeight: 1.6, margin: 0 }}>{issue.fix}</p>
          </div>
        )}
        <p style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body, marginBottom: "16px" }}>Fix the code in the editor, then re-check to continue.</p>
        <Button fullWidth onClick={onRecheck} disabled={checking}>
          {checking ? <><Spinner size={14} color="#fff" /> Re-checking…</> : "Re-check my code →"}
        </Button>
      </div>
    </div>
  );
}

export default function BuildInterface() {
  const navigate = useNavigate();
  const { state, dispatch } = useApp();
  // AI-generated builds carry their own sections; otherwise fall back to escrow.
  const sections: BuildSectionDef[] = state.buildPlan?.sections?.length ? state.buildPlan.sections : getSections();

  const [aiLoading, setAiLoading] = useState(false);
  const [reviewState, setReviewState] = useState<"idle" | "reviewing" | "approved" | "rejected">("idle");
  const [tokenWarning, setTokenWarning] = useState(false);
  const [securityBlock, setSecurityBlock] = useState<SecurityIssue | null>(null);
  const [recheckLoading, setRecheckLoading] = useState(false);
  const [viewSection, setViewSection] = useState<{ code: string; title: string } | null>(null);
  const [showHowTo, setShowHowTo] = useState(() => {
    try { return !localStorage.getItem("byuld_seen_howto"); } catch { return true; }
  });
  const [rightTab, setRightTab] = useState<"guide" | "ask">("guide");
  // Mobile: the 3-column layout collapses into one panel at a time (Code / Task / Chat).
  const isMobile = useIsMobile(860);
  const [mTab, setMTab] = useState<"code" | "guide" | "ask">("code");
  // When a line-help question fires (sets rightTab "ask"), surface the chat on mobile.
  useEffect(() => { if (rightTab === "ask") setMTab("ask"); }, [rightTab]);
  // Learning analytics: time in the IDE is one of our most important signals.
  useScreenTime("ide", { stage: "ide_entered" });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialized = useRef(false);
  const codeRef = useRef("");

  const currentIdx = state.currentSection;
  const currentStateSec = state.sections[currentIdx];
  const allComplete = state.sections.length > 0 && state.sections.every(s => s.status === "complete");
  const persona = state.persona ?? "founder";

  const addMsg = useCallback((role: "byuld" | "user", content: string) => {
    dispatch({ type: "ADD_MESSAGE", message: { role, content, timestamp: Date.now() } });
  }, [dispatch]);

  const deductTokens = useCallback((count: number) => {
    dispatch({ type: "ADD_TOKENS", count });
    if (UNLIMITED_TOKENS) return; // testing: no warnings, no exhaustion wall
    const after = state.tokensUsed + count;
    if (after >= state.tokensLimit * 0.8) setTokenWarning(true);
    if (after >= state.tokensLimit) navigate("/build/tokens");
  }, [state.tokensUsed, state.tokensLimit, dispatch, navigate]);

  // ── Load a section's scaffold into the editor. SILENT — posts nothing to chat
  //    and fires no API call. All guidance lives in the Task panel; the chat only
  //    ever speaks when the user initiates (ask, send, or Check my code).
  const loadSection = useCallback((idx: number) => {
    const def = sections[idx];
    if (!def) return;
    const stateSec = state.sections[idx];
    if (stateSec && (!stateSec.code || !stateSec.code.trim())) {
      dispatch({ type: "UPDATE_SECTION_CODE", id: stateSec.id, code: def.scaffold });
      codeRef.current = def.scaffold;
    } else if (stateSec) {
      codeRef.current = stateSec.code;
    }
    dispatch({ type: "SET_MODE", mode: "C" });
    setReviewState("idle");
    // Each section teaches one concept — record the view for concept analytics.
    if (def.title) trackConcept(def.title);
  }, [sections, state.sections, dispatch]);

  // ── Init on mount — load the scaffold silently, no chat, no API ──────────────
  useEffect(() => {
    if (initialized.current) return;
    if (!state.goal) { navigate("/onboarding/goal"); return; }
    initialized.current = true;
    // Proactively wake the API (Render free tier sleeps) so the first check is instant.
    fetch(apiUrl("/api/health")).catch(() => {});
    // Record this user reaching the build, for the admin dashboard.
    if (state.email) {
      fetch(apiUrl("/api/track"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: state.email, persona: state.persona, experienceLevel: state.experienceLevel, contractType: state.contractType, chain: state.chain, tokensUsed: state.tokensUsed, stage: "building" }),
      }).catch(() => {});
    }
    loadSection(currentIdx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Mode B: review on debounce ──────────────────────────────────────────────
  const runReview = useCallback(async (code: string) => {
    const def = sections[currentIdx];
    if (!def) return;
    // Don't review an untouched scaffold
    const stripped = code.replace(/\/\/.*$/gm, "").trim();
    const scaffoldStripped = def.scaffold.replace(/\/\/.*$/gm, "").trim();
    if (!stripped || stripped === scaffoldStripped) { setReviewState("idle"); return; }

    setReviewState("reviewing");
    setAiLoading(true);
    try {
      const res = await api<{ passed: boolean; type: string; message: string; severity: string | null; tokensUsed: number }>(
        "/api/review-section",
        { sectionId: def.id, userCode: code, persona, experienceLevel: state.experienceLevel, programmingLanguages: state.programmingLanguages,
          requirements: def.requirements, sectionTitle: def.title, contractName: state.buildPlan?.contractName }
      );
      deductTokens(res.tokensUsed);

      if (res.type === "security_issue" && res.severity === "critical") {
        const note = def.securityNote;
        setSecurityBlock({
          id: "sec-" + Date.now(), level: "critical",
          name: note?.title ?? "Security Issue",
          explanation: res.message || note?.explanation || "",
          historicalExample: note?.historicalExample,
          fix: note?.fix ?? "",
          acknowledged: false,
        });
        setReviewState("rejected");
        return;
      }

      if (res.passed) {
        setReviewState("approved");
        addMsg("byuld", res.message);
        // Persist the exact code that passed — this is what the final contract is
        // assembled from at deploy time. Without it, deploy would compile the scaffold.
        dispatch({ type: "UPDATE_SECTION_CODE", id: def.id, code });
        dispatch({ type: "COMPLETE_SECTION", id: def.id });
        const nextIdx = currentIdx + 1;
        if (nextIdx < sections.length) {
          setTimeout(() => loadSection(nextIdx), 1200);
        } else {
          setTimeout(() => {
            addMsg("byuld", "All four sections complete. Let's run the security review before deploying.");
            setTimeout(() => navigate("/review"), 1800);
          }, 800);
        }
      } else {
        setReviewState("rejected");
        addMsg("byuld", res.message);  // hint only — never code
      }
    } catch {
      setReviewState("rejected");
      setRightTab("ask");   // surface the error in chat so it's not silently nothing
      addMsg("byuld", "I couldn't reach the reviewer just now. The AI service may be waking up or temporarily unavailable. Wait a few seconds and press **Check my code** again.");
    } finally {
      setAiLoading(false);
    }
  }, [sections, currentIdx, persona, deductTokens, addMsg, dispatch, navigate, loadSection]);

  // Typing no longer auto-calls the API. We just track the code and clear any stale
  // review state. The user reviews deliberately with the "Check my code" button —
  // no more accidental Claude calls (and burned credits) on every keystroke.
  const handleCodeChange = useCallback((code: string) => {
    codeRef.current = code;
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    if (reviewState !== "idle") setReviewState("idle");
  }, [reviewState]);

  const handleCheck = useCallback((code?: unknown) => {
    if (aiLoading) return;
    // The button passes a MouseEvent; the demo passes the exact typed code so the
    // review never races a not-yet-synced editor ref.
    const c = typeof code === "string" ? code : codeRef.current;
    if (typeof code === "string") codeRef.current = code;
    runReview(c);
  }, [aiLoading, runReview]);

  // ── Recheck from the security modal ──────────────────────────────────────────
  const handleRecheck = useCallback(async () => {
    const def = sections[currentIdx];
    if (!def) return;
    setRecheckLoading(true);
    try {
      const res = await api<{ passed: boolean; type: string; message: string; severity: string | null; tokensUsed: number }>(
        "/api/review-section",
        { sectionId: def.id, userCode: codeRef.current, persona, experienceLevel: state.experienceLevel, programmingLanguages: state.programmingLanguages,
          requirements: def.requirements, sectionTitle: def.title, contractName: state.buildPlan?.contractName }
      );
      deductTokens(res.tokensUsed);
      if (res.type === "security_issue" && res.severity === "critical") {
        addMsg("byuld", res.message);
      } else {
        setSecurityBlock(null);
        if (res.passed) {
          setReviewState("approved");
          addMsg("byuld", `Resolved. ${res.message}`);
          dispatch({ type: "UPDATE_SECTION_CODE", id: def.id, code: codeRef.current });
          dispatch({ type: "COMPLETE_SECTION", id: def.id });
          const nextIdx = currentIdx + 1;
          if (nextIdx < sections.length) setTimeout(() => loadSection(nextIdx), 1200);
          else setTimeout(() => navigate("/review"), 1500);
        } else {
          setReviewState("rejected");
          addMsg("byuld", res.message);
        }
      }
    } catch { /* keep modal */ }
    setRecheckLoading(false);
  }, [sections, currentIdx, persona, deductTokens, addMsg, dispatch, navigate, loadSection]);

  // ── Mode A: line click ───────────────────────────────────────────────────────
  // Floating-button question about a specific line → posts to chat, calls /api/chat
  // with the exact line as context. Only fires when the user taps a chip / submits.
  const handleAskLine = useCallback(async (question: string, line: string, lineNumber: number) => {
    const def = sections[currentIdx];
    trackQuestion({ screen: "ide" });            // a question…
    trackExplanation({ screen: "ide", concept: def?.title });  // …answered with a line explanation
    setRightTab("ask");                 // surface the chat so they see the answer
    addMsg("user", question);
    setAiLoading(true);
    try {
      const res = await api<{ response: string; tokensUsed: number }>("/api/chat", {
        message: question, line, lineNumber, sectionId: def?.id,
        persona, experienceLevel: state.experienceLevel, currentCode: codeRef.current, chatHistory: state.messages.slice(-8),
      });
      addMsg("byuld", res.response);
      deductTokens(res.tokensUsed);
    } catch {
      addMsg("byuld", "I couldn't answer that right now — try again or ask in the chat.");
    }
    setAiLoading(false);
  }, [sections, currentIdx, persona, state.messages, addMsg, deductTokens]);

  // ── Chat ─────────────────────────────────────────────────────────────────────
  const handleUserMessage = useCallback(async (text: string) => {
    trackQuestion({ screen: "ide" });
    addMsg("user", text);
    const def = sections[currentIdx];
    setAiLoading(true);
    try {
      const res = await api<{ response: string; tokensUsed: number }>("/api/chat", {
        message: text, sectionId: def?.id, currentCode: codeRef.current,
        persona, experienceLevel: state.experienceLevel, chatHistory: state.messages.slice(-8),
      });
      addMsg("byuld", res.response);
      deductTokens(res.tokensUsed);
    } catch {
      addMsg("byuld", "Something went wrong — ask again.");
    }
    setAiLoading(false);
  }, [sections, currentIdx, persona, state.messages, addMsg, deductTokens]);

  // ── Sidebar: view a completed section read-only ──────────────────────────────
  const handleSectionClick = useCallback((idx: number) => {
    const s = state.sections[idx];
    if (s?.status === "complete") {
      const def = getSectionDef(s.id);
      setViewSection({ code: s.code, title: def?.title ?? s.title });
    }
  }, [state.sections]);

  // ── Demo autopilot ───────────────────────────────────────────────────────────
  // Keep latest handlers/index in a ref so the long-running script never goes stale.
  const demoRef = useRef<any>({});
  demoRef.current = { idx: currentIdx, check: handleCheck, ask: handleAskLine, chat: handleUserMessage };
  const demoStarted = useRef(false);
  useEffect(() => {
    const demo = getDemo();
    if (!demo || demoStarted.current) return;
    demoStarted.current = true;
    let cancelled = false;
    (async () => {
      // 1. Show the "how it works" overlay, then dismiss it.
      setShowHowTo(true);
      await sleep(4200);
      if (cancelled) return;
      setShowHowTo(false);
      await sleep(900);

      const ids = DEMO_SECTION_IDS;
      for (let i = 0; i < ids.length; i++) {
        if (cancelled) return;
        // wait until we're actually on this section
        let g = 0; while (demoRef.current.idx !== i && g++ < 60) { if (cancelled) return; await sleep(150); }
        // Show the contract built so far immediately (no bare-scaffold flash), then
        // pause so the viewer can read the task before the new code is written.
        // We sync the stored section code only at the START (prefix) and END (snapshot)
        // of each section — never per line — so the editor's controlled `value` always
        // matches the model at those points and never resets/eats the typing animation.
        const prefix = demoPrefix(i);
        dispatch({ type: "UPDATE_SECTION_CODE", id: ids[i], code: prefix });
        await setEditorValue(prefix);
        await sleep(1300);
        if (cancelled) return;
        // Write this section's body into the growing, brace-balanced contract.
        const snapshot = await appendToContract(prefix, DEMO_BODY_PARTS[ids[i]]);
        dispatch({ type: "UPDATE_SECTION_CODE", id: ids[i], code: snapshot });
        if (cancelled) return;
        await sleep(700);

        // On the first section, show off the inline "?" line-help and the chat.
        if (i === 0) {
          await demoRef.current.ask(DEMO_CONTENT[demo.persona].lineQuestion, "enum State { Created, Locked, Released, Disputed }", 5);
          await sleep(5500);
          if (cancelled) return;
          await demoRef.current.chat(DEMO_CONTENT[demo.persona].chatQuestion);
          await sleep(6500);
          if (cancelled) return;
          setRightTab("guide");
          await sleep(900);
        }

        await demoRef.current.check(snapshot);  // REAL review against the contract so far
        const target = i + 1;
        let g2 = 0; while (demoRef.current.idx < target && g2++ < 90) { if (cancelled) return; await sleep(300); }
        await sleep(1100);
      }
      // After section 4 passes, runReview navigates to /review automatically.
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: C.bg, overflow: "hidden" }}>
      {showHowTo && (
        <HowItWorks onClose={() => {
          try { localStorage.setItem("byuld_seen_howto", "1"); } catch { /* ignore */ }
          setShowHowTo(false);
        }} />
      )}
      {securityBlock && <SecurityBlockModal issue={securityBlock} onRecheck={handleRecheck} checking={recheckLoading} />}

      <BuildTopBar />
      <div style={{ padding: "8px 16px", borderBottom: `1px solid ${C.border}`, background: C.surface, flexShrink: 0 }}>
        <FlowProgress phase={1} compact />
      </div>

      {tokenWarning && !allComplete && (
        <div style={{ padding: "8px 20px", background: "rgba(245,166,35,0.08)", borderLeft: `3px solid ${C.warn}`, display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
          <span style={{ fontSize: "13px", color: C.warn, fontFamily: F.body, display: "inline-flex", alignItems: "center", gap: "5px" }}><AlertTriangle size={13} /> Running low — {state.tokensLimit - state.tokensUsed} tokens left today.</span>
          <button onClick={() => navigate("/build/tokens")} style={{ marginLeft: "auto", background: "none", border: `1px solid ${C.warn}55`, borderRadius: R.md, color: C.warn, fontFamily: F.body, fontSize: "12px", cursor: "pointer", padding: "4px 10px" }}>Manage</button>
        </div>
      )}

      {/* Mobile tab bar — one panel at a time (the 3-column layout collapses here) */}
      {isMobile && (
        <div style={{ display: "flex", flexShrink: 0, borderBottom: `1px solid ${C.border}`, background: C.surface }}>
          {([["code", "Code", Code2], ["guide", "Task", ClipboardList], ["ask", "Chat", MessageCircle]] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => { setMTab(id); if (id !== "code") setRightTab(id); }} style={{
              flex: 1, padding: "12px 8px", background: "none", border: "none", cursor: "pointer",
              borderBottom: `2px solid ${mTab === id ? C.purple : "transparent"}`,
              color: mTab === id ? C.white : C.textMute,
              fontFamily: F.body, fontSize: "12px", fontWeight: 600,
              display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
            }}><Icon size={14} /> {label}</button>
          ))}
        </div>
      )}

      <div style={{ flex: 1, display: "flex", flexDirection: isMobile ? "column" : "row", overflow: "hidden" }}>
        {!isMobile && <BuildSidebar onSectionClick={handleSectionClick} />}

        {(!isMobile || mTab === "code") && (
          <div style={{ flex: "1 1 auto", display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
            <EditorPanel
              onCodeChange={handleCodeChange}
              onAskLine={handleAskLine}
              readOnlyCode={viewSection?.code ?? null}
              readOnlyTitle={viewSection?.title ?? null}
              onCloseReadOnly={() => setViewSection(null)}
            />
            <div style={{ minHeight: "48px", background: C.surface, borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", padding: "8px 16px", gap: "12px", flexShrink: 0, flexWrap: "wrap" }}>
              <ReviewIndicator state={reviewState} />
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: "11px", color: C.textMute, fontFamily: F.mono }}>
                {state.sections.filter(s => s.status === "complete").length}/{state.sections.length} sections
              </span>
              {allComplete
                ? <Button size="sm" variant="mint" onClick={() => navigate("/review")}>Security Review →</Button>
                : <Button size="sm" onClick={handleCheck} disabled={aiLoading}>
                    {aiLoading ? <><Spinner size={13} color="#fff" /> Checking…</> : <><Check size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} />Check my code</>}
                  </Button>
              }
            </div>
          </div>
        )}

        {(!isMobile || mTab !== "code") && (
          <div style={{ flex: isMobile ? "1 1 auto" : "0 0 440px", display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden", borderLeft: isMobile ? "none" : `1px solid ${C.border}`, background: C.surface }}>
            {!isMobile && (
              <div style={{ display: "flex", flexShrink: 0, borderBottom: `1px solid ${C.border}` }}>
                {([["guide", "Your task", ClipboardList], ["ask", "Ask Byuld", MessageCircle]] as const).map(([id, label, Icon]) => (
                  <button key={id} onClick={() => setRightTab(id)} style={{
                    flex: 1, padding: "14px 12px", background: "none", border: "none", cursor: "pointer",
                    borderBottom: `2px solid ${rightTab === id ? C.purple : "transparent"}`,
                    color: rightTab === id ? C.white : C.textMute,
                    fontFamily: F.body, fontSize: "13px", fontWeight: 600, transition: "all 0.15s",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "7px",
                  }}><Icon size={15} /> {label}</button>
                ))}
              </div>
            )}

            <div style={{ flex: 1, minHeight: 0, display: (isMobile ? mTab === "guide" : rightTab === "guide") ? "flex" : "none", flexDirection: "column" }}>
              {sections[currentIdx] && !allComplete
                ? <TaskGuide section={sections[currentIdx]} index={currentIdx} total={sections.length} persona={persona} languages={state.programmingLanguages} />
                : <div style={{ padding: "32px 20px", textAlign: "center", color: C.textMute, fontFamily: F.body, fontSize: "14px" }}>All sections done — run the security review.</div>}
            </div>

            <div style={{ flex: 1, minHeight: 0, display: (isMobile ? mTab === "ask" : rightTab === "ask") ? "flex" : "none", flexDirection: "column" }}>
              <ChatPanel onSend={handleUserMessage} loading={aiLoading} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewIndicator({ state }: { state: "idle" | "reviewing" | "approved" | "rejected" }) {
  const map = {
    idle:      { color: C.textMute, dot: C.border,  label: "Ready" },
    reviewing: { color: C.warn,     dot: C.warn,    label: "Byuld is reviewing…" },
    approved:  { color: C.mint,     dot: C.mint,    label: "Approved" },
    rejected:  { color: C.danger,   dot: C.danger,  label: "Keep going" },
  }[state];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: map.dot, animation: state === "reviewing" ? "pulse 1s ease-in-out infinite" : undefined }} />
      <span style={{ fontSize: "11px", color: map.color, fontFamily: F.body }}>{map.label}</span>
    </div>
  );
}
