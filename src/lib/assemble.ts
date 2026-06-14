import type { BuildPlan, Section } from "../types";

// Build the full deployable Solidity source from the user's per-section code.
// Both escrow and generated builds are self-contained: the user types the file
// header (SPDX/pragma/contract declaration) in the first section and the closing
// brace in the last, so the full source is just the sections concatenated.
export function assembleContract(sections: Section[], _plan: BuildPlan | null): string {
  return sections.map((s) => s.code).filter(Boolean).join("\n\n");
}
