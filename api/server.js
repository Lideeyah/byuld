import "dotenv/config";
import express from "express";
import cors from "cors";
import crypto from "crypto";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import Stripe from "stripe";
import solc from "solc";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const __dirname = dirname(fileURLToPath(import.meta.url));

// V1 deploys to Ethereum Sepolia — the pk910 PoW faucet funds any address with no gate.
const DEPLOY_CHAIN = sepolia;
const DEPLOY_RPC = process.env.ALCHEMY_KEY
  ? `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`
  : "https://ethereum-sepolia-rpc.publicnode.com";
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
  "RULE: Do NOT output paste-ready Solidity for the user — never hand them a complete line, statement, or block they can copy directly into the editor. That includes the full enum/variable/function they're being asked to write. " +
  "You SHOULD, however, be genuinely helpful: explain concepts clearly, name the exact values/variables the section needs (they're already written in the scaffold's TODO comments, so naming them is fine), describe the Solidity syntax in words, and give concrete hints. " +
  "Do NOT quiz the user with open-ended questions about things the scaffold already specifies, and do NOT assign them 'tasks'. Explain it plainly and let them type it. Only the final paste-ready code is off-limits.";

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
      `You are Byuld's tutor explaining ONE clicked line of Solidity to a Web3 learner.
${NEVER_WRITE_CODE}
For a ${isFounder ? "non-technical founder: use plain English and real-world analogies, max 3 sentences" : `developer: be technically accurate, mention the pattern, max 3 sentences${programmingLanguages.length ? `. They know ${programmingLanguages.join(", ")} — use comparisons to those languages` : ""}`}.
Just explain what this line/comment means and why it's there. Start with what the concept IS, never "This code...". Do NOT ask the user a question back. Do NOT assign a "task" or tell them to figure something out — they can already see what to write in the comment. Plain text only, no JSON, no code blocks.`,
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
  const { message, sectionId, currentCode, persona, line, chatHistory = [] } = req.body;
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
${line ? `The user is asking about this specific line of code: ${line}. Answer in the context of their escrow contract and their specific goal.` : ""}

