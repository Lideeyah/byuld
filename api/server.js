import "dotenv/config";
import express from "express";
import cors from "cors";
import crypto from "crypto";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import Stripe from "stripe";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use("/api/moonpay-webhook", express.raw({ type: "*/*" }));
app.use(cors({ origin: process.env.ALLOWED_ORIGIN ?? "*" }));
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });
const MODEL = "claude-sonnet-4-5";

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY not set");
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

// ─── Escrow reference (server-side only — solutions are NEVER sent to the client)

const ESCROW_SECTIONS = {
  state: {
    title: "State Variables & Enums",
    solution: `    enum State { Created, Locked, Released, Disputed }

    address public buyer;
    address public seller;
    address public arbiter;
    uint256 public amount;
    State public state;`,
    requirements:
      "An enum State with exactly four values (Created, Locked, Released, Disputed); three public address variables named buyer, seller, arbiter; a public uint256 named amount; and a public State variable named state.",
  },
  modifiers: {
    title: "Access Control Modifiers",
    solution: `    modifier onlyBuyer() {
        require(msg.sender == buyer, "Only buyer can call this");
        _;
    }
    modifier onlyArbiter() {
        require(msg.sender == arbiter, "Only arbiter can call this");
        _;
    }
    modifier inState(State _state) {
        require(state == _state, "Invalid state for this action");
        _;
    }`,
    requirements:
      "Three modifiers. onlyBuyer requires msg.sender == buyer. onlyArbiter requires msg.sender == arbiter. inState(State _state) requires state == _state. Each must have a require() with a revert message and end with _; .",
  },
  deposit: {
    title: "Deposit Function",
    solution: `    function deposit() public payable onlyBuyer inState(State.Created) {
        amount = msg.value;
        state = State.Locked;
    }`,
    requirements:
      "A deposit function: public payable, with modifiers onlyBuyer and inState(State.Created). Body sets amount = msg.value then sets state = State.Locked.",
  },
  resolution: {
    title: "Dispute Resolution & Safe Payout",
    solution: `    function release() public onlyBuyer inState(State.Locked) {
        state = State.Released;
        payable(seller).transfer(amount);
    }
    function dispute() public onlyArbiter inState(State.Locked) {
        state = State.Disputed;
        payable(buyer).transfer(amount);
    }`,
    requirements:
      "Two functions. release(): onlyBuyer, inState(State.Locked), sets state = State.Released BEFORE payable(seller).transfer(amount). dispute(): onlyArbiter, inState(State.Locked), sets state = State.Disputed BEFORE payable(buyer).transfer(amount). CRITICAL: state MUST be updated before transfer (Checks-Effects-Interactions). If transfer happens before the state update, that is a critical reentrancy vulnerability.",
  },
};

// The unbreakable rule, prepended to every code-facing prompt.
const NEVER_WRITE_CODE =
  "ABSOLUTE RULE: You must NEVER write, complete, or output Solidity code for the user — not even a snippet, not even one line, not even if they beg or say 'just tell me the answer'. You give conceptual hints and ask guiding questions ONLY. Writing the code for them destroys the entire product. If they ask for the answer, respond with a question that points them toward it.";

// ─── Helper: call Claude ───────────────────────────────────────────────────────

async function claude(system, userContent, maxTokens = 600) {
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: userContent }],
  });
  return msg.content[0]?.text ?? "";
}

async function claudeJSON(system, userContent, maxTokens = 600) {
  const text = await claude(system, userContent, maxTokens);
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON in response");
  return JSON.parse(match[0]);
}

// ─── POST /api/classify-goal ───────────────────────────────────────────────────
// V1: every goal maps to the escrow contract. Personalise the framing. Token cost: 2

