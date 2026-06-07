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
import { getSections } from "../../lib/contracts";
import type { Message, SecurityIssue } from "../../types";

// ─── API helpers ───────────────────────────────────────────────────────────────

async function api<T>(endpoint: string, body: object): Promise<T> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

// ─── SecurityBlockModal ────────────────────────────────────────────────────────

function SecurityBlockModal({ issue, onRecheck, checking }: {
  issue: SecurityIssue;
  onRecheck: () => void;
  checking: boolean;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(255,90,90,0.08)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "24px",
    }}>
      <div style={{
        width: "100%", maxWidth: "560px",
        background: C.surface, border: `2px solid ${C.danger}`,
        borderRadius: R.xl, padding: "32px",
      }}>
        <div style={{ fontSize: "11px", color: C.danger, fontFamily: F.body, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "12px" }}>
          ⚠ Security Issue Found
        </div>
        <h2 style={{ fontSize: "20px", fontWeight: 700, fontFamily: F.display, color: C.danger, marginBottom: "16px" }}>
          {issue.name}
        </h2>
        <p style={{ fontSize: "13px", color: C.textSec, fontFamily: F.body, lineHeight: 1.7, marginBottom: "16px" }}>
          {issue.explanation}
        </p>
        {issue.historicalExample && (
          <div style={{ padding: "12px 16px", background: `${C.danger}0A`, border: `1px solid ${C.danger}22`, borderRadius: R.md, marginBottom: "16px" }}>
            <div style={{ fontSize: "11px", color: C.danger, fontFamily: F.body, fontWeight: 600, marginBottom: "4px" }}>Historical example</div>
            <p style={{ fontSize: "12px", color: C.textSec, fontFamily: F.body, fontStyle: "italic", lineHeight: 1.6, margin: 0 }}>
              {issue.historicalExample}
            </p>
          </div>
        )}
        {issue.fix && (
          <div style={{ padding: "12px 16px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: R.md, marginBottom: "20px" }}>
            <div style={{ fontSize: "11px", color: C.mint, fontFamily: F.body, fontWeight: 600, marginBottom: "6px" }}>How to fix it</div>
            <pre style={{ fontSize: "12px", color: C.mint, fontFamily: F.mono, lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>
              {issue.fix}
            </pre>
          </div>
        )}
        <p style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body, marginBottom: "16px" }}>
          Fix the code in the editor, then click Re-check to continue.
        </p>
        <Button fullWidth onClick={onRecheck} disabled={checking}>
          {checking ? <><Spinner size={14} color="#fff" /> Re-checking…</> : "Re-check my code →"}
        </Button>
      </div>
    </div>
  );
}

// ─── Decision cards shown in chat ─────────────────────────────────────────────

