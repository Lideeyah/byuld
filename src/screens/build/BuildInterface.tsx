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
  const isERC20 = contractType === "ERC-20";
  // Derive a clean PascalCase contract name from the goal
  const name = goal
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("")
    .replace(/[^a-zA-Z0-9]/g, "") || "MyContract";

  if (isERC20) {
    return {
      imports: `// SPDX-License-Identifier: MIT
// ↑ Required header. MIT means anyone can read and use your code.

pragma solidity ^0.8.19;
// ↑ Minimum Solidity compiler version. 0.8+ has overflow protection built in.

// OpenZeppelin is a library of secure, battle-tested contract code.
// We import it so we don't have to write standard token logic from scratch.

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
// ↑ Gives us the full ERC-20 token standard — transfers, balances, allowances.

import "@openzeppelin/contracts/access/Ownable.sol";
// ↑ Adds an "owner" role. Only you (the deployer) can call protected functions.`,

      contract: `contract ${name} is ERC20, Ownable {
// ↑ "is ERC20" — your contract inherits every ERC-20 feature automatically.
// ↑ "is Ownable" — adds owner-only protection to sensitive functions.

    // MAX_SUPPLY is the hard cap. No one can ever create more than this.
    uint256 public constant MAX_SUPPLY = 1_000_000 * 10 ** 18;
    // ↑ 10**18 because Solidity doesn't use decimals — 1 token = 10^18 units.

    // The constructor runs ONCE when you deploy. It sets the token name and symbol.
    constructor() ERC20("${name}", "${name.slice(0, 4).toUpperCase()}") Ownable(msg.sender) {
        // Mint the initial supply to whoever deploys the contract (you).
        _mint(msg.sender, 100_000 * 10 ** 18);
    }
}`,

      state: `    // Controls whether transfers are allowed. Useful for emergency situations.
    bool public paused = false;

    // Emitted as a log every time tokens are minted. Useful for tracking.
    event TokensMinted(address indexed to, uint256 amount);`,

      functions: `    // Only the owner can mint new tokens — up to the MAX_SUPPLY cap.
    function mint(address to, uint256 amount) external onlyOwner {
        require(totalSupply() + amount <= MAX_SUPPLY, "Would exceed max supply");
        _mint(to, amount);
        emit TokensMinted(to, amount);
        // ↑ emit writes a log to the blockchain — cheaper than storage, good for tracking.
    }

    // Anyone can burn (permanently destroy) their own tokens.
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
        // ↑ _burn removes tokens from circulation. Cannot be undone.
    }`,

      security: `    // Owner can pause all transfers in an emergency (e.g. if a bug is found).
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
    }

    // This hook runs before every transfer. We use it to enforce the pause.
    function _update(address from, address to, uint256 value) internal override {
        require(!paused || from == address(0), "Transfers are paused");
        // ↑ from == address(0) means it's a mint — we still allow minting when paused.
        super._update(from, to, value);
    }`,
    };
  }

  // Default: ERC-721 NFT
  return {
    imports: `// SPDX-License-Identifier: MIT
// ↑ Required header. MIT means anyone can read and use your code.

pragma solidity ^0.8.19;
// ↑ Minimum compiler version. 0.8+ has built-in overflow protection.

// OpenZeppelin is a library of secure, audited contract code used by top projects.

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
// ↑ Gives us the full NFT standard + the ability to store metadata URLs per token.

import "@openzeppelin/contracts/utils/Counters.sol";
// ↑ A safe counter for token IDs — prevents ID collisions and overflow.

import "@openzeppelin/contracts/access/Ownable.sol";
// ↑ Adds an "owner" — only you can call protected admin functions.`,

    contract: `contract ${name} is ERC721URIStorage, Ownable {
// ↑ "is ERC721URIStorage" — inherits the full NFT standard automatically.
// ↑ "is Ownable" — gives you exclusive access to owner-only functions.

    using Counters for Counters.Counter;
    // ↑ Tells Solidity to use Counters methods on any Counter type variable.

    Counters.Counter private _tokenIds;
    // ↑ Tracks the current token ID. Starts at 0 and only ever goes up.

    // Constructor runs ONCE at deployment. Sets the collection name and symbol.
    constructor() ERC721("${name}", "${name.slice(0, 4).toUpperCase()}") Ownable(msg.sender) {}
    // ↑ msg.sender is whoever deploys the contract — that's you. You become the owner.
}`,

    state: `    // The price to mint one token. 0.01 ether = 10,000,000,000,000,000 wei.
    uint256 public mintPrice = 0.01 ether;

    // Maximum tokens that can ever exist. Once reached, minting is permanently closed.
    uint256 public constant MAX_SUPPLY = 1000;

    // Base URL for token metadata (images, names, attributes).
    // Example: "ipfs://QmYourHash/" — token 1 resolves to that URL + "1.json"
    string private _baseTokenURI;`,

    functions: `    // Anyone can call this to mint a new NFT — they must pay mintPrice.
    function mint(address to, string memory tokenURI) external payable {
        require(msg.value >= mintPrice, "Not enough ETH sent");
        // ↑ msg.value is the ETH sent with the transaction. Must be >= mintPrice.
        require(_tokenIds.current() < MAX_SUPPLY, "All tokens have been minted");

        _tokenIds.increment();
        uint256 newTokenId = _tokenIds.current();

        _safeMint(to, newTokenId);
        // ↑ _safeMint handles ownership assignment and emits the Transfer event.

        _setTokenURI(newTokenId, tokenURI);
        // ↑ Links the token to its metadata URL (image, name, traits).
    }

    // Returns how many tokens have been minted so far.
    function totalMinted() external view returns (uint256) {
        return _tokenIds.current();
    }

    // Owner can withdraw all ETH collected from minting.
    function withdraw() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
        // ↑ Sends every wei in this contract to the owner's wallet.
    }`,

    security: `    // Only the owner can change the mint price.
    function setMintPrice(uint256 newPrice) external onlyOwner {
        mintPrice = newPrice;
    }

    // Only the owner can update where metadata is hosted.
    function setBaseURI(string memory newURI) external onlyOwner {
        _baseTokenURI = newURI;
    }

    // Returns the base URI — called internally by tokenURI().
    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    // Allows this contract to receive ETH directly (e.g. from minting payments).
    receive() external payable {}`,
  };
}