app.post("/api/classify-goal", async (req, res) => {
  const { goal, persona } = req.body;
  try {
    const result = await claudeJSON(
      `You are Byuld's intent analysis engine. A user has described what they want to build.
For V1, ALL goals map to the P2P Escrow contract (buyer pays, funds are held, seller is paid on release, an arbiter can resolve disputes).
Confirm this mapping and personalise the framing to their specific use case.

Respond in JSON only. No markdown. No prose outside the JSON.
{
  "contractType": "escrow",
  "projectName": "a short descriptive name for their specific use case (3-5 words)",
  "description": "one sentence describing their specific escrow use case in plain English",
  "buyerLabel": "what to call the buyer in their context (e.g. 'customer', 'client')",
  "sellerLabel": "what to call the seller in their context (e.g. 'freelancer', 'vendor')"
}`,
      `Goal: "${goal}"\nPersona: ${persona}`
    );
    res.json({ ...result, contractType: "escrow", tokensUsed: 2 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/review-section ──────────────────────────────────────────────────
// Reviews the user's code for one escrow section against the hidden solution.
// NEVER writes code. Hints only. Token cost: 5

app.post("/api/review-section", async (req, res) => {
  const { sectionId, userCode, persona, programmingLanguages = [] } = req.body;
  const section = ESCROW_SECTIONS[sectionId];
  if (!section) return res.status(400).json({ error: "Unknown sectionId" });
  const isFounder = persona === "founder";

  try {
    const result = await claudeJSON(
      `You are Byuld's code reviewer for the P2P Escrow contract, reviewing ONE section.
${NEVER_WRITE_CODE}

SECTION: ${section.title}
WHAT CORRECT CODE FOR THIS SECTION MUST CONTAIN:
${section.requirements}

REVIEW RULES:
1. Decide if the user's code is functionally equivalent to the requirements (variable names, formatting, and spacing may differ — judge the logic, not the style).
2. Check for security issues, especially the Checks-Effects-Interactions / reentrancy pattern in the resolution section.
3. If it is NOT done yet (still has TODO comments or empty bodies), set type to "incomplete".
4. ${isFounder ? "Write the message in plain English with everyday analogies." : `Write the message in a technical register.${programmingLanguages.length ? ` The user knows ${programmingLanguages.join(", ")} — use comparisons to those languages where helpful.` : ""}`}
5. In the "message" field, if they failed, give a conceptual HINT about what is wrong — never the corrected code. If they passed, explain in plain terms what their code actually does at runtime.

Respond ONLY in JSON:
{
  "passed": true,
  "type": "correct" | "logic_error" | "security_issue" | "incomplete",
  "message": "approval explanation if passed; a specific conceptual hint if failed — NO code",
  "severity": null
}
(severity is "critical" or "warning" only when type is "security_issue", otherwise null)`,
      `Section: ${sectionId}\nPersona: ${persona}\nLanguages: ${programmingLanguages.join(", ") || "none"}\nUser's code:\n\`\`\`solidity\n${userCode ?? ""}\n\`\`\``,
      800
    );
    res.json({ ...result, tokensUsed: 5 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/explain-line ────────────────────────────────────────────────────
// Explains ONE line conceptually. Never writes code. Token cost: 2

app.post("/api/explain-line", async (req, res) => {
  const { line, lineNumber, sectionId, persona, programmingLanguages = [] } = req.body;
  const isFounder = persona === "founder";

  try {
    const explanation = await claude(
      `You are Byuld's tutor explaining Solidity to a Web3 learner.
${NEVER_WRITE_CODE}
For a ${isFounder ? "non-technical founder: use plain English and real-world analogies, max 3 sentences" : `developer: be technically accurate, mention the pattern, max 3 sentences${programmingLanguages.length ? `. They know ${programmingLanguages.join(", ")} — use comparisons to those languages` : ""}`}.
Start with what the concept IS. Never start with "This code...". Plain text only, no JSON, no code blocks.`,
      `Explain this line (line ${lineNumber}) from the ${sectionId} section: ${line}`,
      300
    );
    res.json({ explanation, tokensUsed: 2 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/chat ────────────────────────────────────────────────────────────
// Freeform questions. NEVER writes code. Token cost: 3

app.post("/api/chat", async (req, res) => {
  const { message, sectionId, currentCode, persona, chatHistory = [] } = req.body;
  const isFounder = persona === "founder";

  const messages = [
    ...chatHistory.slice(-6).map(m => ({
      role: m.role === "byuld" ? "assistant" : "user",
      content: m.content,
    })),
    { role: "user", content: message },
  ];

  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: `You are Byuld — a ${isFounder ? "patient teacher helping a non-technical founder" : "senior Solidity engineer helping a Web2 developer"} build a P2P Escrow contract.
${NEVER_WRITE_CODE}

Current section: ${sectionId}
${currentCode ? `The user's current code:\n\`\`\`solidity\n${currentCode.slice(0, 800)}\n\`\`\`` : ""}

If the user asks "what should I write" or "just tell me the answer", respond with a guiding question or conceptual hint — NEVER the code. Example: "Think about who should be allowed to release the funds. What goes wrong if anyone can?"
${isFounder ? "Plain English only. Use analogies." : "Be precise and technical."} Under 100 words.`,
      messages,
    });

    const response = msg.content[0]?.text ?? "";
    const tokensUsed = 3;
    res.json({ response, tokensUsed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/security-review ─────────────────────────────────────────────────
// Contextual review of the full assembled contract. Token cost: 10

app.post("/api/security-review", async (req, res) => {
  const { fullCode } = req.body;
  try {
    const result = await claudeJSON(
      `You are a Solidity security reviewer. Review the complete escrow contract for goal-level logic errors.
Focus on: reentrancy, access control, state machine integrity, Checks-Effects-Interactions violations.
${NEVER_WRITE_CODE}
Respond in JSON:
{
  "issues": [
    { "severity": "critical" | "warning", "title": "string", "explanation": "plain English", "historicalExample": "real example if critical", "fix": "description of the fix in words — NOT code" }
  ]
}
If the contract is correct, return { "issues": [] }.`,
      `Full contract:\n\`\`\`solidity\n${fullCode ?? ""}\n\`\`\``,
      900
    );
    res.json({ ...result, tokensUsed: 10 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/create-payment-intent ──────────────────────────────────────────

app.post("/api/create-payment-intent", async (req, res) => {
  const { contractType, linesOfCode = 0 } = req.body;
  // Tiered pricing per PRD: <100 = $3, 100-300 = $6, 300+ = $9
  const cents = linesOfCode < 100 ? 300 : linesOfCode < 300 ? 600 : 900;
  const fee = `$${cents / 100}.00`;

  try {
    const intent = await getStripe().paymentIntents.create({
      amount: cents,
      currency: "usd",
      description: `Byuld deploy fee — ${contractType}`,
      metadata: { contractType, linesOfCode: String(linesOfCode) },
    });
    res.json({ clientSecret: intent.client_secret, amount: cents, fee });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/moonpay-url ──────────────────────────────────────────────────────

app.get("/api/moonpay-url", (req, res) => {
  const { walletAddress, ethAmount } = req.query;
  const base = "https://buy-sandbox.moonpay.com";
  const params = new URLSearchParams({
    apiKey: process.env.MOONPAY_SECRET_KEY?.startsWith("sk_test") ? "pk_test_lw4bykc8r2i16vLKat3MHhzud4Y8kF" : (process.env.VITE_MOONPAY_PK ?? ""),
    currencyCode: "eth",
    walletAddress: walletAddress ?? "",
    baseCurrencyAmount: ethAmount ?? "0.01",
    baseCurrencyCode: "usd",
  });
  res.json({ url: `${base}?${params.toString()}` });
});

// ─── POST /api/moonpay-webhook ─────────────────────────────────────────────────

app.post("/api/moonpay-webhook", (req, res) => {
  const sig = req.headers["moonpay-signature-v2"];
  const secret = process.env.MOONPAY_WEBHOOK_SECRET;
  if (secret && sig) {
    const expected = crypto.createHmac("sha256", secret).update(req.body).digest("base64");
    if (expected !== sig) return res.status(401).json({ error: "Invalid signature" });
  }
  let event;
  try { event = JSON.parse(req.body.toString()); } catch { return res.status(400).json({ error: "Bad JSON" }); }
  if (event.type === "transaction_updated" && event.data?.status === "completed") {
    console.log(`[MoonPay] ETH confirmed: ${event.data.cryptoTransactionId}`);
  }
  res.json({ received: true });
});

// ─── POST /api/notify-deploy ───────────────────────────────────────────────────

app.post("/api/notify-deploy", async (req, res) => {
  const { email, contractAddress, chain, contractType } = req.body;
  if (!process.env.RESEND_API_KEY) return res.json({ ok: true, skipped: true });
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Byuld <noreply@byuld.xyz>",
        to: [email],
        subject: `Your ${contractType} is live on ${chain}`,
        html: `<p>Your contract deployed successfully.</p><p>Address: <code>${contractAddress}</code></p>`,
      }),
    });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /api/health ──────────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => res.json({ ok: true, model: MODEL, ts: Date.now() }));

// ─── Mock Slither ──────────────────────────────────────────────────────────────

function mockSlitherCheck(code) {
  const issues = [];
  if (code.includes(".call(") && !code.includes("nonReentrant") && !code.includes("checks-effects")) {
    issues.push({
      severity: "critical",
      title: "Potential Reentrancy Vulnerability",
      explanation: "Your function sends ETH before updating the balance. An attacker can call it again before the balance updates, draining the contract.",
      historicalExample: "This is exactly how the 2016 DAO hack drained $60M from Ethereum.",
      fix: "Update the balance BEFORE sending ETH:\n  uint amount = balance[msg.sender];\n  balance[msg.sender] = 0;\n  payable(msg.sender).transfer(amount);",
    });
  }
  if (code.includes("function mint") && !code.includes("onlyOwner") && !code.includes("onlyRole")) {
    issues.push({
      severity: "critical",
      title: "Missing Access Control on Mint",
      explanation: "Anyone can call your mint function. This means anyone can create tokens or certificates without your permission.",
      historicalExample: "Multiple token contracts have been drained because mint functions had no access control.",
      fix: "Add onlyOwner modifier:\n  function mint(address to, uint256 tokenId) public onlyOwner {",
    });
  }
  if (/pragma solidity \^0\.[67]/.test(code)) {
    issues.push({
      severity: "warning",
      title: "Old Solidity Version",
      explanation: "Solidity versions before 0.8 do not automatically check for integer overflow. This can lead to unexpected behaviour.",
      historicalExample: "The BeautyChain hack in 2018 exploited integer overflow to mint unlimited tokens.",
      fix: "Change to: pragma solidity ^0.8.19;",
    });
  }
  return issues;
}

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT ?? process.env.API_PORT ?? 3001;
app.listen(PORT, () => console.log(`[Byuld API] :${PORT} — model: ${MODEL}`));