function DecisionCards({ question, options, onSelect }: {
  question: string;
  options: { label: string; value: string; description: string }[];
  onSelect: (value: string, label: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div style={{ marginTop: "12px" }}>
      <p style={{ fontSize: "13px", color: C.textSec, fontFamily: F.body, lineHeight: 1.6, marginBottom: "12px" }}>
        {question}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {options.map(opt => (
          <button
            key={opt.value}
            onClick={() => { setSelected(opt.value); onSelect(opt.value, opt.label); }}
            style={{
              padding: "12px 16px", textAlign: "left",
              background: selected === opt.value ? `${C.purple}18` : C.surface,
              border: `1px solid ${selected === opt.value ? C.purple : C.border}`,
              borderRadius: R.md, cursor: "pointer", transition: "all 0.15s",
            }}
          >
            <div style={{ fontSize: "13px", fontWeight: 600, color: C.white, fontFamily: F.body, marginBottom: "2px" }}>
              {opt.label}
            </div>
            <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body }}>
              {opt.description}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function BuildInterface() {
  const navigate = useNavigate();
  const { state, dispatch } = useApp();
  const [aiLoading, setAiLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [reviewState, setReviewState] = useState<"idle" | "reviewing" | "approved" | "rejected">("idle");
  const [tokenWarning, setTokenWarning] = useState(false);
  const [securityBlock, setSecurityBlock] = useState<SecurityIssue | null>(null);
  const [recheckLoading, setRecheckLoading] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<{
    question: string;
    options: { label: string; value: string; description: string }[];
    key: string;
  } | null>(null);
  const [clarificationAnswers, setClarificationAnswers] = useState<Record<string, string>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialized = useRef(false);
  const currentCodeRef = useRef("");

  const sections = getSections(state.contractType as any || "ERC721");
  const currentSec = state.sections[state.currentSection];
  const allComplete = state.sections.every(s => s.status === "complete");

  const addMsg = useCallback((role: "byuld" | "user", content: string) => {
    dispatch({ type: "ADD_MESSAGE", message: { role, content, timestamp: Date.now() } });
  }, [dispatch]);

  const deductTokens = useCallback((count: number) => {
    dispatch({ type: "ADD_TOKENS", count });
    if (state.tokensUsed + count >= state.tokensLimit * 0.8) setTokenWarning(true);
    if (state.tokensUsed + count >= state.tokensLimit) navigate("/build/tokens");
  }, [state.tokensUsed, state.tokensLimit, dispatch, navigate]);

  // ── Mode C: scaffold intro for current section ────────────────────────────

  const loadSectionIntro = useCallback(async (sectionIdx: number) => {
    const secDef = sections[sectionIdx];
    if (!secDef) return;

    // Load scaffold hint into editor
    dispatch({ type: "UPDATE_SECTION_CODE", id: state.sections[sectionIdx]?.id ?? secDef.id, code: secDef.scaffoldHint });
    dispatch({ type: "SET_MODE", mode: "C" });

    setAiLoading(true);
    try {
      const res = await api<{ code: string; tokensUsed: number }>("/api/generate-scaffold", {
        contractType: state.contractType,
        sectionIndex: sectionIdx,
        sectionType: secDef.id,
        goal: state.goal,
        persona: state.persona ?? "founder",
        clarificationAnswers,
        previousSections: state.sections.slice(0, sectionIdx).map(s => s.code),
      });
      // Update scaffold with AI-generated hints
      dispatch({ type: "UPDATE_SECTION_CODE", id: state.sections[sectionIdx]?.id ?? secDef.id, code: res.code || secDef.scaffoldHint });
      deductTokens(res.tokensUsed);

      // Compose intro message based on persona
      const isFounder = state.persona === "founder";
      const intro = isFounder
        ? `Now we're working on **${secDef.title}**.\n\n${secDef.description}\n\nI've set up the structure in the editor. Read through the comments — they tell you exactly what to write in each spot. When you've replaced the TODO comments with real code, I'll review it automatically.`
        : `**${secDef.title}** — ${secDef.description}\n\nScaffold loaded. Replace the TODO blocks. I'll review on a 1.5s debounce.`;

      addMsg("byuld", intro);
    } catch {
      addMsg("byuld", `Working on **${secDef.title}**.\n\n${secDef.description}\n\nRead the comments in the editor and fill in the TODO sections.`);
    }
    setAiLoading(false);

    // Show decision question if this section has one
    if (secDef.decisionQuestion) {
      setPendingDecision(secDef.decisionQuestion);
    } else {
      dispatch({ type: "SET_MODE", mode: "B" });
    }
  }, [sections, state, dispatch, addMsg, deductTokens, clarificationAnswers]);

  // ── Init: load first section on mount ─────────────────────────────────────

  useEffect(() => {
    if (initialized.current || !state.goal) return;
    initialized.current = true;
    loadSectionIntro(state.currentSection);
  }, []);

  // ── Handle decision card selection ────────────────────────────────────────

  const handleDecision = useCallback((key: string, value: string, label: string) => {
    const newAnswers = { ...clarificationAnswers, [key]: value };
    setClarificationAnswers(newAnswers);
    setPendingDecision(null);
    addMsg("user", label);
    addMsg("byuld", `Got it — **${label}**. Now fill in the TODO sections in the editor. I'm watching and will give you feedback as you go.`);
    dispatch({ type: "SET_MODE", mode: "B" });
  }, [clarificationAnswers, addMsg, dispatch]);

  // ── Mode A: line-click explanation ────────────────────────────────────────

  const handleLineClick = useCallback(async (line: string, lineNumber: number) => {
    if (!line.trim() || line.trim().startsWith("//")) return;
    setAiLoading(true);
    try {
      const res = await api<{ explanation: string; tokensUsed: number }>("/api/explain-line", {
        line,
        lineNumber,
        fullCode: currentCodeRef.current,
        persona: state.persona ?? "founder",
        goal: state.goal,
      });
      addMsg("byuld", res.explanation);
      deductTokens(res.tokensUsed);
    } catch {
      addMsg("byuld", "I couldn't explain that line right now. Try clicking it again or ask me in the chat.");
    }
    setAiLoading(false);
  }, [state.persona, state.goal, addMsg, deductTokens]);

  // ── Mode B: debounced code review ──────────────────────────────────────────

  const handleCodeChange = useCallback((code: string) => {
    currentCodeRef.current = code;
    if (state.mode !== "B" && state.mode !== "A") return;
    setReviewState("reviewing");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!code.trim() || code.trim() === sections[state.currentSection]?.scaffoldHint?.trim()) {
        setReviewState("idle");
        return;
      }
      // Don't review if it's just the scaffold hint unchanged
      const hasUserCode = !code.includes("// TODO:") || code.split("\n").filter(l => !l.trim().startsWith("//") && l.trim()).length > 2;
      if (!hasUserCode) { setReviewState("idle"); return; }

      setAiLoading(true);
      try {
        const res = await api<{
          passed: boolean; type: string; explanation: string;
          reason: string; hint: string;
          securityIssues: { severity: string; title: string; explanation: string; historicalExample: string; fix: string }[];
          tokensUsed: number;
        }>("/api/review-section", {
          code,
          sectionType: sections[state.currentSection]?.id,
          contractType: state.contractType,
          goal: state.goal,
          persona: state.persona ?? "founder",
          clarificationAnswers,
        });

        deductTokens(res.tokensUsed);

        // Handle security issues
        const criticals = res.securityIssues?.filter(i => i.severity === "critical") ?? [];
        const warnings  = res.securityIssues?.filter(i => i.severity === "warning") ?? [];

        if (criticals.length > 0) {
          const issue = criticals[0];
          setSecurityBlock({
            id: "sec-" + Date.now(),
            level: "critical",
            name: issue.title,
            explanation: issue.explanation,
            historicalExample: issue.historicalExample,
            fix: issue.fix,
            acknowledged: false,
          });
          setReviewState("rejected");
          addMsg("byuld", `⚠ **Critical security issue: ${issue.title}**\n\n${issue.explanation}`);
        } else if (warnings.length > 0) {
          const w = warnings[0];
          dispatch({ type: "SET_SECURITY_ISSUES", issues: [{ id: "w-" + Date.now(), level: "warning", name: w.title, explanation: w.explanation, historicalExample: w.historicalExample, fix: w.fix, acknowledged: false }] });
          addMsg("byuld", `⚠ **Warning: ${w.title}**\n\n${w.explanation}\n\n${w.fix ? `Fix: \`${w.fix}\`` : ""}`);
        }

        if (res.passed) {
          setReviewState("approved");
          addMsg("byuld", `✓ ${res.explanation}`);
          const cur = state.sections[state.currentSection];
          if (cur) {
            dispatch({ type: "COMPLETE_SECTION", id: cur.id });
            const nextIdx = state.currentSection + 1;
            if (nextIdx < sections.length) {
              setTimeout(() => {
                addMsg("byuld", "Section complete. Loading the next one…");
                setTimeout(() => loadSectionIntro(nextIdx), 1200);
              }, 600);
            } else {
              setTimeout(() => {
                addMsg("byuld", "🎉 All sections complete! Your contract is ready for the security review.");
                setTimeout(() => navigate("/review"), 2000);
              }, 800);
            }
          }
        } else {
          setReviewState("rejected");
          if (!criticals.length) {
            addMsg("byuld", `✗ ${res.reason}\n\n${res.hint ? `**Hint:** ${res.hint}` : ""}`);
          }
        }
      } catch {
        setReviewState("idle");
      }
      setAiLoading(false);
    }, 1500);
  }, [state, sections, clarificationAnswers, addMsg, deductTokens, dispatch, navigate, loadSectionIntro]);

  // ── Recheck after security fix ─────────────────────────────────────────────

  const handleRecheck = useCallback(async () => {
    setRecheckLoading(true);
    try {
      const res = await api<{ passed: boolean; securityIssues: any[]; reason: string; explanation: string; tokensUsed: number }>("/api/review-section", {
        code: currentCodeRef.current,
        sectionType: sections[state.currentSection]?.id,
        contractType: state.contractType,
        goal: state.goal,
        persona: state.persona ?? "founder",
        clarificationAnswers,
      });
      deductTokens(res.tokensUsed);
      const criticals = res.securityIssues?.filter(i => i.severity === "critical") ?? [];
      if (criticals.length === 0) {
        setSecurityBlock(null);
        setReviewState(res.passed ? "approved" : "rejected");
        addMsg("byuld", res.passed ? `✓ Security issue resolved. ${res.explanation}` : `✗ ${res.reason}`);
        if (res.passed) {
          const cur = state.sections[state.currentSection];
          if (cur) dispatch({ type: "COMPLETE_SECTION", id: cur.id });
        }
      } else {
        const issue = criticals[0];
        setSecurityBlock({ id: "sec-" + Date.now(), level: "critical", name: issue.title, explanation: issue.explanation, historicalExample: issue.historicalExample, fix: issue.fix, acknowledged: false });
        addMsg("byuld", `Still seeing the issue: ${issue.explanation}`);
      }
    } catch { /* keep modal open */ }
    setRecheckLoading(false);
  }, [state, sections, clarificationAnswers, addMsg, deductTokens, dispatch]);

  // ── User chat message ─────────────────────────────────────────────────────

  const handleUserMessage = useCallback(async (text: string) => {
    addMsg("user", text);
    setAiLoading(true);
    try {
      const res = await api<{ response: string; tokensUsed: number }>("/api/chat", {
        message: text,
        currentCode: currentCodeRef.current,
        goal: state.goal,
        persona: state.persona ?? "founder",
        chatHistory: state.messages.slice(-8),
      });
      addMsg("byuld", res.response);
      deductTokens(res.tokensUsed);
      dispatch({ type: "SET_MODE", mode: "A" });
    } catch {
      addMsg("byuld", "Something went wrong. Try asking again.");
    }
    setAiLoading(false);
  }, [state, addMsg, deductTokens, dispatch]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: C.bg, overflow: "hidden" }}>
      {securityBlock && (
        <SecurityBlockModal
          issue={securityBlock}
          onRecheck={handleRecheck}
          checking={recheckLoading}
        />
      )}

      <BuildTopBar />

      {tokenWarning && !allComplete && (
        <div style={{
          padding: "8px 20px", background: "rgba(245,166,35,0.08)",
          borderLeft: `3px solid ${C.warn}`,
          display: "flex", alignItems: "center", gap: "12px", flexShrink: 0,
        }}>
          <span style={{ fontSize: "13px", color: C.warn, fontFamily: F.body }}>
            ⚠ Running low — {state.tokensLimit - state.tokensUsed} tokens left today.
          </span>
          <button onClick={() => navigate("/build/tokens")} style={{ marginLeft: "auto", background: "none", border: `1px solid ${C.warn}55`, borderRadius: R.md, color: C.warn, fontFamily: F.body, fontSize: "12px", cursor: "pointer", padding: "4px 10px" }}>
            Manage
          </button>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <BuildSidebar />

        <div style={{ flex: "0 0 55%", display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
          <EditorPanel onCodeChange={handleCodeChange} onLineClick={handleLineClick} />

          <div style={{ height: "36px", background: C.surface, borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", padding: "0 16px", gap: "16px", flexShrink: 0 }}>
            <ReviewIndicator state={reviewState} />
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: "11px", color: C.textMute, fontFamily: F.mono }}>
              {state.sections.filter(s => s.status === "complete").length}/{state.sections.length} sections
            </span>
            {allComplete && (
              <Button size="sm" variant="mint" onClick={() => navigate("/review")}>Review Contract →</Button>
            )}
          </div>
        </div>

        <div style={{ flex: "0 0 45%", display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
          <ChatPanel
            onSend={handleUserMessage}
            loading={aiLoading}
            streamingContent={streamingContent}
            decisionSlot={pendingDecision ? (
              <DecisionCards
                question={pendingDecision.question}
                options={pendingDecision.options}
                onSelect={(value, label) => handleDecision(pendingDecision.key, value, label)}
              />
            ) : undefined}
          />
        </div>
      </div>
    </div>
  );
}

// ── ReviewIndicator ──────────────────────────────────────────────────────────

function ReviewIndicator({ state }: { state: "idle" | "reviewing" | "approved" | "rejected" }) {
  const map = {
    idle:      { color: C.textMute, dot: C.border,  label: "Ready" },
    reviewing: { color: C.warn,     dot: C.warn,    label: "Reviewing…" },
    approved:  { color: C.mint,     dot: C.mint,    label: "Approved ✓" },
    rejected:  { color: C.danger,   dot: C.danger,  label: "Needs revision" },
  }[state];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: map.dot, animation: state === "reviewing" ? "pulse 1s ease-in-out infinite" : undefined }} />
      <span style={{ fontSize: "11px", color: map.color, fontFamily: F.body }}>{map.label}</span>
    </div>
  );
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
