import { useEffect } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useApp } from "./context/AppContext";
import { resolveAuthDestination } from "./lib/auth";
import type { Persona, ExperienceLevel } from "./types";

import Landing          from "./screens/Landing";
import SignUp           from "./screens/auth/SignUp";
import CheckEmail       from "./screens/auth/CheckEmail";
import PersonaSelection from "./screens/onboarding/PersonaSelection";
import WalletSetup      from "./screens/onboarding/WalletSetup";
import ChainSelection   from "./screens/onboarding/ChainSelection";
import GoalCapture      from "./screens/onboarding/GoalCapture";
import IntentReview     from "./screens/onboarding/IntentReview";
import Primer           from "./screens/onboarding/Primer";
import GoalClarification from "./screens/onboarding/GoalClarification";
import BuildInterface   from "./screens/build/BuildInterface";
import TokenExhaustion  from "./screens/build/TokenExhaustion";
import FinalReview      from "./screens/review/FinalReview";
import ConsentPart1     from "./screens/consent/ConsentPart1";
import ConsentPart2     from "./screens/consent/ConsentPart2";
import PaymentFlow      from "./screens/payment/PaymentFlow";
import Comprehension    from "./screens/Comprehension";
import Deploy           from "./screens/Deploy";
import Success          from "./screens/Success";
import FeedbackSurvey    from "./screens/FeedbackSurvey";
import Dashboard        from "./screens/Dashboard";
import Admin            from "./screens/Admin";
import DemoStart        from "./screens/DemoStart";
import FeedbackWidget    from "./components/FeedbackWidget";

// Keeps Privy auth state in sync with AppContext
function PrivyAuthSync() {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!ready || !authenticated) return;
    if (state.isAuthenticated) return; // already synced

    const addr = wallets[0]?.address ?? user?.wallet?.address ?? "";
    if (addr) dispatch({ type: "SET_AUTHENTICATED", walletAddress: addr });

    const emailAccount = user?.linkedAccounts?.find(
      (a): a is typeof a & { address: string } => a.type === "email" && "address" in a
    );
    if (emailAccount && !state.email) {
      dispatch({ type: "SET_EMAIL", email: emailAccount.address });
    }

    // Only redirect from auth screens — don't redirect if already in the app.
    // Ask the server whether this email has onboarded before so returning users
    // (whose localStorage is empty on a fresh device) skip onboarding.
    const onAuthScreen = ["/auth", "/check-email"].includes(location.pathname);
    if (onAuthScreen) {
      const email = emailAccount?.address || state.email || "";
      // A Privy account created more than a couple minutes ago is a returning user.
      const createdAt = user?.createdAt ? new Date(user.createdAt).getTime() : 0;
      const priorAccount = createdAt > 0 && Date.now() - createdAt > 120_000;
      resolveAuthDestination(email, state.persona, priorAccount).then((dest) => {
        if (dest.persona) {
          dispatch({ type: "SET_PERSONA", persona: dest.persona as Persona });
          if (dest.experienceLevel) dispatch({ type: "SET_EXPERIENCE", level: dest.experienceLevel as ExperienceLevel });
        }
        navigate(dest.path, { replace: true });
      });
    }
  }, [ready, authenticated, wallets, user]);

  return null;
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { state } = useApp();
  const { ready, authenticated } = usePrivy();
  // If our app session already knows the user is authenticated (persisted session
  // or the seeded demo), render immediately — don't gate on Privy's `ready`.
  // Gating on Privy here caused guarded screens to blank/remount whenever Privy's
  // ready state flickered, which restarted the self-running demo's autopilot.
  if (state.isAuthenticated) return <>{children}</>;
  if (!ready) return null; // wait — prevents flash redirect on reload
  if (!authenticated) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <>
      <PrivyAuthSync />
      <Routes>
        <Route path="/"                   element={<Landing />} />
        <Route path="/auth"               element={<SignUp />} />
        <Route path="/check-email"        element={<CheckEmail />} />

        <Route path="/onboarding/persona" element={<AuthGuard><PersonaSelection /></AuthGuard>} />
        <Route path="/onboarding/wallet"  element={<AuthGuard><WalletSetup /></AuthGuard>} />
        <Route path="/onboarding/chain"   element={<AuthGuard><ChainSelection /></AuthGuard>} />
        <Route path="/onboarding/goal"    element={<AuthGuard><GoalCapture /></AuthGuard>} />
        <Route path="/onboarding/review"  element={<AuthGuard><IntentReview /></AuthGuard>} />
        <Route path="/onboarding/primer"  element={<AuthGuard><Primer /></AuthGuard>} />
        <Route path="/onboarding/clarify" element={<AuthGuard><GoalClarification /></AuthGuard>} />

        <Route path="/build"              element={<AuthGuard><BuildInterface /></AuthGuard>} />
        <Route path="/build/tokens"       element={<AuthGuard><TokenExhaustion /></AuthGuard>} />

        <Route path="/review"             element={<AuthGuard><FinalReview /></AuthGuard>} />
        <Route path="/comprehension"      element={<AuthGuard><Comprehension /></AuthGuard>} />
        <Route path="/deploy"             element={<AuthGuard><Deploy /></AuthGuard>} />

        <Route path="/consent/part1"      element={<AuthGuard><ConsentPart1 /></AuthGuard>} />
        <Route path="/consent/part2"      element={<AuthGuard><ConsentPart2 /></AuthGuard>} />

        <Route path="/payment"            element={<AuthGuard><PaymentFlow /></AuthGuard>} />
        <Route path="/success"            element={<AuthGuard><Success /></AuthGuard>} />
        <Route path="/feedback"           element={<AuthGuard><FeedbackSurvey /></AuthGuard>} />
        <Route path="/dashboard"          element={<AuthGuard><Dashboard /></AuthGuard>} />

        <Route path="/admin"              element={<Admin />} />
        <Route path="/demo"               element={<DemoStart />} />
        <Route path="*"                   element={<Navigate to="/" replace />} />
      </Routes>
      <FeedbackWidget />
    </>
  );
}
