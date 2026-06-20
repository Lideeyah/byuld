// ─── Self-running demo orchestration ───────────────────────────────────────────
// Drives the REAL app + REAL APIs on autopilot so the whole journey can be
// screen-recorded with no extension and no "Claude is controlling…" banner.

export type DemoPersona = "founder" | "developer";

const KEY = "byuld_demo";

export interface DemoState { persona: DemoPersona; }

export function getDemo(): DemoState | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
export function setDemo(persona: DemoPersona) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ persona })); } catch { /* ignore */ }
}
export function clearDemo() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}

export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// Per-persona narrative content
export const DEMO_CONTENT: Record<DemoPersona, {
  languages: string[];
  goal: string;
  // a line-help question + a free chat question shown on section 1, with the
  // scripted answers the demo shows (no live AI — deterministic for recording)
  lineQuestion: string;
  lineAnswer: string;
  chatQuestion: string;
  chatAnswer: string;
}> = {
  founder: {
    languages: [],
    goal: "A safe way to hold a buyer's payment until the seller delivers the item, with a neutral referee for disputes",
    lineQuestion: "What does this do?",
    lineAnswer: "Think of it like a traffic light for the deal. This line lists the only stages the escrow can be in — Created, Locked, Released, Disputed — so the contract always knows exactly where things stand and can never act out of order.",
    chatQuestion: "In plain English, what is an escrow and why do I need three people?",
    chatAnswer: "An escrow is a neutral holding spot for money. Instead of trusting a stranger, the buyer puts the payment into the contract itself — where neither side can grab it. When the seller delivers, the funds release. The third person, the arbiter, only steps in if there's a dispute, deciding whether the seller gets paid or the buyer gets refunded. Three roles, zero blind trust.",
  },
  developer: {
    languages: ["JavaScript"],
    goal: "An escrow that locks a client's payment until a freelancer delivers the work, with an arbiter to resolve disputes",
    lineQuestion: "Why is this here?",
    lineAnswer: "It's an enum — a fixed set of named states (like a TypeScript union of string literals). The contract can only ever be in one at a time, which lets you gate functions by state and reject invalid transitions.",
    chatQuestion: "How is a Solidity modifier different from middleware in Express?",
    chatAnswer: "A modifier wraps a function with reusable checks — conceptually like Express middleware, but it runs inline: the `_;` marks where the function body executes. If a require() fails it reverts the entire transaction, so it's an all-or-nothing guard rather than a next() chain.",
  },
};

// Scripted, plain-English approval shown when each section passes review (no live AI).
export const DEMO_APPROVALS: Record<string, string> = {
  state: "Exactly right. You've declared the four stages the escrow can be in, the three people involved, and a place to hold the money — the foundation everything else builds on.",
  modifiers: "Perfect. These are your bouncers: they make sure only the right person can call each action, and only when the contract is in the correct stage.",
  deposit: "Nicely done. The buyer's payment is now locked inside the contract and the stage moves to Locked — the money is safely held, not sitting with any one person.",
  resolution: "That's the heart of it. Funds release to the seller when the buyer's happy, or refund to the buyer if the arbiter steps in — and you updated the state before sending, which is the safe order.",
};

// The demo builds ONE coherent contract that grows section by section. Each part
// below is just the body that lives INSIDE the contract; the header (SPDX + pragma
// + `contract Escrow {`) and the closing `}` are added so the editor always shows a
// complete, brace-balanced file as it's written.
export const DEMO_SECTION_IDS = ["state", "modifiers", "deposit", "resolution"] as const;

