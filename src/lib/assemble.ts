import type { BuildPlan, Section } from "../types";

// Build the full deployable Solidity source from the user's per-section code.
//
// - Escrow demo (plan === null): the build grows ONE contract, so each section
//   stores the whole contract-so-far. The most complete snapshot (the longest one
//   that's a full contract) IS the finished source.
// - Generated builds: the user types the header in the first section and the
//   closing brace in the last, so the source is the sections concatenated.
export function assembleContract(sections: Section[], plan: BuildPlan | null): string {
  if (!plan) {
    const full = sections
      .map((s) => s.code)
      .filter((c) => c && c.includes("pragma") && c.includes("contract "))
      .sort((a, b) => b.length - a.length)[0];
    if (full) return full;
  }
  return sections.map((s) => s.code).filter(Boolean).join("\n\n");
}
