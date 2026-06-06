import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useApp } from "./context/AppContext";

import Landing          from "./screens/Landing";
import SignUp           from "./screens/auth/SignUp";
import CheckEmail       from "./screens/auth/CheckEmail";
import PersonaSelection from "./screens/onboarding/PersonaSelection";
import WalletSetup      from "./screens/onboarding/WalletSetup";
import GoalCapture      from "./screens/onboarding/GoalCapture";
import GoalClarification from "./screens/onboarding/GoalClarification";
import BuildInterface   from "./screens/build/BuildInterface";
import TokenExhaustion  from "./screens/build/TokenExhaustion";
import FinalReview      from "./screens/review/FinalReview";
import ConsentPart1     from "./screens/consent/ConsentPart1";
import ConsentPart2     from "./screens/consent/ConsentPart2";
import PaymentFlow      from "./screens/payment/PaymentFlow";
import Success          from "./screens/Success";
import Dashboard        from "./screens/Dashboard";

// Keeps Privy auth state in sync with AppContext
function PrivyAuthSync() {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const { state, dispatch } = useApp();

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
  }, [ready, authenticated, wallets, user]);

  return null;
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { state } = useApp();
  const { ready, authenticated } = usePrivy();
  if (!ready) return null; // wait — prevents flash redirect on reload
  if (!state.isAuthenticated && !authenticated) return <Navigate to="/auth" replace />;
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
        <Route path="/onboarding/goal"    element={<AuthGuard><GoalCapture /></AuthGuard>} />
        <Route path="/onboarding/clarify" element={<AuthGuard><GoalClarification /></AuthGuard>} />

        <Route path="/build"              element={<AuthGuard><BuildInterface /></AuthGuard>} />
        <Route path="/build/tokens"       element={<AuthGuard><TokenExhaustion /></AuthGuard>} />

        <Route path="/review"             element={<AuthGuard><FinalReview /></AuthGuard>} />

        <Route path="/consent/part1"      element={<AuthGuard><ConsentPart1 /></AuthGuard>} />
        <Route path="/consent/part2"      element={<AuthGuard><ConsentPart2 /></AuthGuard>} />

        <Route path="/payment"            element={<AuthGuard><PaymentFlow /></AuthGuard>} />
        <Route path="/success"            element={<AuthGuard><Success /></AuthGuard>} />
        <Route path="/dashboard"          element={<AuthGuard><Dashboard /></AuthGuard>} />

        <Route path="*"                   element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