const DEMO_HEADER = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract Escrow {`;

export const DEMO_BODY_PARTS: Record<string, string> = {
  state: `    enum State { Created, Locked, Released, Disputed }
    address public buyer;
    address public seller;
    address public arbiter;
    uint256 public amount;
    State public state;`,
  modifiers: `    modifier onlyBuyer() {
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
  deposit: `    function deposit() public payable onlyBuyer inState(State.Created) {
        amount = msg.value;
        state = State.Locked;
    }`,
  resolution: `    function release() public onlyBuyer inState(State.Locked) {
        state = State.Released;
        payable(seller).transfer(amount);
    }
    function dispute() public onlyArbiter inState(State.Locked) {
        state = State.Disputed;
        payable(buyer).transfer(amount);
    }`,
};

// The contract text BEFORE section `i` is typed — no closing brace yet, ready to
// append the new section's body.
export function demoPrefix(i: number): string {
  const prior = DEMO_SECTION_IDS.slice(0, i).map(id => DEMO_BODY_PARTS[id]);
  return DEMO_HEADER + "\n" + (prior.length ? prior.join("\n\n") + "\n\n" : "");
}

// Back-compat: the full contract-so-far after section `i` is complete.
export const DEMO_SECTION_CODE: Record<string, string> = Object.fromEntries(
  DEMO_SECTION_IDS.map((id, i) => [id, demoPrefix(i) + DEMO_BODY_PARTS[id] + "\n}"])
);

// Comprehension answers the demo types (genuine, passing reasoning)
export const DEMO_COMPREHENSION = {
  summary:
    "The contract itself holds the buyer's money locked inside it — not a person. There are three parties: the buyer who pays, the seller who delivers, and an arbiter who settles disputes. The funds are released to the seller when the buyer confirms delivery, or refunded to the buyer if the arbiter rules on a dispute.",
  bugLine:
    "The money is transferred to the seller BEFORE the state is updated to Released — the order of operations is wrong.",
  bugEffect:
    "An attacker's contract could re-enter the release function during the transfer and call it again and again before the state changes, draining all of the contract's funds.",
  d1: "Because if the money is sent before the state changes, an attacker can re-enter and call it repeatedly before the record updates, draining the contract.",
  d2: "The seller has an incentive to take the money without delivering, so they must not be the one who can release the funds.",
  d3: "Tracking the state stops invalid actions — like releasing funds twice, or depositing after the contract is already locked.",
};

// The VISIBLE editor's current model. Critical: the build editor uses a different
// Monaco `path` (and therefore a different model) per section, so getModels()[0] is
// NOT the section on screen for sections 2+. Always drive the editor's active model.
function activeEditor(): any | null {
  const monaco = (window as any).monaco;
  return monaco?.editor?.getEditors?.()[0] ?? null;
}
function activeModel(): any | null {
  const ed = activeEditor();
  return ed?.getModel?.() ?? (window as any).monaco?.editor?.getModels?.()[0] ?? null;
}

// Wait until Monaco has mounted and the editor has a model. On slow connections (the
// editor loads from a CDN) this can lag a few seconds — without this the demo could
// try to "type" into nothing and leave the editor empty.
async function waitForModel(timeoutMs = 15000): Promise<any | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const model = activeModel();
    if (model) return model;
    await sleep(200);
  }
  return null;
}

// Show `prefix` immediately (the contract built so far, no closing brace), then
// animate the new section's body line by line, then close the contract. The editor
// always ends on a complete, balanced contract. Returns the final source.
export async function appendToContract(prefix: string, body: string, perLineMs = 55): Promise<string> {
  const model = await waitForModel();
  if (!model) return prefix + body + "\n}";
  const ed = activeEditor();
  model.setValue(prefix);
  let acc = prefix;
  const lines = body.split("\n");
  for (const ln of lines) {
    acc += ln + "\n";
    model.setValue(acc);
    try { ed?.revealLine(model.getLineCount()); } catch { /* ignore */ }
    await sleep(perLineMs);
  }
  const full = acc + "}";
  model.setValue(full);
  try { ed?.revealLine(model.getLineCount()); } catch { /* ignore */ }
  return full;
}

// Quick, non-animated set of the editor (used to show the contract-so-far instantly
// when a section opens, before the read pause).
export async function setEditorValue(code: string) {
  const model = await waitForModel();
  if (model) model.setValue(code);
}

// Back-compat helper — type a whole snippet from scratch (still waits for Monaco).
export async function typeIntoEditor(code: string, perLineMs = 55) {
  const model = await waitForModel();
  if (!model) return;
  const ed = activeEditor();
  const lines = code.split("\n");
  let acc = "";
  for (let i = 0; i < lines.length; i++) {
    acc += (i ? "\n" : "") + lines[i];
    model.setValue(acc);
    try { ed?.revealLine(model.getLineCount()); } catch { /* ignore */ }
    await sleep(perLineMs);
  }
}