If the user asks "what should I write", explain in words what the current section needs — you can name the exact values/variables (they're in the scaffold comments) and describe the syntax — but don't hand them the finished paste-ready line. Answer their actual question directly; don't deflect with a quiz.
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

// ─── Comprehension gate (3 parts) ──────────────────────────────────────────────

// PART 1 — POST /api/validate-summary
app.post("/api/validate-summary", async (req, res) => {
  const { summary } = req.body;
  try {
    const result = await claudeJSON(
      `You are validating whether a user genuinely understands their P2P Escrow contract.
Check their summary for ALL of: (1) the three parties — buyer, seller, arbiter; (2) that FUNDS are HELD/LOCKED by the contract itself, not by a person; (3) the condition under which funds get released.
The summary must be in their OWN words — if it reads as copied from scaffold comments, fail it.
Be reasonably generous: if they clearly understand all three points in plain language, pass them.

Respond in JSON only:
{ "passed": true|false, "corrections": ["specific thing missing or wrong — one sentence each"] }`,
      `User's summary: "${summary ?? ""}"`,
      500
    );
    res.json({ ...result, tokensUsed: 5 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PART 2 — POST /api/validate-bug-explanation
app.post("/api/validate-bug-explanation", async (req, res) => {
  const { field1, field2 } = req.body;
  try {
    const result = await claudeJSON(
      `You are checking whether a user understood a reentrancy vulnerability in a Solidity escrow contract.
The bug: ETH is transferred BEFORE the state is updated, enabling reentrancy.
field1 must identify the ordering problem (transfer happens before the state update / wrong order).
field2 must describe that an attacker could re-enter and drain funds / call release repeatedly / lose the contract's funds.
Both must show real understanding, not vague guesses.
${NEVER_WRITE_CODE}

Respond in JSON only:
{ "passed": true|false, "hint": "a specific hint if failed — never the answer" }`,
      `Field 1 (which line / what's the bug): "${field1 ?? ""}"\nField 2 (what would happen): "${field2 ?? ""}"`,
      500
    );
    res.json({ ...result, tokensUsed: 5 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PART 3 — POST /api/validate-decisions
app.post("/api/validate-decisions", async (req, res) => {
  const { answers } = req.body; // { order, access, state }
  try {
    const result = await claudeJSON(
      `You are checking whether a user can explain three key decisions in their escrow contract.
For EACH answer, check for genuine reasoning that shows they understand the CONSEQUENCE — not keywords, not copied phrases.
Fail any answer that is empty, "I don't know", "because Byuld said so", or otherwise shows no real understanding.

The three decisions:
- order: Why must state update before ETH is transferred? (correct reasoning involves reentrancy / attacker re-entering before the record changes)
- access: Why can't the seller release the funds themselves? (correct reasoning involves the seller having incentive to take money without delivering / conflict of interest)
- state: Why does the contract need to track its state at all? (correct reasoning involves preventing invalid actions / double release / enforcing the correct order of steps)

Respond in JSON only:
{ "passed": true|false, "failures": ["which decision failed and why — one sentence each"] }`,
      `Answers:\norder: "${answers?.order ?? ""}"\naccess: "${answers?.access ?? ""}"\nstate: "${answers?.state ?? ""}"`,
      600
    );
    res.json({ ...result, tokensUsed: 8 });
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

// ─── POST /api/compile — real solc-js compilation ──────────────────────────────

function compileSolidity(source) {
  const input = {
    language: "Solidity",
    sources: { "Escrow.sol": { content: source } },
    settings: { outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors ?? []).filter((e) => e.severity === "error");
  if (errors.length) return { error: errors.map((e) => e.formattedMessage).join("\n") };
  const file = output.contracts?.["Escrow.sol"];
  if (!file) return { error: "No contract found in source." };
  const name = Object.keys(file)[0];
  const c = file[name];
  return { name, abi: c.abi, bytecode: "0x" + c.evm.bytecode.object };
}

app.post("/api/compile", (req, res) => {
  const { source } = req.body;
  if (!source) return res.status(400).json({ error: "source is required" });
  try {
    const result = compileSolidity(source);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Compiler crashed: " + err.message });
  }
});

// ─── POST /api/deploy — REAL deployment to Base Sepolia testnet ────────────────
// Deploys via a server-funded testnet wallet. If DEPLOYER_PRIVATE_KEY is not set,
// returns 503 with a clear message — NEVER a fake address.

app.post("/api/deploy", async (req, res) => {
  const { source } = req.body;
  if (!source) return res.status(400).json({ error: "source is required" });

  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) {
    return res.status(503).json({
      error: "not_configured",
      message: "Testnet deployment is not configured yet. Set DEPLOYER_PRIVATE_KEY (a Sepolia-funded wallet) on the server to enable real deployment.",
    });
  }

  try {
    // 1. Compile
    const compiled = compileSolidity(source);
    if (compiled.error) return res.status(400).json({ error: "compile_error", message: compiled.error });

    // 2. Set up viem clients on Ethereum Sepolia
    const account = privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`);
    const walletClient = createWalletClient({ account, chain: DEPLOY_CHAIN, transport: http(DEPLOY_RPC) });
    const publicClient = createPublicClient({ chain: DEPLOY_CHAIN, transport: http(DEPLOY_RPC) });

    // 3. Check the deployer has gas
    const balance = await publicClient.getBalance({ address: account.address });
    if (balance === 0n) {
      return res.status(503).json({
        error: "no_gas",
        message: `The deployer wallet ${account.address} has no Sepolia ETH. Mine some free at https://sepolia-faucet.pk910.de then try again.`,
      });
    }

    // 4. Deploy (escrow has no constructor args once assembled from the sections)
    const hash = await walletClient.deployContract({ abi: compiled.abi, bytecode: compiled.bytecode });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    res.json({
      contractAddress: receipt.contractAddress,
      txHash: hash,
      explorerUrl: `https://sepolia.etherscan.io/address/${receipt.contractAddress}`,
      chain: "sepolia",
    });
  } catch (err) {
    console.error("[Deploy]", err.message);
    res.status(500).json({ error: "deploy_failed", message: err.message });
  }
});

// ─── GET /api/health ──────────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => res.json({ ok: true, model: MODEL, deployReady: !!process.env.DEPLOYER_PRIVATE_KEY, ts: Date.now() }));

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
