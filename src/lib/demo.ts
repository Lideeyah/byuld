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
  // a line-help question + a free chat question shown on section 1
  lineQuestion: string;
  chatQuestion: string;
}> = {
  founder: {
    languages: [],
    goal: "A safe way to hold a buyer's payment until the seller delivers the item, with a neutral referee for disputes",
    lineQuestion: "What does this do?",
    chatQuestion: "In plain English, what is an escrow and why do I need three people?",
  },
  developer: {
    languages: ["JavaScript"],
    goal: "An escrow that locks a client's payment until a freelancer delivers the work, with an arbiter to resolve disputes",
    lineQuestion: "Why is this here?",
    chatQuestion: "How is a Solidity modifier different from middleware in Express?",
  },
};

// The exact, correct code the demo types into each section (full file for `state`,
// the relevant block for the others — matches what a learner would write).
export const DEMO_SECTION_CODE: Record<string, string> = {
  state: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract Escrow {
    enum State { Created, Locked, Released, Disputed }
    address public buyer;
    address public seller;
    address public arbiter;
    uint256 public amount;
    State public state;
}`,
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

// Animate-type a string into the active Monaco model (no autoclose mess, reliable).
export async function typeIntoEditor(code: string, perLineMs = 55) {
  const monaco = (window as any).monaco;
  if (!monaco) return;
  const ed = monaco.editor.getEditors?.()[0] ?? null;
  const model = monaco.editor.getModels?.()[0];
  if (!model) return;
  const lines = code.split("\n");
  let acc = "";
  for (let i = 0; i < lines.length; i++) {
    acc += (i ? "\n" : "") + lines[i];
    model.setValue(acc);
    try { ed?.revealLine(model.getLineCount()); } catch { /* ignore */ }
    await sleep(perLineMs);
  }
}
