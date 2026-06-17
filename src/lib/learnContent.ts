import type { BuildPlan } from "../types";

// Pre-build context (P2) and Web3 mental-model primer (P3) content.
// Generated builds carry their own (from the plan); the escrow demo uses these.

export const ESCROW_EST_MINUTES = 15;

export const ESCROW_KEY_CONCEPTS = [
  { concept: "Holding funds in the contract", why: "The money is locked by code, not trusted to a person." },
  { concept: "Access control", why: "Only the right party can release or dispute — everyone else is blocked." },
  { concept: "A state machine", why: "The deal moves through valid stages only — it can't skip or repeat steps." },
  { concept: "Checks-Effects-Interactions", why: "Update the records before sending money, so funds can't be drained." },
];

export const ESCROW_MENTAL_MODEL = [
  { q: "What is a smart contract?", a: "A program that lives on the blockchain and runs exactly as written. For your escrow, it's the neutral middleman that holds the money." },
  { q: "Why hold the funds in the contract, not a person?", a: "Code can't change its mind or run off with the money. The contract releases funds only when the agreed conditions are met." },
  { q: "Why are transactions irreversible?", a: "Once value moves on-chain, no one can undo it — so the rules for releasing or refunding must be correct before you deploy." },
  { q: "Why does security matter more in Web3?", a: "This contract holds real value, and the code is public. One ordering mistake — sending money before updating state — has drained millions before." },
  { q: "What role does the arbiter play?", a: "When buyer and seller disagree, only the arbiter can resolve it. Who is allowed to do what is enforced by code, not trust." },
];

export function getContext(plan: BuildPlan | null) {
  if (plan) return {
    estimatedMinutes: plan.estimatedMinutes || ESCROW_EST_MINUTES,
    keyConcepts: (plan.keyConcepts && plan.keyConcepts.length ? plan.keyConcepts : ESCROW_KEY_CONCEPTS),
  };
  return { estimatedMinutes: ESCROW_EST_MINUTES, keyConcepts: ESCROW_KEY_CONCEPTS };
}

export function getMentalModel(plan: BuildPlan | null) {
  if (plan && plan.mentalModel && plan.mentalModel.length) return plan.mentalModel;
  return ESCROW_MENTAL_MODEL;
}
