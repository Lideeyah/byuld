export type Persona = "founder" | "developer" | null;
// Self-described experience level (P1). Drives tone/depth of explanations (P4)
// and admin analytics. Maps onto a Persona for the existing two-tone AI prompts.
export type ExperienceLevel = "founder" | "student" | "developer" | "expert" | null;
export type Chain = "base" | "ethereum" | "polygon" | "sepolia" | "base-sepolia";
export type BuildMode = "C" | "B" | "A";

export interface Message {
  role: "byuld" | "user";
  content: string;
  timestamp: number;
}

export interface Section {
  id: string;
  title: string;
  status: "locked" | "active" | "complete";
  code: string;
}

// A rich section definition the build UI renders. The hardcoded escrow sections
// and AI-generated build plans both conform to this shape.
export interface BuildSectionDef {
  id: string;
  title: string;
  description: string;
  founderExplanation: string;
  developerExplanation: string;
  scaffold: string;
  hint: string;
  securityNote: {
    severity: "critical" | "warning";
    title: string;
    explanation: string;
    historicalExample?: string;
    fix: string;
  } | null;
  guide: { why: string; steps: { do: string; code: string }[] };
  // Reviewer reference for AI-generated builds (escrow keeps this server-side).
  requirements?: string;
  solution?: string;
}

// A tailored build produced by /api/generate-build-plan for any web3 goal.
export interface BuildPlan {
  contractName: string;
  projectName?: string;   // friendly human title (e.g. "Tip Jar for Creators")
  contractType: string;
  description: string;
  sections: BuildSectionDef[];
  comprehension: {
    summaryPoints: string[];
    decisions: { decision: string; question: string }[];
  };
  // Pre-build context (P2) + Web3 mental-model primer (P3).
  estimatedMinutes?: number;
  keyConcepts?: { concept: string; why: string }[];
  mentalModel?: { q: string; a: string }[];
  fullContract?: string;
  compiles?: boolean;
}

export interface SecurityIssue {
  id: string;
  level: "critical" | "warning" | "info";
  name: string;
  explanation: string;
  historicalExample?: string;
  fix: string;
  acknowledged: boolean;
}

export interface AppState {
  // auth
  email: string;
  walletAddress: string;
  isAuthenticated: boolean;
  // onboarding
  persona: Persona;
  experienceLevel: ExperienceLevel;
  programmingLanguages: string[];
  goal: string;
  projectName: string;
  contractType: string;
  chain: Chain;
  // build
  mode: BuildMode;
  buildPlan: BuildPlan | null;   // null = default escrow contract (and the demo)
  sections: Section[];
  messages: Message[];
  tokensUsed: number;
  tokensLimit: number;
  currentSection: number;
  securityIssues: SecurityIssue[];
  // payment
  byuldFeePaid: boolean;
  gasFunded: boolean;
  // deploy
  contractAddress: string;
  txHash: string;
  deployedAt: number;
}

export type AppAction =
  | { type: "SET_EMAIL"; email: string }
  | { type: "SET_AUTHENTICATED"; walletAddress: string }
  | { type: "SET_PERSONA"; persona: Persona }
  | { type: "SET_EXPERIENCE"; level: ExperienceLevel }
  | { type: "SET_LANGUAGES"; languages: string[] }
  | { type: "SET_GOAL"; goal: string; contractType: string; projectName?: string }
  | { type: "SET_SECTIONS"; sections: Section[] }
  | { type: "SET_CHAIN"; chain: Chain }
  | { type: "ADD_MESSAGE"; message: Message }
  | { type: "CLEAR_MESSAGES" }
  | { type: "SET_MODE"; mode: BuildMode }
  | { type: "UPDATE_SECTION_CODE"; id: string; code: string }
  | { type: "COMPLETE_SECTION"; id: string }
  | { type: "ADD_TOKENS"; count: number }
  | { type: "RESET_TOKENS" }
  | { type: "SET_SECURITY_ISSUES"; issues: SecurityIssue[] }
  | { type: "ACKNOWLEDGE_ISSUE"; id: string }
  | { type: "SET_BYULD_FEE_PAID" }
  | { type: "SET_GAS_FUNDED" }
  | { type: "SET_DEPLOYED"; contractAddress: string; txHash: string }
  | { type: "SET_BUILD_PLAN"; plan: BuildPlan }
  | { type: "RESET_SESSION"; persona: Persona | null; languages?: string[] };
