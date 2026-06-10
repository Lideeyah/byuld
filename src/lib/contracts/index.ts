// V1: every goal maps to the escrow contract. This barrel keeps existing imports
// (`getSections`, `getSectionDef`) working while the source of truth is escrow.ts.

import { ESCROW_CONTRACT, type EscrowSection } from "./escrow";

export { ESCROW_CONTRACT };
export type { EscrowSection };

// Runtime section shape lives in types.ts ({ id, title, status, code }).
// The rich definitions (scaffold, solution, explanations) live here.
export function getSections(_contractType?: string): EscrowSection[] {
  return ESCROW_CONTRACT.sections;
}

export function getSectionDef(sectionId: string): EscrowSection | undefined {
  return ESCROW_CONTRACT.sections.find((s) => s.id === sectionId);
}
