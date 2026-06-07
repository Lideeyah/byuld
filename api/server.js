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

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolves @openzeppelin imports from node_modules
function findImports(importPath) {
  try {
    const fullPath = importPath.startsWith("@")
      ? resolve(__dirname, "../node_modules", importPath)
      : resolve(__dirname, importPath);
    return { contents: readFileSync(fullPath, "utf8") };
  } catch {
    return { error: `File not found: ${importPath}` };
  }
}

const app = express();
// In production ALLOWED_ORIGIN is set to the Vercel URL; in dev allow everything
app.use(cors({ origin: process.env.ALLOWED_ORIGIN ?? "*" }));

// Raw body needed for webhook signature verification — must come before express.json()
app.use("/api/moonpay-webhook", express.raw({ type: "*/*" }));
app.use(express.json());

// Lazy init — never crash on startup if a key is missing
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY not set");
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

// ─── System prompts ────────────────────────────────────────────────────────────

function buildSystemPrompt(mode, persona, contractType, goal, chain) {
  const isFounder = persona === "founder";
  const ctx = `Contract type: ${contractType}. Goal: "${goal}". Chain: ${chain}.`;

  if (mode === "scaffold") {
    if (isFounder) {
      return `You are Byuld — an AI that teaches non-technical founders to build smart contracts by explaining exactly what the code does.
${ctx}

The user's contract scaffold has already been generated and is showing in the editor on the left. Your job is to:
1. In one sentence, confirm you understand their goal.
2. Walk through what the code in the first section (Imports & Pragma) does — explain each import line by line in plain English. What is OpenZeppelin? Why do we need each import? What does pragma do?
3. Tell them: the code is already there — their job is to READ it and understand it. When they're ready, they can move to the next section.

Be warm, clear, and specific. Reference the actual import names in the code. Under 150 words. No questions.`;
    }
    return `You are Byuld — an AI pair programmer for Solidity developers.
${ctx}

The contract scaffold is showing in the editor. In 2–3 sentences: confirm the architecture, note any trade-offs in the approach taken (OpenZeppelin base, Counters pattern, etc.), and tell them to review the imports then proceed section by section. Under 80 words. No questions.`;
  }

  if (mode === "review") {
    if (isFounder) {
      return `You are Byuld's code reviewer. The user just wrote a section of their smart contract.
${ctx}

Respond ONLY with JSON: { "approved": true|false, "message": "..." }

Approve if: meaningful Solidity code is present (not just comments/TODOs), and it's syntactically plausible.

If approved: Start with "✓ Nailed it." Then explain in plain English what their code DOES — not what it is, but what it actually means at runtime. What happens on the blockchain? Keep it to 2-3 sentences. End with "Next section is now unlocked."

If not approved: Start with "✗". In one sentence, tell them EXACTLY what line to change and what to write instead. Show the corrected code. No vague feedback.`;
    }
    return `You are Byuld's code reviewer for Solidity contracts.
${ctx}

Respond ONLY with JSON: { "approved": true|false, "message": "..." }

Approve if: meaningful non-trivial Solidity, no TODOs.
If approved: "✓" + one-line technical summary of what the code does. Mention gas implications if relevant.
If not: "✗" + exact fix with corrected code snippet.`;
  }

  if (mode === "chat") {
    if (isFounder) {
      return `You are Byuld — a patient, clear teacher helping a non-technical founder understand their smart contract.
${ctx}

Rules:
- Answer directly. No preamble like "Great question!"
- Always include the relevant code snippet if the question is about code. Show the line, then explain it.
- Under 100 words total.
- Plain English only. If you use a technical term, define it immediately.
- Do not ask follow-up questions.`;
    }
    return `You are Byuld — a senior Solidity engineer helping a Web2 dev transition to Web3.
${ctx}
Be direct. Show code when relevant. Under 80 words. No follow-up questions.`;
  }

  return "You are a helpful smart contract development assistant.";
}

function buildUserContent(mode, { goal, contractType, chain, code, userMessage }) {
  if (mode === "scaffold") return `My goal: "${goal}". Building a ${contractType} on ${chain}. Generate my welcome message.`;
  if (mode === "review")   return `Code section:\n\`\`\`solidity\n${code ?? ""}\n\`\`\`\nRespond with JSON only.`;
  if (mode === "chat")     return userMessage ?? "Can you help me?";
  return "";
}

// ─── POST /api/ai — standard JSON (used for review mode) ─────────────────────

