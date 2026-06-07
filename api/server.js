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
// Token cost: 2

app.post("/api/classify-goal", async (req, res) => {
  const { goal, persona } = req.body;
  try {
    const result = await claudeJSON(
      `You are a Web3 contract classifier. Given a user's goal description, determine:
1. The most appropriate Solidity contract type: ERC721, ERC20, payment, dao, or custom
2. Whether a clarifying question is needed (true only if genuinely ambiguous)
3. If needed, ONE clarifying question with 2-3 answer options

Respond in JSON only:
{
  "contractType": "ERC721",
  "needsClarification": true,
  "clarificationQuestion": "Should certificates be transferable between users?",
  "clarificationOptions": ["Yes, transferable", "No, locked to recipient"]
}`,
      `Goal: "${goal}"\nPersona: ${persona}`
    );
    res.json({ ...result, tokensUsed: 2 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/generate-scaffold ──────────────────────────────────────────────
// Token cost: 8

app.post("/api/generate-scaffold", async (req, res) => {
  const { contractType, sectionIndex, sectionType, goal, persona, clarificationAnswers = {}, previousSections = [] } = req.body;
  const isFounder = persona === "founder";

  try {
    const code = await claude(
      `You are a Solidity scaffold generator for Byuld, a learn-by-writing Web3 platform.
Generate a scaffold for the specified contract section that the USER will fill in.

CRITICAL RULES:
1. The function/variable SIGNATURES are already written — include them
2. Function BODIES contain only TODO comments explaining what to write
3. Include helpful hints as code comments (// Hint: ...)
4. NO completed function bodies — user writes those
5. Return ONLY valid Solidity. No markdown fences. No explanations outside comments.

${isFounder
  ? "Use plain English comments and real-world analogies. Explain what things mean in everyday terms."
  : "Use technical comments. Reference patterns, gas implications, and security best practices."}

Context:
- Contract type: ${contractType}
- Section: ${sectionType} (index ${sectionIndex})
- User goal: "${goal}"
- Clarifications: ${JSON.stringify(clarificationAnswers)}
- Previous sections already written: ${previousSections.length} sections`,
      `Generate scaffold for section: ${sectionType}`
    );
    res.json({ code, tokensUsed: 8 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/review-section ──────────────────────────────────────────────────
// Token cost: 5

app.post("/api/review-section", async (req, res) => {
  const { code, sectionType, contractType, goal, persona, clarificationAnswers = {} } = req.body;
  const isFounder = persona === "founder";

  // Run mock Slither check first
  const slitherIssues = mockSlitherCheck(code);

  try {
    const result = await claudeJSON(
      `You are a Solidity code reviewer for Byuld. Review the user's code for:
1. Correctness — does it look compilable? does it match the section requirements?
2. Security — vulnerabilities: reentrancy, overflow, access control, etc.
3. Goal alignment — does it match what the user said they want to build?

${isFounder
  ? "Explanations must be plain English with real-world analogies."
  : "Use technical accuracy. Mention patterns and gas implications."}

For security issues:
- severity: critical, warning, or info
- Plain English explanation
- Historical example if critical
- Exact fix as a code snippet

Respond ONLY in JSON:
{
  "passed": true,
  "type": "correct",
  "explanation": "plain English explanation of what they wrote and what it does",
  "reason": "if failed, why",
  "hint": "if failed, a specific actionable hint",
  "securityIssues": [
    {
      "severity": "critical",
      "title": "Issue name",
      "explanation": "plain English",
      "historicalExample": "Real example from blockchain history",
      "fix": "exact corrected code"
    }
  ]
}`,
      `Code to review:\n\`\`\`solidity\n${code}\n\`\`\`\n\nSection: ${sectionType}\nContract type: ${contractType}\nGoal: "${goal}"\nClarifications: ${JSON.stringify(clarificationAnswers)}`
    );

    // Merge Slither issues with AI issues
    const allSecurityIssues = [...(result.securityIssues ?? []), ...slitherIssues];
    const hasCritical = allSecurityIssues.some(i => i.severity === "critical");

    res.json({
      ...result,
      passed: result.passed && !hasCritical,
      securityIssues: allSecurityIssues,
      tokensUsed: 5,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/explain-line ────────────────────────────────────────────────────
// Token cost: 2

app.post("/api/explain-line", async (req, res) => {
  const { line, lineNumber, fullCode, persona, goal } = req.body;
  const isFounder = persona === "founder";

  try {
    const explanation = await claude(
      `You are a Solidity tutor. Explain this specific line of code to a ${isFounder ? "non-technical founder" : "Web2 developer new to Web3"} building: "${goal}".

${isFounder
  ? "Use plain English and real-world analogies. Max 3 sentences. Never say 'this code'. Start with what the concept IS."
  : "Use technical accuracy. Mention patterns and implications. Max 3 sentences."}`,
      `Line ${lineNumber}: ${line}\n\nFull context:\n${fullCode?.slice(0, 500) ?? ""}`
    );
    res.json({ explanation, tokensUsed: 2 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/chat ────────────────────────────────────────────────────────────
// Token cost: 3-5

app.post("/api/chat", async (req, res) => {
  const { message, currentCode, goal, persona, chatHistory = [] } = req.body;
  const isFounder = persona === "founder";

  // Build conversation history
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
      system: `You are Byuld — a ${isFounder ? "patient teacher helping a non-technical founder" : "senior Solidity engineer helping a Web2 developer"} understand their smart contract.

Goal: "${goal}"
${currentCode ? `Current code:\n\`\`\`solidity\n${currentCode.slice(0, 800)}\n\`\`\`` : ""}

Rules:
- Answer directly. No preamble.
- ${isFounder ? "Plain English only. Use analogies. If you use a technical term, define it immediately." : "Be precise. Show code snippets where relevant."}
- Under 100 words unless they ask for more detail.
- Do NOT ask follow-up questions.`,
      messages,
    });

    const response = msg.content[0]?.text ?? "";
    const tokensUsed = Math.min(5, Math.max(3, Math.ceil(response.length / 100)));
    res.json({ response, tokensUsed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/validate-summary ───────────────────────────────────────────────
// Token cost: 5

app.post("/api/validate-summary", async (req, res) => {
  const { summary, contractType, sections = [], clarificationAnswers = {} } = req.body;

  try {
    const result = await claudeJSON(
      `You are validating whether a user's plain-English summary accurately describes their smart contract.

Check for:
1. Key functions mentioned (mint, transfer, burn, etc. as relevant)
2. Correct permission understanding (who can call what)
3. Awareness of irreversible actions (deployment, burning, etc.)

Be generous — if they have the right general understanding, pass them. Only fail if they have a genuinely wrong understanding.

Respond in JSON:
{
  "passed": true,
  "corrections": ["specific thing they missed or got wrong — be specific, one sentence each"]
}`,
      `Summary: "${summary}"\nContract type: ${contractType}\nClarifications: ${JSON.stringify(clarificationAnswers)}`
    );
    res.json({ ...result, tokensUsed: 5 });
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
