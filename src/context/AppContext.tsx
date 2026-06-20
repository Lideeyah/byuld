import { createContext, useContext, useReducer, useEffect, ReactNode } from "react";
import { setAnalyticsUser, trackSessionStart } from "../lib/analytics";
import type { AppState, AppAction, Persona, Chain, BuildMode, Message, Section, SecurityIssue } from "../types";
import { getSections } from "../lib/contracts";

const STORAGE_KEY = "byuld_session";

// TESTING: token limit disabled. Flip to false to re-enable the 500/day cap.
export const UNLIMITED_TOKENS = true;
const UNLIMITED_VALUE = 1_000_000;

function loadFromStorage(): Partial<AppState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch { return {}; }
}

function saveToStorage(state: AppState) {
  try {
    const { email, walletAddress, isAuthenticated, persona, experienceLevel, programmingLanguages, goal, projectName, contractType, chain,
            tokensUsed, tokensLimit, contractAddress, txHash, deployedAt,
            sections, currentSection, messages, buildPlan, buildId } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      email, walletAddress, isAuthenticated, persona, experienceLevel, programmingLanguages, goal, projectName, contractType, chain,
      tokensUsed, tokensLimit, contractAddress, txHash, deployedAt,
      sections, currentSection, messages, buildPlan, buildId,
    }));
  } catch { /* ignore */ }
}

// V1: escrow sections. The active section's scaffold is loaded by BuildInterface.
const INITIAL_SECTIONS: Section[] = getSections().map((def, i) => ({
  id: def.id,
  title: def.title,
  status: i === 0 ? "active" : "locked",
  code: "",
}));

const persisted = loadFromStorage();

const INITIAL: AppState = {
  email: persisted.email ?? "",
  walletAddress: persisted.walletAddress ?? "",
  isAuthenticated: persisted.isAuthenticated ?? false,
  persona: persisted.persona ?? null,
  experienceLevel: persisted.experienceLevel ?? null,
  programmingLanguages: persisted.programmingLanguages ?? [],
  goal: persisted.goal ?? "",
  projectName: persisted.projectName ?? "",
  contractType: persisted.contractType ?? "escrow",
  chain: (persisted.chain as Chain) ?? "sepolia",
  mode: "C",
  buildPlan: persisted.buildPlan ?? null,
  sections: persisted.sections && persisted.sections.length ? persisted.sections : INITIAL_SECTIONS,
  messages: persisted.messages ?? [],
  // Token limit (disabled while UNLIMITED_TOKENS is on for testing)
  tokensLimit: UNLIMITED_TOKENS ? UNLIMITED_VALUE : Math.max(persisted.tokensLimit ?? 500, 500),
  tokensUsed: UNLIMITED_TOKENS ? 0 : Math.min(persisted.tokensUsed ?? 0, 500),
  currentSection: persisted.currentSection ?? 0,
  securityIssues: [],
  byuldFeePaid: false,
  gasFunded: false,
  contractAddress: persisted.contractAddress ?? "",
  txHash: persisted.txHash ?? "",
  deployedAt: persisted.deployedAt ?? 0,
  buildId: persisted.buildId ?? "",
};

