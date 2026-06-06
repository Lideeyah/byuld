import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { C, F, R } from "../../tokens";
import BuildTopBar from "../../components/layout/BuildTopBar";
import BuildSidebar from "../../components/layout/BuildSidebar";
import EditorPanel from "../../components/build/EditorPanel";
import ChatPanel from "../../components/build/ChatPanel";
import SecurityAlert from "../../components/ui/SecurityAlert";
import Button from "../../components/ui/Button";
import { useApp } from "../../context/AppContext";
import type { Message, SecurityIssue } from "../../types";

// ── AI API calls ──────────────────────────────────────────────────────────────

interface AIPayload {
  mode: "scaffold" | "review" | "chat";
  persona: string;
  contractType: string;
  goal: string;
  chain: string;
  code?: string;
  userMessage?: string;
}

async function callAI(payload: AIPayload): Promise<{ message: string; approved?: boolean; tokens?: number }> {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

// Stream scaffold/chat responses character by character
async function* streamAI(payload: AIPayload): AsyncGenerator<{ text?: string; done?: boolean; tokens?: number; error?: string }> {
  const res = await fetch("/api/ai/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Stream error ${res.status}`);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try { yield JSON.parse(line.slice(6)); } catch { /* skip malformed */ }
      }
    }
  }
}

// Fallbacks used when API is unavailable (no key set / offline)
function fallbackScaffold(goal: string, contractType: string, persona: string): string {
  const isFounder = persona === "founder";
  if (isFounder) {
    return `I've read your goal: "${goal}". This maps to a ${contractType} contract.\n\nI've generated the skeleton above. Each section has a comment explaining what it does. Start with Imports & Pragma.\n\nShould this contract be transferable (anyone can send it) or soulbound (locked to the recipient)?`;
  }
  return `Goal: "${goal}" → ${contractType}.\n\nScaffold generated with OpenZeppelin base. Start with pragma and imports. I'll review each section on a 1.5s debounce.\n\nTransfer restrictions?`;
}

function fallbackReview(code: string, persona: string): { approved: boolean; msg: string } {
  const lines = code.trim().split("\n").filter(Boolean);
  if (lines.length < 2) return { approved: false, msg: "You need to write more than that. Look at the comment above for guidance on what this section should contain." };
  if (code.includes("TODO") || code.includes("// fill")) return { approved: false, msg: "There's still a TODO left in this section. Replace it with real code before continuing." };
  if (persona === "founder") {
    return { approved: true, msg: `✓ This looks right.\n\nYou've defined the structure for this section. Think of it like a table of contents — it tells Solidity what to expect.\n\nNext section is now unlocked.` };
  }
  return { approved: true, msg: `✓ Approved. Pattern looks correct for your use case. Next section unlocked.` };
}

function fallbackChat(userMessage: string, persona: string): string {
  if (!userMessage.trim()) return "Write some code and I'll explain what it does.";
  if (persona === "founder") {
    return `Good question. Without seeing your full contract, here's the short answer: this part of Solidity controls access — it's like a lock that only lets the contract owner call certain functions. If you want anyone to be able to call it, you remove the restriction. Want me to show you how?`;
  }
  return `Standard access-control pattern. The modifier gates the function to msg.sender === owner. For more granular RBAC, consider OpenZeppelin's AccessControl module.`;
}

const MOCK_SECURITY_ISSUES: SecurityIssue[] = [
  {
    id: "sec-1",
    level: "warning",
    name: "Missing input validation on tokenId",
    explanation: "Your mint function doesn't check if the tokenId already exists. Calling mint twice with the same ID will revert at the ERC-721 level, but you should validate explicitly for clarity.",
    fix: "Add: require(!_exists(tokenId), \"Token already minted\");",
    acknowledged: false,
  },
];

// ─────────────────────────────────────────────────────────────────────────────

