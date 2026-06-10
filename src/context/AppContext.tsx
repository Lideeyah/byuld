import { createContext, useContext, useReducer, useEffect, ReactNode } from "react";
import type { AppState, AppAction, Persona, Chain, BuildMode, Message, Section, SecurityIssue } from "../types";
import { getSections } from "../lib/contracts";

const STORAGE_KEY = "byuld_session";

function loadFromStorage(): Partial<AppState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch { return {}; }
}

function saveToStorage(state: AppState) {
  try {
    const { email, walletAddress, isAuthenticated, persona, programmingLanguages, goal, projectName, contractType, chain,
            tokensUsed, tokensLimit, contractAddress, txHash, deployedAt,
            sections, currentSection, messages } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      email, walletAddress, isAuthenticated, persona, programmingLanguages, goal, projectName, contractType, chain,
      tokensUsed, tokensLimit, contractAddress, txHash, deployedAt,
      sections, currentSection, messages,
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
  programmingLanguages: persisted.programmingLanguages ?? [],
  goal: persisted.goal ?? "",
  projectName: persisted.projectName ?? "",
  contractType: persisted.contractType ?? "escrow",
  chain: (persisted.chain as Chain) ?? "base-sepolia",
  mode: "C",
  sections: persisted.sections && persisted.sections.length ? persisted.sections : INITIAL_SECTIONS,
  messages: persisted.messages ?? [],
  // Always enforce the current limit — upgrades old sessions automatically
  tokensLimit: Math.max(persisted.tokensLimit ?? 500, 500),
  tokensUsed: Math.min(persisted.tokensUsed ?? 0, 500),
  currentSection: persisted.currentSection ?? 0,
  securityIssues: [],
  byuldFeePaid: false,
  gasFunded: false,
  contractAddress: persisted.contractAddress ?? "",
  txHash: persisted.txHash ?? "",
  deployedAt: persisted.deployedAt ?? 0,
};

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_EMAIL":
      return { ...state, email: action.email };
    case "SET_AUTHENTICATED":
      return { ...state, isAuthenticated: true, walletAddress: action.walletAddress };
    case "SET_PERSONA":
      return { ...state, persona: action.persona };
    case "SET_LANGUAGES":
      return { ...state, programmingLanguages: action.languages };
    case "SET_GOAL":
      return { ...state, goal: action.goal, contractType: action.contractType, projectName: action.projectName ?? state.projectName };
    case "SET_SECTIONS":
      return { ...state, sections: action.sections, currentSection: 0 };
    case "SET_CHAIN":
      return { ...state, chain: action.chain };
    case "ADD_MESSAGE":
      return { ...state, messages: [...state.messages, action.message] };
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

  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
