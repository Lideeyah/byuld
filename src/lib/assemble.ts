import type { BuildPlan, Section } from "../types";

// Build the full deployable Solidity source from the user's per-section code.
//
// - Escrow (buildPlan === null): each section's scaffold already includes the
//   SPDX/pragma/contract wrapper, so we just concatenate.
// - Generated builds: sections contain only the contract body, so we wrap them
//   in the contract declaration (matching how the plan was compile-verified).
export function assembleContract(sections: Section[], plan: BuildPlan | null): string {
  const body = sections.map((s) => s.code).filter(Boolean).join("\n\n");
  if (!plan) return body;
  return `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.19;\n\ncontract ${plan.contractName || "MyContract"} {\n${body}\n}`;
}
