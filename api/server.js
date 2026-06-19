import "dotenv/config";
import express from "express";
import cors from "cors";
import crypto from "crypto";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";
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

// ─── User/deploy tracking (for the admin dashboard) ─────────────────────────────
// One record per email, upserted as the user progresses. Persisted best-effort to
// disk (survives restarts within an instance; for durable storage across redeploys
// connect a real DB). ADMIN_PASSWORD gates the read endpoint.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "make byuldminetoserve#0";
const DATA_DIR = resolve(__dirname, "data");

// Durable store: Postgres when DATABASE_URL is set (persists across redeploys),
// otherwise a local JSON file (dev / no-DB fallback). Each dataset is one JSON value
// in a tiny key/value table, so the in-memory upsert logic below stays unchanged.
const DB_URL = process.env.DATABASE_URL || "";
let pool = DB_URL ? new pg.Pool({
  connectionString: DB_URL,
  max: 3,
  ssl: /localhost|127\.0\.0\.1/.test(DB_URL) ? false : { rejectUnauthorized: false },
}) : null;

let USERS = [];
let WAITLIST = [];
let FEEDBACK = [];
// Append-only learning-analytics event log. Each entry is a single user action
// (screen time, question asked, concept viewed, funnel stage reached, …) tagged
// with a sessionId, so we can reconstruct journeys and measure understanding —
// not just signups. Capped to keep the JSON blob bounded.
let EVENTS = [];
const EVENTS_CAP = 50_000;

const fileFor = (key) => resolve(DATA_DIR, `${key}.json`);
const loadFile = (key) => { try { return JSON.parse(readFileSync(fileFor(key), "utf8")); } catch { return []; } };
const saveFile = (key, val) => { try { mkdirSync(DATA_DIR, { recursive: true }); writeFileSync(fileFor(key), JSON.stringify(val)); } catch { /* ephemeral fs is fine */ } };

async function dbSave(key, val) {
  if (!pool) return;
  try { await pool.query("INSERT INTO byuld_kv(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO UPDATE SET value=$2::jsonb", [key, JSON.stringify(val)]); }
  catch (e) { console.error("[db save]", key, e.message); }
}
async function dbLoad(key) {
  if (!pool) return null;
  try { const r = await pool.query("SELECT value FROM byuld_kv WHERE key=$1", [key]); return r.rows[0]?.value ?? []; }
  catch (e) { console.error("[db load]", key, e.message); return null; }
}
// Persist a dataset durably (fire-and-forget for the DB path — small, infrequent writes).
const persist = (key, val) => { if (pool) dbSave(key, val); else saveFile(key, val); };
function saveUsers() { persist("users", USERS); }
function saveWaitlist() { persist("waitlist", WAITLIST); }
function saveFeedback() { persist("feedback", FEEDBACK); }
// Events arrive in bursts (screen changes, questions). Debounce persistence so we
// don't write the whole log on every single event.
let eventsSaveTimer = null;
function saveEvents() {
  if (eventsSaveTimer) return;
  eventsSaveTimer = setTimeout(() => { eventsSaveTimer = null; persist("events", EVENTS); }, 2500);
}

// Load all datasets on boot (awaited before the server starts listening).
async function initStore() {
  if (pool) {
    try {
      await pool.query("CREATE TABLE IF NOT EXISTS byuld_kv (key text PRIMARY KEY, value jsonb NOT NULL DEFAULT '[]')");
      USERS = (await dbLoad("users")) || [];
      WAITLIST = (await dbLoad("waitlist")) || [];
      FEEDBACK = (await dbLoad("feedback")) || [];
      EVENTS = (await dbLoad("events")) || [];
      console.log(`[Byuld store] Postgres connected — users:${USERS.length} waitlist:${WAITLIST.length} feedback:${FEEDBACK.length} events:${EVENTS.length}`);
      return;
    } catch (e) {
      console.error("[Byuld store] DB init failed, falling back to files:", e.message);
      pool = null;
    }
  }
  USERS = loadFile("users"); WAITLIST = loadFile("waitlist"); FEEDBACK = loadFile("feedback"); EVENTS = loadFile("events");
  console.log("[Byuld store] file-backed (set DATABASE_URL for storage that survives redeploys)");
}

// Experience-adaptive tone (P4). Lightweight — adjusts depth/voice of explanations.
function toneFor(experienceLevel) {
  switch (experienceLevel) {
    case "founder": return "Audience: a non-technical founder. Use plain language, avoid jargon, lean on everyday analogies, and add a little extra context.";
    case "student": return "Audience: a student learning this. Be educational and add brief helpful context, but stay clear and concrete.";
    case "developer": return "Audience: a working developer. Be technically precise and skip hand-holding — don't over-simplify.";
    case "expert": return "Audience: an experienced Web3 builder. Be concise and minimal — assume the fundamentals, skip basics, get to what's specific.";
    default: return "";
  }
}