app.post("/api/ai", async (req, res) => {
  const { mode, persona, contractType, goal, chain, code, userMessage } = req.body;
  if (!mode) return res.status(400).json({ error: "mode is required" });

  const system  = buildSystemPrompt(mode, persona ?? "founder", contractType ?? "ERC-721", goal ?? "", chain ?? "base");
  const content = buildUserContent(mode, { goal, contractType, chain, code, userMessage });

  try {
    const msg = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 400,
      system,
      messages: [{ role: "user", content }],
    });

    const text = msg.content[0]?.text ?? "";
    const tokens = msg.usage?.output_tokens ?? 0;

    if (mode === "review") {
      try {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          return res.json({ approved: parsed.approved ?? false, message: parsed.message ?? text, tokens });
        }
      } catch (_) {}
      return res.json({ approved: text.startsWith("✓"), message: text, tokens });
    }

    res.json({ message: text, tokens });
  } catch (err) {
    console.error("[Byuld API]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/ai/stream — SSE stream (scaffold + chat) ──────────────────────

app.post("/api/ai/stream", async (req, res) => {
  const { mode, persona, contractType, goal, chain, code, userMessage } = req.body;
  if (!mode) return res.status(400).json({ error: "mode is required" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const system  = buildSystemPrompt(mode, persona ?? "founder", contractType ?? "ERC-721", goal ?? "", chain ?? "base");
  const content = buildUserContent(mode, { goal, contractType, chain, code, userMessage });

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const stream = anthropic.messages.stream({
      model: "claude-opus-4-5",
      max_tokens: 400,
      system,
      messages: [{ role: "user", content }],
    });

    stream.on("text", (text) => send({ text }));

    const final = await stream.finalMessage();
    send({ done: true, tokens: final.usage?.output_tokens ?? 0 });
    res.end();
  } catch (err) {
    console.error("[Byuld Stream]", err.message);
    send({ error: err.message, done: true, tokens: 0 });
    res.end();
  }
});

// ─── POST /api/compile ────────────────────────────────────────────────────────

app.post("/api/compile", (req, res) => {
  const { source } = req.body;
  if (!source) return res.status(400).json({ error: "source is required" });

  const input = JSON.stringify({
    language: "Solidity",
    sources: { "contract.sol": { content: source } },
    settings: { outputSelection: { "*": { "*": ["abi", "evm.bytecode"] } } },
  });

  let output;
  try { output = JSON.parse(solc.compile(input, { import: findImports })); }
  catch (err) { return res.status(500).json({ error: "Compiler crashed: " + err.message }); }

  const errors = (output.errors ?? []).filter(e => e.severity === "error");
  if (errors.length) return res.status(400).json({ errors: errors.map(e => e.formattedMessage) });

  const fileContracts = output.contracts?.["contract.sol"];
  if (!fileContracts) return res.status(400).json({ error: "No contracts found" });

  const contractName = Object.keys(fileContracts)[0];
  const contract = fileContracts[contractName];

  res.json({
    contractName,
    abi: contract.abi,
    bytecode: "0x" + contract.evm.bytecode.object,
    warnings: (output.errors ?? []).filter(e => e.severity === "warning").map(e => e.formattedMessage),
  });
});

// ─── POST /api/create-payment-intent ─────────────────────────────────────────

app.post("/api/create-payment-intent", async (_req, res) => {
  try {
    const intent = await getStripe().paymentIntents.create({
      amount: 600,
      currency: "usd",
      description: "Byuld security review fee",
      metadata: { product: "byuld-review" },
    });
    res.json({ clientSecret: intent.client_secret });
  } catch (err) {
    console.error("[Stripe]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/moonpay-webhook ────────────────────────────────────────────────

app.post("/api/moonpay-webhook", (req, res) => {
  const sig    = req.headers["moonpay-signature-v2"];
  const secret = process.env.MOONPAY_WEBHOOK_SECRET;

  if (secret && sig) {
    const expected = crypto.createHmac("sha256", secret).update(req.body).digest("base64");
    if (expected !== sig) {
      console.warn("[MoonPay webhook] Invalid signature — rejected");
      return res.status(401).json({ error: "Invalid signature" });
    }
  }

  let event;
  try { event = JSON.parse(req.body.toString()); }
  catch { return res.status(400).json({ error: "Bad JSON" }); }

  if (event.type === "transaction_updated" && event.data?.status === "completed") {
    console.log(`[MoonPay] ✓ ETH confirmed — tx: ${event.data.cryptoTransactionId} wallet: ${event.data.walletAddress}`);
    // TODO: mark gas_funded = true in DB once Supabase is wired
  }

  res.json({ received: true });
});

// ─── POST /api/notify-deploy — post-deploy email via Resend ──────────────────

app.post("/api/notify-deploy", async (req, res) => {
  const { email, contractAddress, chain, contractType, txHash } = req.body;
  if (!email || !contractAddress) return res.status(400).json({ error: "email and contractAddress required" });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[Deploy email] No RESEND_API_KEY — would have emailed ${email}`);
    return res.json({ ok: true, skipped: true });
  }

  const explorerBase = chain === "ethereum" ? "https://etherscan.io"
    : chain === "polygon" ? "https://polygonscan.com"
    : "https://basescan.org";

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Byuld <noreply@byuld.xyz>",
        to: [email],
        subject: `Your ${contractType} contract is live on ${chain.charAt(0).toUpperCase() + chain.slice(1)}`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
            <h2 style="margin-bottom:8px">🎉 Contract deployed</h2>
            <p style="color:#555">Your <strong>${contractType}</strong> contract is live on <strong>${chain}</strong>.</p>
            <div style="background:#f5f5f5;border-radius:8px;padding:16px;margin:20px 0;font-family:monospace;font-size:13px;word-break:break-all">${contractAddress}</div>
            <a href="${explorerBase}/address/${contractAddress}" style="display:inline-block;background:#7B5CF0;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">View on explorer →</a>
            ${txHash ? `<p style="margin-top:20px;font-size:12px;color:#888">TX: ${txHash}</p>` : ""}
          </div>
        `,
      }),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}`);
    res.json({ ok: true });
  } catch (err) {
    console.error("[Resend]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Health ───────────────────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// Railway/Render inject PORT automatically; fall back to API_PORT for local dev
const PORT = process.env.PORT ?? process.env.API_PORT ?? 3001;
app.listen(PORT, () => console.log(`[Byuld API] :${PORT}`));