export default function BuildInterface() {
  const navigate = useNavigate();
  const { state, dispatch } = useApp();
  const [aiLoading, setAiLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [reviewState, setReviewState] = useState<"idle" | "reviewing" | "approved" | "rejected">("idle");
  const [showSecBlock, setShowSecBlock] = useState(false);
  const [tokenWarning, setTokenWarning] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialized = useRef(false);

  // Scaffold on first load
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const scaffold = buildScaffold(state.contractType, state.goal);
    state.sections.forEach(sec => {
      dispatch({ type: "UPDATE_SECTION_CODE", id: sec.id, code: scaffold[sec.id] || "" });
    });

    setTimeout(async () => {
      setAiLoading(true);
      let fullText = "";
      try {
        for await (const chunk of streamAI({
          mode: "scaffold",
          persona: state.persona ?? "founder",
          contractType: state.contractType,
          goal: state.goal,
          chain: state.chain,
        })) {
          if (chunk.text) {
            fullText += chunk.text;
            setStreamingContent(fullText);
          }
          if (chunk.done) {
            setStreamingContent("");
            addMsg("byuld", fullText);
            if (chunk.tokens) dispatch({ type: "ADD_TOKENS", count: chunk.tokens });
          }
          if (chunk.error) throw new Error(chunk.error);
        }
      } catch {
        setStreamingContent("");
        addMsg("byuld", fallbackScaffold(state.goal, state.contractType, state.persona ?? "founder"));
        dispatch({ type: "ADD_TOKENS", count: 8 });
      }
      setAiLoading(false);
      dispatch({ type: "SET_MODE", mode: "B" });
    }, 400);
  }, []);

  const addMsg = useCallback((role: "byuld" | "user", content: string) => {
    const message: Message = { role, content, timestamp: Date.now() };
    dispatch({ type: "ADD_MESSAGE", message });
  }, [dispatch]);

  const handleUserMessage = async (text: string) => {
    addMsg("user", text);
    setAiLoading(true);
    let fullText = "";
    try {
      for await (const chunk of streamAI({
        mode: "chat",
        persona: state.persona ?? "founder",
        contractType: state.contractType,
        goal: state.goal,
        chain: state.chain,
        userMessage: text,
      })) {
        if (chunk.text) {
          fullText += chunk.text;
          setStreamingContent(fullText);
        }
        if (chunk.done) {
          setStreamingContent("");
          addMsg("byuld", fullText);
          if (chunk.tokens) dispatch({ type: "ADD_TOKENS", count: chunk.tokens });
        }
        if (chunk.error) throw new Error(chunk.error);
      }
    } catch {
      setStreamingContent("");
      addMsg("byuld", fallbackChat(text, state.persona ?? "founder"));
      dispatch({ type: "ADD_TOKENS", count: Math.floor(3 + Math.random() * 5) });
    }
    setAiLoading(false);
    dispatch({ type: "SET_MODE", mode: "A" });
    checkTokens();
  };

  const checkTokens = useCallback(() => {
    if (state.tokensUsed >= state.tokensLimit * 0.8) setTokenWarning(true);
    if (state.tokensUsed >= state.tokensLimit) navigate("/build/tokens");
  }, [state.tokensUsed, state.tokensLimit, navigate]);

  const handleCodeChange = useCallback((code: string) => {
    dispatch({ type: "SET_MODE", mode: "B" });
    setReviewState("reviewing");

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setAiLoading(true);
      let approved = false;
      let msg = "";
      try {
        const res = await callAI({
          mode: "review",
          persona: state.persona ?? "founder",
          contractType: state.contractType,
          goal: state.goal,
          chain: state.chain,
          code,
        });
        approved = res.approved ?? false;
        msg = res.message;
        if (res.tokens) dispatch({ type: "ADD_TOKENS", count: res.tokens });
      } catch {
        const fb = fallbackReview(code, state.persona ?? "founder");
        approved = fb.approved;
        msg = fb.msg;
        dispatch({ type: "ADD_TOKENS", count: 4 });
      }
      setReviewState(approved ? "approved" : "rejected");
      addMsg("byuld", msg);
      setAiLoading(false);
      checkTokens();

      if (approved) {
        const cur = state.sections[state.currentSection];
        if (cur) {
          dispatch({ type: "COMPLETE_SECTION", id: cur.id });
          // Run security check after completing a section
          await sleep(800);
          runSecurityCheck();
        }
      }
    }, 1500);
  }, [state.persona, state.sections, state.currentSection, addMsg, checkTokens, dispatch]);

  const runSecurityCheck = async () => {
    addMsg("byuld", "Running security check on this section…");
    await sleep(1500);
    const allComplete = state.sections.every(s => s.status === "complete");
    if (allComplete) {
      navigate("/review");
      return;
    }
    // Occasionally surface a mock warning
    if (Math.random() > 0.5) {
      dispatch({ type: "SET_SECURITY_ISSUES", issues: MOCK_SECURITY_ISSUES });
      addMsg("byuld", "⚠ One warning found. See the security panel below. It won't block you, but read it.");
    } else {
      addMsg("byuld", "✓ No issues found. Write the next section when ready.");
    }
  };

  const currentSec = state.sections[state.currentSection];
  const allComplete = state.sections.every(s => s.status === "complete");

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: C.bg, overflow: "hidden" }}>
      <BuildTopBar />

      {/* Token warning banner */}
      {tokenWarning && !allComplete && (
        <div style={{
          padding: "8px 20px",
          background: "rgba(245,166,35,0.08)",
          border: `1px solid ${C.warn}33`,
          borderLeft: `3px solid ${C.warn}`,
          display: "flex", alignItems: "center", gap: "12px", flexShrink: 0,
        }}>
          <span style={{ fontSize: "13px", color: C.warn, fontFamily: F.body }}>
            ⚠ You're running low — {state.tokensLimit - state.tokensUsed} tokens left today.
          </span>
          <button
            onClick={() => navigate("/build/tokens")}
            style={{ marginLeft: "auto", background: "none", border: `1px solid ${C.warn}55`, borderRadius: R.md, color: C.warn, fontFamily: F.body, fontSize: "12px", cursor: "pointer", padding: "4px 10px" }}
          >
            Manage
          </button>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <BuildSidebar />

        {/* Editor */}
        <div style={{ flex: "0 0 60%", display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
          <EditorPanel onCodeChange={handleCodeChange} />

          {/* Bottom bar */}
          <div style={{
            height: "36px",
            background: C.surface,
            borderTop: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", padding: "0 16px", gap: "16px", flexShrink: 0,
          }}>
            <ReviewIndicator state={reviewState} />
            <div style={{ flex: 1 }} />
            {state.securityIssues.length > 0 && (
              <span style={{ fontSize: "11px", color: C.warn, fontFamily: F.body }}>
                ⚠ {state.securityIssues.filter(i => !i.acknowledged).length} warning(s)
              </span>
            )}
            <span style={{ fontSize: "11px", color: C.textMute, fontFamily: F.mono }}>
              {state.sections.filter(s => s.status === "complete").length}/{state.sections.length} sections
            </span>
            {allComplete && (
              <Button size="sm" variant="mint" onClick={() => navigate("/review")}>
                Review Contract →
              </Button>
            )}
          </div>

          {/* Security issues panel */}
          {state.securityIssues.length > 0 && (
            <div style={{
              borderTop: `1px solid ${C.border}`,
              background: C.surface,
              padding: "12px 16px",
              display: "flex", flexDirection: "column", gap: "8px", flexShrink: 0,
              maxHeight: "160px", overflowY: "auto",
            }}>
              {state.securityIssues.map(issue => (
                <div key={issue.id} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                  <SecurityAlert
                    level={issue.level === "critical" ? "danger" : issue.level === "warning" ? "warn" : "info"}
                    title={issue.name}
                    body={
                      <div>
                        {issue.explanation}
                        <div style={{ marginTop: "6px", fontFamily: F.mono, fontSize: "11px", color: C.mint }}>{issue.fix}</div>
                      </div>
                    }
                  />
                  {!issue.acknowledged && (
                    <button
                      onClick={() => dispatch({ type: "ACKNOWLEDGE_ISSUE", id: issue.id })}
                      style={{
                        flexShrink: 0, padding: "4px 10px", background: "none",
                        border: `1px solid ${C.border}`, borderRadius: R.md,
                        color: C.textMute, fontFamily: F.body, fontSize: "11px", cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Got it
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Chat */}
        <div style={{ flex: "0 0 40%", display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
          <ChatPanel onSend={handleUserMessage} loading={aiLoading} streamingContent={streamingContent} />
        </div>
      </div>
    </div>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────

function ReviewIndicator({ state }: { state: "idle" | "reviewing" | "approved" | "rejected" }) {
  const map = {
    idle:      { color: C.textMute, dot: C.border,   label: "Ready" },
    reviewing: { color: C.warn,     dot: C.warn,     label: "Reviewing…" },
    approved:  { color: C.mint,     dot: C.mint,     label: "Approved" },
    rejected:  { color: C.danger,   dot: C.danger,   label: "Needs revision" },
  }[state];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: map.dot, animation: state === "reviewing" ? "pulse 1s ease-in-out infinite" : undefined }} />
      <span style={{ fontSize: "11px", color: map.color, fontFamily: F.body }}>{map.label}</span>
    </div>
  );
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function buildScaffold(contractType: string, goal: string): Record<string, string> {
  const isERC721 = contractType === "ERC-721";
  const isERC20  = contractType === "ERC-20";
  const name = goal.split(" ").slice(-2).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("");

  return {
    imports: `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.19;\n\n// Byuld: These are the base contracts we're building on top of\n// TODO: Add your imports here\n`,
    contract: isERC721
      ? `// Byuld: This is your contract declaration — think of it as the file header\n// TODO: Declare your contract and what it inherits\ncontract ${name} {\n    // TODO: Add your state variables in the next section\n}\n`
      : `// TODO: Declare your ${contractType} contract\ncontract ${name} {\n}\n`,
    state: `// Byuld: These variables are stored permanently on the blockchain\n// TODO: Add the state variables your contract needs\n// Example: uint256 private _tokenCount;\n`,
    functions: `// Byuld: These are the actions your contract can perform\n// TODO: Write your core functions here\n`,
    security: `// Byuld: These control who can call your contract functions\n// TODO: Add modifiers and access control\n// Example: modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }\n`,
  };
}