const STAGE_RANK = { signup: 0, onboarding: 1, building: 2, deployed: 3 };
function trackUser(ev) {
  if (!ev || !ev.email) return;
  const now = Date.now();
  const i = USERS.findIndex((u) => u.email === ev.email);
  if (i < 0) {
    USERS.push({ signedUpAt: now, ...ev, lastSeen: now });
  } else {
    const prev = USERS[i];
    // Never regress the stage (e.g. a later "building" ping shouldn't undo "deployed").
    const stage = (STAGE_RANK[ev.stage] ?? -1) >= (STAGE_RANK[prev.stage] ?? -1) ? ev.stage : prev.stage;
    USERS[i] = { ...prev, ...ev, stage, signedUpAt: prev.signedUpAt || now, lastSeen: now };
  }
  saveUsers();
}

// Funnel stages we recognise (used to compute drop-off). Order matters.
const FUNNEL = [
  { key: "visited",            label: "Users" },
  { key: "onboarding_complete",label: "Completed Onboarding" },
  { key: "review_reached",     label: "Reached Review" },
  { key: "build_started",      label: "Started Build" },
  { key: "ide_entered",        label: "Entered IDE" },
  { key: "audit_viewed",       label: "Viewed Audit" },
  { key: "session_complete",   label: "Completed Session" },
  { key: "returned",           label: "Returned User" },
  { key: "second_build",       label: "Started Second Build" },
];
const KNOWN_EVENTS = new Set([
  "session_start", "screen_time", "question", "concept_view", "explanation_view",
  "audit_view", "interaction", "stage",
]);

// Append a single learning-analytics event. Lightweight + defensive: bad/oversized
// payloads are dropped rather than throwing. lastSeen on the user is refreshed so
// active-user counts stay accurate even without a /api/track ping.
function recordEvent(ev) {
  if (!ev || typeof ev !== "object") return;
  const type = String(ev.type || "").slice(0, 40);
  if (!type) return;
  const entry = {
    ts: Number(ev.ts) || Date.now(),
    email: ev.email ? String(ev.email).slice(0, 200) : null,
    sessionId: ev.sessionId ? String(ev.sessionId).slice(0, 64) : null,
    type,
    screen: ev.screen ? String(ev.screen).slice(0, 40) : null,
    stage: ev.stage ? String(ev.stage).slice(0, 40) : null,
    durationMs: Number.isFinite(ev.durationMs) ? Math.max(0, Math.min(ev.durationMs, 6 * 3600_000)) : 0,
    concept: ev.concept ? String(ev.concept).slice(0, 80) : null,
    project: ev.project ? String(ev.project).slice(0, 60) : null,
    role: ev.role ? String(ev.role).slice(0, 40) : null,
  };
  EVENTS.push(entry);
  if (EVENTS.length > EVENTS_CAP) EVENTS = EVENTS.slice(-EVENTS_CAP);
  saveEvents();
  // Keep the per-user record's lastSeen fresh (best-effort; only if we know who).
  if (entry.email) {
    const i = USERS.findIndex((u) => u.email === entry.email);
    if (i >= 0) { USERS[i].lastSeen = entry.ts; saveUsers(); }
  }
}

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

// ─── POST /api/generate-build-plan ─────────────────────────────────────────────
// Turns ANY web3 goal into a tailored, guided build: a real Solidity contract
// split into ordered sections the user types themselves. The AI never writes the
// final code into the editor — it produces the scaffold (TODOs), the per-line
// guide, and the reviewer's reference requirements. Token cost: 25