// A stable id for a build, so it can be saved/resumed against the user's account.
function newBuildId(): string {
  return "b_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function freshSections(): Section[] {
  return getSections().map((def, i) => ({
    id: def.id, title: def.title, status: i === 0 ? "active" : "locked", code: "",
  }));
}

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "RESET_SESSION":
      // Wipe everything to a clean authed baseline. Used by the self-running demo
      // so it never inherits a stale prior session.
      return {
        ...state,
        email: action.persona === "developer" ? "dev@byuld.xyz" : "demo@byuld.xyz",
        walletAddress: "0x7e10f4781e11f5b64Af32Ca0758bE7115654493c",
        isAuthenticated: true,
        persona: action.persona,
        experienceLevel: action.persona,
        programmingLanguages: action.languages ?? [],
        goal: "", projectName: "", contractType: "escrow", chain: "sepolia",
        buildPlan: null,
        sections: freshSections(), currentSection: 0, messages: [],
        securityIssues: [], byuldFeePaid: false, gasFunded: false,
        contractAddress: "", txHash: "", deployedAt: 0,
        tokensUsed: 0, buildId: "",
      };
    case "SET_BUILD_PLAN": {
      // Adopt an AI-generated, tailored build. Rebuild the runtime section list
      // from the plan and start fresh at the first section.
      const sections: Section[] = action.plan.sections.map((s, i) => ({
        id: s.id, title: s.title, status: i === 0 ? "active" : "locked", code: "",
      }));
      return {
        ...state,
        buildPlan: action.plan,
        projectName: action.plan.projectName || action.plan.contractName,
        contractType: action.plan.contractType || state.contractType,
        sections, currentSection: 0, messages: [], securityIssues: [],
        contractAddress: "", txHash: "", deployedAt: 0,
      };
    }
    case "HYDRATE_BUILD": {
      // Restore a saved build (from the server) so the user can resume it on any
      // device. Falls back to fresh escrow sections if the saved build had none.
      const b = action.build;
      const sections = b.sections && b.sections.length ? b.sections : freshSections();
      return {
        ...state,
        buildId: b.buildId,
        goal: b.goal ?? state.goal,
        projectName: b.projectName ?? state.projectName,
        contractType: b.contractType ?? state.contractType,
        chain: b.chain ?? state.chain,
        buildPlan: b.buildPlan ?? null,
        sections,
        currentSection: b.currentSection ?? 0,
        messages: [],
        securityIssues: [],
        contractAddress: b.contractAddress ?? "",
        txHash: b.txHash ?? "",
        deployedAt: b.deployedAt ?? 0,
      };
    }
    case "SET_EMAIL":
      return { ...state, email: action.email };
    case "SET_AUTHENTICATED":
      return { ...state, isAuthenticated: true, walletAddress: action.walletAddress };
    case "SET_PERSONA":
      return { ...state, persona: action.persona };
    case "SET_EXPERIENCE":
      return { ...state, experienceLevel: action.level };
    case "SET_LANGUAGES":
      return { ...state, programmingLanguages: action.languages };
    case "SET_GOAL":
      // A new goal starts a brand-new build. Clear the previous AI plan, written
      // code, and deploy artifacts so the review screen regenerates from scratch —
      // otherwise a new build would silently replay the last build's plan.
      return {
        ...state,
        goal: action.goal,
        contractType: action.contractType,
        projectName: action.projectName ?? "",
        buildPlan: null,
        sections: freshSections(),
        currentSection: 0,
        messages: [],
        securityIssues: [],
        contractAddress: "", txHash: "", deployedAt: 0,
        buildId: newBuildId(),
      };
    case "SET_SECTIONS":
      return { ...state, sections: action.sections, currentSection: 0 };
    case "SET_CHAIN":
      return { ...state, chain: action.chain };
    case "ADD_MESSAGE":
      return { ...state, messages: [...state.messages, action.message] };
    case "CLEAR_MESSAGES":
      return { ...state, messages: [] };
    case "SET_MODE":
      return { ...state, mode: action.mode };
    case "UPDATE_SECTION_CODE": {
      const sections = state.sections.map(s =>
        s.id === action.id ? { ...s, code: action.code } : s
      );
      return { ...state, sections };
    }
    case "COMPLETE_SECTION": {
      const sections = state.sections.map((s, i) => {
        if (s.id === action.id) return { ...s, status: "complete" as const };
        const idx = state.sections.findIndex(x => x.id === action.id);
        if (i === idx + 1) return { ...s, status: "active" as const };
        return s;
      });
      const next = state.currentSection + 1;
      return { ...state, sections, currentSection: Math.min(next, sections.length - 1) };
    }
    case "ADD_TOKENS":
      return { ...state, tokensUsed: Math.min(state.tokensUsed + action.count, state.tokensLimit) };
    case "RESET_TOKENS":
      return { ...state, tokensUsed: 0 };
    case "SET_SECURITY_ISSUES":
      return { ...state, securityIssues: action.issues };
    case "ACKNOWLEDGE_ISSUE": {
      const securityIssues = state.securityIssues.map(i =>
        i.id === action.id ? { ...i, acknowledged: true } : i
      );
      return { ...state, securityIssues };
    }
    case "SET_BYULD_FEE_PAID":
      return { ...state, byuldFeePaid: true };
    case "SET_GAS_FUNDED":
      return { ...state, gasFunded: true };
    case "SET_DEPLOYED":
      return { ...state, contractAddress: action.contractAddress, txHash: action.txHash, deployedAt: Date.now() };
    default:
      return state;
  }
}

const Ctx = createContext<{ state: AppState; dispatch: React.Dispatch<AppAction> } | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL);

  useEffect(() => {
    saveToStorage(state);
  }, [state.isAuthenticated, state.persona, state.goal, state.contractType, state.chain,
      state.tokensUsed, state.email, state.walletAddress, state.contractAddress, state.txHash, state.deployedAt,
      state.sections, state.currentSection, state.messages]);

  // Keep learning-analytics events attributed to the right user, and mark the
  // start of each browser session once we have an identity.
  useEffect(() => {
    setAnalyticsUser(state.email || null);
    if (state.email) {
      try {
        if (!sessionStorage.getItem("byuld_sess_started")) {
          sessionStorage.setItem("byuld_sess_started", "1");
          trackSessionStart();
        }
      } catch { /* ignore */ }
    }
  }, [state.email]);

  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
