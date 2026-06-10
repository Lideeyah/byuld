import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { C, F, R } from "../../tokens";
import BuildTopBar from "../../components/layout/BuildTopBar";
import BuildSidebar from "../../components/layout/BuildSidebar";
import EditorPanel from "../../components/build/EditorPanel";
import ChatPanel from "../../components/build/ChatPanel";
import Button from "../../components/ui/Button";
import Spinner from "../../components/ui/Spinner";
import { useApp } from "../../context/AppContext";
import { getSections, getSectionDef } from "../../lib/contracts";
import type { SecurityIssue } from "../../types";

async function api<T>(endpoint: string, body: object): Promise<T> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

// ─── Security Block Modal (critical issue — cannot dismiss) ────────────────────

function SecurityBlockModal({ issue, onRecheck, checking }: {
  issue: SecurityIssue; onRecheck: () => void; checking: boolean;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(255,90,90,0.10)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ width: "100%", maxWidth: "560px", background: C.surface, border: `2px solid ${C.danger}`, borderRadius: R.xl, padding: "32px" }}>
        <div style={{ fontSize: "11px", color: C.danger, fontFamily: F.body, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "12px" }}>⚠ Security Issue Found</div>
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
  const sections = getSections();

  const [aiLoading, setAiLoading] = useState(false);
  const [reviewState, setReviewState] = useState<"idle" | "reviewing" | "approved" | "rejected">("idle");
  const [tokenWarning, setTokenWarning] = useState(false);
  const [securityBlock, setSecurityBlock] = useState<SecurityIssue | null>(null);
  const [recheckLoading, setRecheckLoading] = useState(false);
  const [viewSection, setViewSection] = useState<{ code: string; title: string } | null>(null);

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
    const after = state.tokensUsed + count;
    if (after >= state.tokensLimit * 0.8) setTokenWarning(true);
    if (after >= state.tokensLimit) navigate("/build/tokens");
  }, [state.tokensUsed, state.tokensLimit, dispatch, navigate]);

  // ── Load a section into the editor (HARDCODED scaffold — no AI) + intro chat ──
  const loadSection = useCallback((idx: number, isFirst: boolean) => {
    const def = sections[idx];
    if (!def) return;
    const stateSec = state.sections[idx];
    // Only preload the scaffold if the user hasn't written anything yet
    if (stateSec && (!stateSec.code || !stateSec.code.trim())) {
      dispatch({ type: "UPDATE_SECTION_CODE", id: stateSec.id, code: def.scaffold });
      codeRef.current = def.scaffold;
    } else if (stateSec) {
      codeRef.current = stateSec.code;
    }
    dispatch({ type: "SET_MODE", mode: "C" });
    setReviewState("idle");

    const isFounder = persona === "founder";
    if (isFirst) {
      addMsg("byuld", isFounder
        ? "Welcome. We're building a **P2P Escrow contract** — a secure way to hold payment between two parties with a trusted referee. I've set up the structure for your first section. Your job is to fill in the blanks. I'll explain everything as you go."
        : "We're implementing a **P2P Escrow contract** with a 4-stage state machine. Section 1 covers state variable declarations and the lifecycle enum. Fill in the marked TODO areas.");
    }
    addMsg("byuld", isFounder ? def.founderExplanation : def.developerExplanation);

    // Mode C → after 3s, nudge toward the first TODO (still no code given)
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => {
      addMsg("byuld", `💡 ${def.hint}`);
    }, 3000);
  }, [sections, state.sections, persona, dispatch, addMsg]);

  // ── Init on mount ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (initialized.current) return;
    if (!state.goal) { navigate("/onboarding/goal"); return; }
    initialized.current = true;

    if (state.messages.length === 0) {
      // Fresh build — post welcome + intro + load scaffold
      loadSection(currentIdx, true);
    } else {
      // Returning to an in-progress build — restore silently, no duplicate chat
      const def = sections[currentIdx];
      const sec = state.sections[currentIdx];
      if (def && sec && (!sec.code || !sec.code.trim())) {
        dispatch({ type: "UPDATE_SECTION_CODE", id: sec.id, code: def.scaffold });
        codeRef.current = def.scaffold;
      } else if (sec) {
        codeRef.current = sec.code;
      }
      dispatch({ type: "SET_MODE", mode: "C" });
    }
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
        { sectionId: def.id, userCode: code, persona, programmingLanguages: [] }
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
        addMsg("byuld", `✓ ${res.message}`);
        dispatch({ type: "COMPLETE_SECTION", id: def.id });
        const nextIdx = currentIdx + 1;
        if (nextIdx < sections.length) {
          setTimeout(() => loadSection(nextIdx, false), 1200);
        } else {
          setTimeout(() => {
            addMsg("byuld", "🎉 All four sections complete. Let's run the security review before deploying.");
            setTimeout(() => navigate("/review"), 1800);
          }, 800);
        }
      } else {
        setReviewState("rejected");
        addMsg("byuld", res.message);  // hint only — never code
      }
    } catch {
      setReviewState("idle");
    } finally {
      setAiLoading(false);
    }
  }, [sections, currentIdx, persona, deductTokens, addMsg, dispatch, navigate, loadSection]);

  const handleCodeChange = useCallback((code: string) => {
    codeRef.current = code;
    dispatch({ type: "SET_MODE", mode: "B" });
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runReview(code), 500);
  }, [runReview, dispatch]);

  // ── Recheck from the security modal ──────────────────────────────────────────
  const handleRecheck = useCallback(async () => {
    const def = sections[currentIdx];
    if (!def) return;
    setRecheckLoading(true);
    try {
      const res = await api<{ passed: boolean; type: string; message: string; severity: string | null; tokensUsed: number }>(
        "/api/review-section",
        { sectionId: def.id, userCode: codeRef.current, persona, programmingLanguages: [] }
      );
      deductTokens(res.tokensUsed);
      if (res.type === "security_issue" && res.severity === "critical") {
        addMsg("byuld", res.message);
      } else {
        setSecurityBlock(null);
        if (res.passed) {
          setReviewState("approved");
          addMsg("byuld", `✓ Resolved. ${res.message}`);
          dispatch({ type: "COMPLETE_SECTION", id: def.id });
          const nextIdx = currentIdx + 1;
          if (nextIdx < sections.length) setTimeout(() => loadSection(nextIdx, false), 1200);
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
  const handleLineClick = useCallback(async (line: string, lineNumber: number) => {
    if (!line.trim()) return;
    const def = sections[currentIdx];
    dispatch({ type: "SET_MODE", mode: "A" });
    setAiLoading(true);
    try {
      const res = await api<{ explanation: string; tokensUsed: number }>("/api/explain-line", {
        line, lineNumber, sectionId: def?.id, persona, programmingLanguages: [],
      });
      addMsg("byuld", res.explanation);
      deductTokens(res.tokensUsed);
    } catch {
      addMsg("byuld", "I couldn't explain that line right now — try again or ask in the chat.");
    }
    setAiLoading(false);
  }, [sections, currentIdx, persona, addMsg, deductTokens, dispatch]);

  // ── Chat ─────────────────────────────────────────────────────────────────────
  const handleUserMessage = useCallback(async (text: string) => {
    addMsg("user", text);
    const def = sections[currentIdx];
    setAiLoading(true);
    try {
      const res = await api<{ response: string; tokensUsed: number }>("/api/chat", {
        message: text, sectionId: def?.id, currentCode: codeRef.current,
        persona, chatHistory: state.messages.slice(-8),
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

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: C.bg, overflow: "hidden" }}>
      {securityBlock && <SecurityBlockModal issue={securityBlock} onRecheck={handleRecheck} checking={recheckLoading} />}

      <BuildTopBar />

      {tokenWarning && !allComplete && (
        <div style={{ padding: "8px 20px", background: "rgba(245,166,35,0.08)", borderLeft: `3px solid ${C.warn}`, display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
          <span style={{ fontSize: "13px", color: C.warn, fontFamily: F.body }}>⚠ Running low — {state.tokensLimit - state.tokensUsed} tokens left today.</span>
          <button onClick={() => navigate("/build/tokens")} style={{ marginLeft: "auto", background: "none", border: `1px solid ${C.warn}55`, borderRadius: R.md, color: C.warn, fontFamily: F.body, fontSize: "12px", cursor: "pointer", padding: "4px 10px" }}>Manage</button>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <BuildSidebar onSectionClick={handleSectionClick} />

        <div style={{ flex: "1 1 auto", display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
          <EditorPanel
            onCodeChange={handleCodeChange}
            onLineClick={handleLineClick}
            readOnlyCode={viewSection?.code ?? null}
            readOnlyTitle={viewSection?.title ?? null}
            onCloseReadOnly={() => setViewSection(null)}
          />
          <div style={{ height: "36px", background: C.surface, borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", padding: "0 16px", gap: "16px", flexShrink: 0 }}>
            <ReviewIndicator state={reviewState} />
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: "11px", color: C.textMute, fontFamily: F.mono }}>
              {state.sections.filter(s => s.status === "complete").length}/{state.sections.length} sections
            </span>
            {allComplete && <Button size="sm" variant="mint" onClick={() => navigate("/review")}>Security Review →</Button>}
          </div>
        </div>

        <div style={{ flex: "0 0 380px", display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
          <ChatPanel onSend={handleUserMessage} loading={aiLoading} />
        </div>
      </div>
    </div>
  );
}

function ReviewIndicator({ state }: { state: "idle" | "reviewing" | "approved" | "rejected" }) {
  const map = {
    idle:      { color: C.textMute, dot: C.border,  label: "Ready" },
    reviewing: { color: C.warn,     dot: C.warn,    label: "Byuld is reviewing…" },
    approved:  { color: C.mint,     dot: C.mint,    label: "Approved ✓" },
    rejected:  { color: C.danger,   dot: C.danger,  label: "Keep going" },
  }[state];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: map.dot, animation: state === "reviewing" ? "pulse 1s ease-in-out infinite" : undefined }} />
      <span style={{ fontSize: "11px", color: map.color, fontFamily: F.body }}>{map.label}</span>
    </div>
  );
}