app.post("/api/generate-build-plan", async (req, res) => {
  const { goal, persona = "founder", programmingLanguages = [] } = req.body;
  try {
    const SYSTEM =
      `You are Byuld's build-plan architect. A user described a web3 app they want to build.
Design a SINGLE, real, deployable Solidity contract for their goal and break it into EXACTLY 3 to 4 ordered
sections the user will TYPE themselves, one at a time. Byuld teaches; the user builds.

BE FAST AND CONCISE — this is generated live while the user waits. Keep all prose TIGHT: every
"description", "founderExplanation", "developerExplanation", "hint", "why", and "do" is ONE short sentence.
Scaffolds are a few comment lines, not paragraphs. Output only what the schema needs — no filler.

HARD REQUIREMENTS — follow exactly:
1. The contract must be a coherent whole. Byuld AUTOMATICALLY wraps the sections in:
     // SPDX-License-Identifier: MIT
     pragma solidity ^0.8.19;
     contract <ContractName> { ...sections in order... }
   So EVERY section contains ONLY the code that lives INSIDE the contract body.
2. NEVER put the SPDX line, the pragma line, the "contract X {" declaration, or the contract's closing "}"
   in any scaffold or guide step. (Function/struct/mapping braces are fine — just never the contract's own braces.)
3. Section 1 holds the state variables and the constructor. Each later section holds one focused function
   (or a small tightly-related group). When the section bodies are concatenated in order and wrapped, they
   MUST form one valid, compilable contract.
4. "scaffold" is what we put in the editor: ONLY "// Byuld:" teaching comments and "// TODO:" lines describing
   what to write. Do NOT put function signatures, variable declarations, or any real code in the scaffold —
   just the guiding comments. NEVER put the answer in the scaffold.
5. "requirements" is the reviewer's private reference: precisely what correct code for that section must contain.
6. "guide.steps[].code" is the COMPLETE, correct code the user types for that step — INCLUDING any function or
   constructor signatures and their braces. Concatenating every guide.steps[].code across ALL sections in order,
   then wrapping it per rule 1, MUST produce a complete, compilable contract. This is the source of truth.
7. Keep it achievable: small, focused functions. Prefer a well-known contract pattern that fits the goal
   (e.g. token, NFT mint, crowdfund, voting, tip jar, subscription, registry, staking, escrow).
8. Include at least one realistic securityNote on the section where it matters (e.g. access control on a
   mint/withdraw, reentrancy on a payout). Other sections may have securityNote = null.

Write founderExplanation in plain English with everyday analogies.
Write developerExplanation in a technical register${programmingLanguages.length ? `, drawing analogies to ${programmingLanguages.join(", ")}` : ""}.

Respond in JSON ONLY, no markdown:
{
  "contractName": "PascalCase contract identifier (e.g. TipJar)",
  "projectName": "a short, friendly 3-5 word title a human would use to refer to this build (e.g. 'Tip Jar for Creators', 'Event Ticket NFT', 'Marketplace Payment Escrow') — NOT the PascalCase identifier and NOT the user's raw sentence",
  "contractType": "short-slug",
  "description": "one sentence, plain English",
  "sections": [
    {
      "id": "short-slug-unique",
      "title": "Section title",
      "description": "one line",
      "founderExplanation": "plain English with an analogy",
      "developerExplanation": "technical framing",
      "scaffold": "editor content: comments + TODO + empty bodies, NO answers",
      "requirements": "exactly what correct code must contain (reviewer reference)",
      "hint": "a conceptual hint, never code",
      "securityNote": null,
      "guide": {
        "why": "plain-English reason this section exists",
        "steps": [ { "do": "what to type and why", "code": "the exact line(s) to type" } ]
      }
    }
  ],
  "comprehension": {
    "summaryPoints": ["3-4 things a correct plain-English summary of THIS contract must mention"],
    "decisions": [
      { "decision": "a real design decision in this contract", "question": "why does this matter? (the user must defend it)" }
    ]
  },
  "estimatedMinutes": 15,
  "keyConcepts": [
    { "concept": "a core concept this build uses (e.g. 'Access control', 'Holding funds in escrow')", "why": "one plain sentence on why it matters for THIS project" }
  ],
  "mentalModel": [
    { "q": "a builder-mindset question about how this kind of Web3 system works (e.g. 'Why hold funds in the contract, not a person?')", "a": "a 1-2 sentence answer tailored to THIS project — conceptual, not code" }
  ]
}
securityNote, when present, is { "severity": "critical"|"warning", "title": "string", "explanation": "plain English", "historicalExample": "real example or empty", "fix": "described in words, not code" }.
Provide exactly 3 decisions, 3-4 keyConcepts, and 4-5 mentalModel items. estimatedMinutes is a realistic number for a beginner to type and understand this build (typically 10-25). The mentalModel items must reflect what matters for THIS project type (e.g. escrow → trust, fund custody, disputes; NFT → ownership, verification; DAO → governance, voting).`;

    const userMsg = `Goal: "${goal}"\nPersona: ${persona}\nKnown languages: ${programmingLanguages.join(", ") || "none"}`;

    // The AI returns body-only sections. We deterministically add the file header
    // (SPDX license + pragma + contract declaration) as TYPED, EXPLAINED steps at the
    // start of section 1, and the closing brace at the end of the last section — so the
    // learner actually types and understands the boilerplate (it's not hidden magic),
    // and the final contract is just the sections concatenated.
    const addHeaderFooter = (p) => {
      const secs = p.sections || [];
      if (!secs.length) return p;
      const name = p.contractName || "MyContract";
      const first = secs[0];
      first.guide = first.guide || { why: "", steps: [] };
      first.guide.steps = [
        { do: "Every Solidity file opens by declaring its open-source license, so tools and other developers know how the code may be used. Type:", code: "// SPDX-License-Identifier: MIT" },
        { do: "Next, lock the compiler version so your contract always behaves exactly the same way (0.8.19 is a modern, safe version). Type:", code: "pragma solidity ^0.8.19;" },
        { do: "Now declare your contract — everything you build lives inside its { } braces. Type:", code: `\ncontract ${name} {` },
        ...(first.guide.steps || []),
      ];
      first.scaffold = `// Byuld: Every Solidity contract begins with three lines — a license, a\n// compiler-version "pragma", and the contract declaration. You'll type those\n// first (the guide shows them), then add this section's code inside the contract.\n\n` + (first.scaffold || "");
      if (first.requirements) first.requirements += ' The file must also begin with the "// SPDX-License-Identifier" comment, the "pragma solidity ^0.8.19;" line, and the contract declaration opening brace.';
      const last = secs[secs.length - 1];
      last.guide = last.guide || { why: "", steps: [] };
      last.guide.steps = [...(last.guide.steps || []), { do: "Finally, close the contract by adding its closing brace at the very end of the file. Type:", code: "}" }];
      if (last.requirements) last.requirements += " The contract must end with its closing brace }.";
      return p;
    };
    // Now that the header/footer live in the sections, the contract is just the
    // concatenated guide-step code — no separate wrapper.
    const assemble = (p) => (p.sections || []).map((s) => (s.guide?.steps || []).map((st) => st.code).join("\n")).join("\n\n");

    let plan = addHeaderFooter(await claudeJSON(SYSTEM, userMsg, 6000));
    let full = assemble(plan);
    let compiled = compileSolidity(full);
    if (compiled.error) {
      // One self-repair pass: hand the compiler error back and regenerate.
      plan = addHeaderFooter(await claudeJSON(
        SYSTEM,
        `${userMsg}\n\nA previous attempt did NOT compile. Compiler error:\n${String(compiled.error).slice(0, 1500)}\nReturn a corrected plan whose section bodies form a valid contract once Byuld adds the SPDX/pragma/contract header and closing brace.`,
        6000
      ));
      full = assemble(plan);
      compiled = compileSolidity(full);
    }
    res.json({ ...plan, fullContract: full, compiles: !compiled.error, tokensUsed: 25 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/validate-understanding ──────────────────────────────────────────
// Generic comprehension gate for AI-generated builds: judges a plain-English
// summary and the user's defence of each design decision against the contract.
// Never reveals answers. Token cost: 10

app.post("/api/validate-understanding", async (req, res) => {
  const { part, contractName, contractDescription, summaryPoints = [], decisions = [], summary, answers } = req.body;
  try {
    if (part === "summary") {
      const result = await claudeJSON(
        `You are validating whether a user genuinely understands the contract they just built ("${contractName}": ${contractDescription}).
A correct plain-English summary should cover these points: ${summaryPoints.map((p, i) => `(${i + 1}) ${p}`).join("; ")}.
It must be in their OWN words — if it reads as copied from scaffold comments, fail it.
Be reasonably generous: if they clearly understand the key points in plain language, pass.
Respond in JSON only: { "passed": true|false, "corrections": ["one sentence each — what's missing"] }`,
        `User's summary: "${summary ?? ""}"`,
        500
      );
      return res.json({ ...result, tokensUsed: 5 });
    }
    // part === "decisions"
    const result = await claudeJSON(
      `You are checking whether a user can DEFEND the key design decisions in the contract they built ("${contractName}": ${contractDescription}).
For each decision, check for genuine reasoning that shows they understand the CONSEQUENCE — not keywords, not copied phrases.
Fail any answer that is empty, "I don't know", "because Byuld said so", or shows no real understanding.
Decisions and the user's answers:
${decisions.map((d, i) => `(${i + 1}) Decision: "${d.decision}" — Question: "${d.question}" — User's answer: "${(answers && answers[i]) ?? ""}"`).join("\n")}
Respond in JSON only: { "passed": true|false, "failures": ["which decision failed and why — one sentence each"] }`,
      `Validate the ${decisions.length} answers above.`,
      700
    );
    res.json({ ...result, tokensUsed: 10 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/review-section ──────────────────────────────────────────────────
// Reviews the user's code for one escrow section against the hidden solution.
// NEVER writes code. Hints only. Token cost: 5

app.post("/api/review-section", async (req, res) => {
  const { sectionId, userCode, persona, experienceLevel, programmingLanguages = [], requirements, sectionTitle, contractName } = req.body;
  // Escrow sections live server-side; AI-generated builds pass their own
  // requirements/title from the client (the reviewer reference is never the answer code).
  const section = ESCROW_SECTIONS[sectionId];
  const reqText = requirements || section?.requirements;
  const title = sectionTitle || section?.title;
  if (!reqText) return res.status(400).json({ error: "Unknown section — no requirements provided" });
  const isFounder = persona === "founder";

  try {
    const result = await claudeJSON(
      `You are Byuld's code reviewer for ${contractName ? `the ${contractName} contract` : "a Solidity contract"}, reviewing ONE section.
${NEVER_WRITE_CODE}

SECTION: ${title}
WHAT CORRECT CODE FOR THIS SECTION MUST CONTAIN:
${reqText}

REVIEW RULES:
1. Decide if the user's code is functionally equivalent to the requirements (variable names, formatting, and spacing may differ — judge the logic, not the style).
2. Check for security issues, especially the Checks-Effects-Interactions / reentrancy pattern in the resolution section.
3. If it is NOT done yet (still has TODO comments or empty bodies), set type to "incomplete".
4. ${isFounder ? "Write the message in plain English with everyday analogies." : `Write the message in a technical register.${programmingLanguages.length ? ` The user knows ${programmingLanguages.join(", ")} — use comparisons to those languages where helpful.` : ""}`} ${toneFor(experienceLevel)}
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
  const { line, lineNumber, sectionId, persona, experienceLevel, programmingLanguages = [] } = req.body;
  const isFounder = persona === "founder";

  try {
    const explanation = await claude(
      `You are Byuld's tutor explaining ONE clicked line of Solidity to a Web3 learner.
${NEVER_WRITE_CODE}
${toneFor(experienceLevel)}
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
  const { message, sectionId, currentCode, persona, experienceLevel, line, chatHistory = [] } = req.body;
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
${isFounder ? "Plain English only. Use analogies." : "Be precise and technical."} ${toneFor(experienceLevel)} Under 100 words.`,
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
  // Record the deploy for the admin dashboard (works even without email service).
  trackUser({ email, contractAddress, chain, contractType, stage: "deployed", deployedAt: Date.now() });
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

// ─── POST /api/track ───────────────────────────────────────────────────────────
// Frontend records user progress (signup → onboarding → building → deployed).
app.post("/api/track", (req, res) => {
  const { email, persona, experienceLevel, contractType, chain, tokensUsed, stage, contractAddress, deployedAt } = req.body || {};
  trackUser({ email, persona, experienceLevel, contractType, chain, tokensUsed, stage, contractAddress, deployedAt });
  res.json({ ok: true });
});

// ─── POST /api/event ───────────────────────────────────────────────────────────
// Learning-analytics event ingest. Accepts a single event or a batch (sent via
// fetch or navigator.sendBeacon on page unload). Fire-and-forget — always 200s
// quickly so it never blocks the UI.
app.post("/api/event", (req, res) => {
  const body = req.body || {};
  const events = Array.isArray(body.events) ? body.events : [body];
  for (const ev of events.slice(0, 50)) recordEvent(ev);
  res.json({ ok: true });
});

// ─── POST /api/user-status ─────────────────────────────────────────────────────
// After sign-in the client asks: has this email used Byuld before? If so, they've
// onboarded → send them straight to the dashboard instead of repeating onboarding.
// This is the account-tied source of truth (localStorage is per-device and empty
// for a returning user on a new browser). Returns minimal, non-sensitive info.
app.post("/api/user-status", (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email) return res.json({ returning: false, persona: null, experienceLevel: null });
  const u = USERS.find((x) => String(x.email || "").toLowerCase() === email);
  res.json({ returning: !!u, persona: u?.persona ?? null, experienceLevel: u?.experienceLevel ?? null });
});

// ─── POST /api/feedback ────────────────────────────────────────────────────────
// Post-flow survey (kind="flow") and always-available quick feedback (kind="quick").
app.post("/api/feedback", (req, res) => {
  const b = req.body || {};
  const entry = {
    kind: b.kind === "quick" ? "quick" : "flow",
    email: String(b.email || "").trim().toLowerCase(),
    experienceLevel: b.experienceLevel || null,
    contractType: b.contractType || null,
    // flow survey
    rating: Number(b.rating) || null,
    understanding: Number(b.understanding) || null,
    wouldUseAgain: b.wouldUseAgain || null,        // "yes" | "maybe" | "no"
    mostValuable: b.mostValuable || null,
    confused: String(b.confused || "").trim(),
    learned: String(b.learned || "").trim(),
    // quick feedback
    issue: String(b.issue || "").trim(),
    improve: String(b.improve || "").trim(),
    at: Date.now(),
  };
  FEEDBACK.push(entry);
  saveFeedback();
  res.json({ ok: true });
});

// ─── POST /api/waitlist ────────────────────────────────────────────────────────
// "Get Early Access" signups. Upsert by email so re-submits update, not duplicate.
app.post("/api/waitlist", (req, res) => {
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const role = String(req.body?.role || "").trim();
  const challenge = String(req.body?.challenge || "").trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: "A valid email is required." });
  if (!name) return res.status(400).json({ error: "Your name is required." });
  const now = Date.now();
  const entry = { name, email, role, challenge, at: now };
  const i = WAITLIST.findIndex((w) => w.email === email);
  if (i < 0) WAITLIST.push(entry); else WAITLIST[i] = { ...WAITLIST[i], ...entry };
  saveWaitlist();
  res.json({ ok: true });
});

// ─── Learning analytics engine ─────────────────────────────────────────────────
// Reconstructs sessions and journeys from the event log to measure understanding
// and engagement — not just signups. All time-based metrics come from real
// recorded screen_time / question / concept events; nothing is fabricated.

const WINDOWS = { "72h": 3 * 86_400_000, "7d": 7 * 86_400_000, "30d": 30 * 86_400_000, all: Infinity };

const identityOf = (e) => e.email || e.sessionId || "anon";
const SCREEN_LABEL = {
  onboarding: "Onboarding", goal: "Goal", review: "Review", primer: "Primer",
  ide: "IDE", audit: "Audit", deploy: "Deploy", success: "Success", dashboard: "Dashboard",
};

// Group all events into sessions (keyed by sessionId), each with derived rollups.
function buildSessions(events) {
  const map = new Map();
  for (const e of events) {
    const sid = e.sessionId || `na:${e.email || "anon"}:${Math.floor((e.ts || 0) / 1800000)}`;
    let s = map.get(sid);
    if (!s) { s = { sessionId: sid, email: e.email || null, start: e.ts, end: e.ts, screens: new Set(), stages: new Set(), questions: 0, concepts: 0, explanations: 0, audits: 0, timeByScreen: {}, project: null }; map.set(sid, s); }
    s.start = Math.min(s.start, e.ts); s.end = Math.max(s.end, e.ts);
    if (e.email && !s.email) s.email = e.email;
    if (e.project && !s.project) s.project = e.project;
    if (e.screen) s.screens.add(e.screen);
    if (e.type === "stage" && e.stage) s.stages.add(e.stage);
    if (e.type === "question") s.questions++;
    if (e.type === "concept_view") s.concepts++;
    if (e.type === "explanation_view") s.explanations++;
    if (e.type === "audit_view") s.audits++;
    if (e.type === "screen_time" && e.screen) s.timeByScreen[e.screen] = (s.timeByScreen[e.screen] || 0) + (e.durationMs || 0);
  }
  for (const s of map.values()) {
    const screenSum = Object.values(s.timeByScreen).reduce((a, b) => a + b, 0);
    s.durationMs = screenSum > 0 ? screenSum : Math.max(0, s.end - s.start);
  }
  return [...map.values()];
}

function computeLearning(windowKey) {
  const now = Date.now();
  const since = now - (WINDOWS[windowKey] ?? Infinity);
  const evs = EVENTS.filter((e) => (e.ts || 0) >= since);

  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const avg = (a) => (a.length ? sum(a) / a.length : 0);
  const r1 = (n) => Math.round(n * 10) / 10;
  const min = (ms) => r1(ms / 60000);

  const sessions = buildSessions(evs);
  const allSessions = buildSessions(EVENTS); // all-time, for return analytics

  // ── Stage reach (per identity) for the funnel ──
  const reached = Object.fromEntries(FUNNEL.map((f) => [f.key, new Set()]));
  const has = (s, key) => s.stages.has(key);
  for (const s of sessions) {
    const id = s.email || s.sessionId;
    reached.visited.add(id);
    if (has(s, "onboarding_complete")) reached.onboarding_complete.add(id);
    if (has(s, "review_reached") || s.screens.has("review")) reached.review_reached.add(id);
    if (has(s, "build_started")) reached.build_started.add(id);
    if (has(s, "ide_entered") || s.screens.has("ide")) reached.ide_entered.add(id);
    if (has(s, "audit_viewed") || s.audits > 0 || s.screens.has("audit")) reached.audit_viewed.add(id);
    if (has(s, "session_complete") || s.screens.has("success")) reached.session_complete.add(id);
  }
  // Returned / second build are inherently multi-session → compute all-time per email.
  const byEmail = new Map();
  for (const s of allSessions) {
    if (!s.email) continue;
    let g = byEmail.get(s.email);
    if (!g) { g = { sessions: [], builds: 0 }; byEmail.set(s.email, g); }
    g.sessions.push(s);
    if (s.stages.has("build_started") || s.screens.has("ide")) g.builds++;
  }
  for (const [email, g] of byEmail) {
    if (g.sessions.length > 1) reached.returned.add(email);
    if (g.builds > 1) reached.second_build.add(email);
  }

  // Blend in users recorded BEFORE event tracking existed. They have no events,
  // but their stored stage still places them in the funnel — so the people who
  // already used Byuld are represented (the richer time/question metrics simply
  // start from real events onward). Scoped to the window by last-seen / signup.
  for (const u of USERS) {
    if (!u.email) continue;
    const ts = u.lastSeen || u.signedUpAt || 0;
    if (ts < since) continue;
    const id = u.email;
    reached.visited.add(id);
    if (u.persona) reached.onboarding_complete.add(id);
    const rank = STAGE_RANK[u.stage] ?? -1;
    if (rank >= 2 || u.contractAddress) { // building or further
      reached.review_reached.add(id);
      reached.build_started.add(id);
      reached.ide_entered.add(id);
    }
    if (rank >= 3 || u.contractAddress) { // deployed
      reached.audit_viewed.add(id);
      reached.session_complete.add(id);
    }
  }

  const funnel = FUNNEL.map((f, i) => {
    const count = reached[f.key].size;
    const prev = i === 0 ? count : reached[FUNNEL[i - 1].key].size;
    return { key: f.key, label: f.label, count, dropoffPct: prev ? r1(((prev - count) / prev) * 100) : 0 };
  });

  // ── Learning metrics ──
  const sWith = (k) => sessions.filter((s) => (s.timeByScreen[k] || 0) > 0).map((s) => s.timeByScreen[k]);
  const durations = sessions.map((s) => s.durationMs);
  const engagement = (s) => min(s.durationMs) + s.questions * 2 + s.concepts + s.explanations;
  const byEmailWindow = new Map();
  for (const s of sessions) {
    const id = s.email || s.sessionId;
    byEmailWindow.set(id, (byEmailWindow.get(id) || 0) + engagement(s));
  }
  let mostEngaged = null;
  for (const [id, score] of byEmailWindow) if (!mostEngaged || score > mostEngaged.score) mostEngaged = { id, score: r1(score) };
  const longest = sessions.reduce((m, s) => (!m || s.durationMs > m.durationMs ? s : m), null);
  const identityMaxDur = new Map();
  for (const s of sessions) { const id = s.email || s.sessionId; identityMaxDur.set(id, Math.max(identityMaxDur.get(id) || 0, s.durationMs)); }
  const activeOver = (m) => [...identityMaxDur.values()].filter((d) => d > m * 60000).length;

  const learningMetrics = {
    avgSessionDuration: min(avg(durations)),
    avgIdeTime: min(avg(sWith("ide"))),
    avgReviewTime: min(avg(sWith("review"))),
    avgAuditTime: min(avg(sWith("audit"))),
    avgQuestions: r1(avg(sessions.map((s) => s.questions))),
    avgConcepts: r1(avg(sessions.map((s) => s.concepts))),
    avgExplanations: r1(avg(sessions.map((s) => s.explanations))),
    avgScreens: r1(avg(sessions.map((s) => s.screens.size))),
    longestSession: longest ? { min: min(longest.durationMs), who: longest.email || "anonymous" } : null,
    mostEngagedUser: mostEngaged ? { who: mostEngaged.id, score: mostEngaged.score } : null,
    activeOver10: activeOver(10),
    activeOver20: activeOver(20),
    activeOver30: activeOver(30),
  };

  // ── Project analytics ── one count per build: from event sessions AND from the
  // existing user records (so projects built before event tracking still count).
  const projectTally = {};
  for (const s of sessions) if (s.project) projectTally[s.project] = (projectTally[s.project] || 0) + 1;
  for (const u of USERS) {
    const ts = u.lastSeen || u.signedUpAt || 0;
    if (u.contractType && ts >= since) projectTally[u.contractType] = (projectTally[u.contractType] || 0) + 1;
  }
  const projects = Object.entries(projectTally).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

  // ── Concept analytics ──
  const conceptMap = new Map();
  for (const e of evs) if (e.type === "concept_view" && e.concept) {
    let c = conceptMap.get(e.concept);
    if (!c) { c = { concept: e.concept, views: 0, users: new Set(), time: 0 }; conceptMap.set(e.concept, c); }
    c.views++; c.users.add(identityOf(e)); c.time += e.durationMs || 0;
  }
  const concepts = [...conceptMap.values()].map((c) => ({ concept: c.concept, views: c.views, uniqueUsers: c.users.size, avgTimeSec: c.views ? Math.round(c.time / c.views / 1000) : 0 })).sort((a, b) => b.views - a.views);

  // ── User overview ── active = anyone with an event OR a recorded last-seen in the window.
  const activeIds = new Set(evs.map(identityOf));
  for (const u of USERS) if (u.email && (u.lastSeen || u.signedUpAt || 0) >= since) activeIds.add(u.email);
  const newUsers = USERS.filter((u) => (u.signedUpAt || 0) >= since).length;
  const userOverview = {
    totalUsers: USERS.length,
    activeUsers: activeIds.size,
    newUsers,
    returningUsers: reached.returned.size,
  };

  // ── Return analytics (all-time) ──
  const gaps = [];
  let multi = 0;
  for (const [, g] of byEmail) {
    const starts = g.sessions.map((s) => s.start).sort((a, b) => a - b);
    if (starts.length > 1) { multi++; for (let i = 1; i < starts.length; i++) gaps.push(starts[i] - starts[i - 1]); }
  }
  const returnAnalytics = {
    returnRatePct: byEmail.size ? r1((multi / byEmail.size) * 100) : 0,
    avgSessionsPerUser: byEmail.size ? r1(avg([...byEmail.values()].map((g) => g.sessions.length))) : 0,
    avgProjectsPerUser: byEmail.size ? r1(avg([...byEmail.values()].map((g) => g.builds))) : 0,
    avgHoursBetweenSessions: gaps.length ? r1(avg(gaps) / 3600000) : 0,
  };

  // ── Activity feed (most recent events, humanised) ──
  const labelFor = (e) => {
    switch (e.type) {
      case "session_start": return "Started a session";
      case "screen_time": return `Spent ${min(e.durationMs)}m on ${SCREEN_LABEL[e.screen] || e.screen || "a screen"}`;
      case "question": return "Asked a question";
      case "concept_view": return `Viewed concept: ${e.concept || "—"}`;
      case "explanation_view": return "Viewed an explanation";
      case "audit_view": return "Viewed the security audit";
      case "stage": return (FUNNEL.find((f) => f.key === e.stage)?.label) || `Reached: ${e.stage}`;
      default: return e.type;
    }
  };
  const activityFeed = evs
    .slice(-400).reverse()
    .map((e) => ({ ts: e.ts, who: e.email || (e.sessionId ? `anon·${String(e.sessionId).slice(0, 6)}` : "anonymous"), label: labelFor(e), type: e.type, screen: e.screen }));

  return { windowKey, since, userOverview, funnel, learningMetrics, projects, concepts, returnAnalytics, activityFeed, sessionsCount: sessions.length };
}

// ─── POST /api/admin/metrics ───────────────────────────────────────────────────
// Password-gated. Returns real users/deploys/waitlist for the admin dashboard.
app.post("/api/admin/metrics", (req, res) => {
  if (String(req.body?.password || "").trim() !== ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });
  const now = Date.now();
  const oneDay = 86_400_000;
  const windowKey = WINDOWS[req.body?.window] !== undefined ? req.body.window : "7d";
  const users = [...USERS].sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
  const waitlist = [...WAITLIST].sort((a, b) => (b.at || 0) - (a.at || 0));
  const feedback = [...FEEDBACK].sort((a, b) => (b.at || 0) - (a.at || 0));

  // Distributions / aggregates.
  const tally = (items, key) => items.reduce((m, x) => { const k = x[key]; if (k) m[k] = (m[k] || 0) + 1; return m; }, {});
  const flow = feedback.filter((f) => f.kind === "flow");
  const avg = (arr) => arr.length ? Math.round((arr.reduce((s, n) => s + n, 0) / arr.length) * 10) / 10 : 0;

  // Feedback analytics (windowed), with free-text improvement requests + challenges surfaced.
  const since = now - (WINDOWS[windowKey] ?? Infinity);
  const fWin = feedback.filter((f) => (f.at || 0) >= since);
  const flowWin = fWin.filter((f) => f.kind === "flow");
  const textBits = (key) => fWin.map((f) => (f[key] || "").trim()).filter(Boolean).slice(0, 50);
  const feedbackAnalytics = {
    total: fWin.length,
    avgUnderstanding: avg(flowWin.map((f) => f.understanding).filter(Boolean)),
    avgRating: avg(flowWin.map((f) => f.rating).filter(Boolean)),
    wouldUseAgain: tally(flowWin, "wouldUseAgain"),
    mostValuable: tally(flowWin, "mostValuable"),
    improvementRequests: [...textBits("improve"), ...textBits("missing")],
    challenges: [...textBits("confused"), ...textBits("issue")],
  };

  res.json({
    totalUsers: users.length,
    completedOnboarding: users.filter((u) => u.persona).length,
    activeLast24h: users.filter((u) => now - (u.lastSeen || 0) < oneDay).length,
    totalDeployments: users.filter((u) => u.stage === "deployed" || u.contractAddress).length,
    experienceDistribution: tally(users, "experienceLevel"),
    waitlistCount: waitlist.length,
    waitlistRoles: tally(waitlist, "role"),
    feedbackCount: feedback.length,
    feedbackStats: {
      avgRating: avg(flow.map((f) => f.rating).filter(Boolean)),
      avgUnderstanding: avg(flow.map((f) => f.understanding).filter(Boolean)),
      wouldUseAgain: tally(flow, "wouldUseAgain"),
      mostValuable: tally(flow, "mostValuable"),
    },
    // Learning analytics — the important part. Windowed by ?window=72h|7d|30d|all.
    learning: computeLearning(windowKey),
    feedbackAnalytics,
    recentUsers: users.slice(0, 100),
    waitlist: waitlist.slice(0, 200),
    feedback: feedback.slice(0, 200),
  });
});

// ─── POST /api/admin/export ────────────────────────────────────────────────────
// Password-gated. A reusable, bucketed snapshot of everything we have — designed
// to answer "show me the last 72h / 7d". Returns the learning analytics computed
// for each window plus the raw counts, so it can be pasted/inspected anywhere.
app.post("/api/admin/export", (req, res) => {
  if (String(req.body?.password || "").trim() !== ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });
  const now = Date.now();
  const bucket = (sinceMs) => {
    const since = now - sinceMs;
    return {
      newUsers: USERS.filter((u) => (u.signedUpAt || 0) >= since).length,
      activeUsers: new Set(EVENTS.filter((e) => (e.ts || 0) >= since).map(identityOf)).size,
      events: EVENTS.filter((e) => (e.ts || 0) >= since).length,
      feedback: FEEDBACK.filter((f) => (f.at || 0) >= since).length,
      waitlist: WAITLIST.filter((w) => (w.at || 0) >= since).length,
      deployments: USERS.filter((u) => (u.deployedAt || 0) >= since).length,
    };
  };
  res.json({
    generatedAt: new Date(now).toISOString(),
    totals: { users: USERS.length, events: EVENTS.length, feedback: FEEDBACK.length, waitlist: WAITLIST.length },
    instrumentationStart: EVENTS.length ? new Date(Math.min(...EVENTS.map((e) => e.ts || now))).toISOString() : null,
    windows: {
      last72h: { ...bucket(WINDOWS["72h"]), learning: computeLearning("72h") },
      last7d: { ...bucket(WINDOWS["7d"]), learning: computeLearning("7d") },
      last30d: { ...bucket(WINDOWS["30d"]), learning: computeLearning("30d") },
      allTime: { learning: computeLearning("all") },
    },
  });
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
initStore().finally(() => {
  app.listen(PORT, () => console.log(`[Byuld API] :${PORT} — model: ${MODEL}`));
});
