import { Component } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { PrivyProvider } from "@privy-io/react-auth";
import { MoonPayProvider } from "@moonpay/moonpay-react";
import { AppProvider } from "./context/AppContext";
import App from "./App";
import "./index.css";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: "" };
  static getDerivedStateFromError(e: Error) { return { error: e.message }; }
  componentDidCatch(e: Error) {
    // eslint-disable-next-line no-console
    console.error("App crash:", e);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", background: "#080E1D", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px" }}>
          <div style={{ maxWidth: "560px", color: "#fff", fontFamily: "monospace" }}>
            <div style={{ color: "#f87171", marginBottom: "12px", fontSize: "14px" }}>⚠ {this.state.error}</div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const privyAppId = (import.meta.env.VITE_PRIVY_APP_ID ?? "").trim();

// The self-running demo runs as ONE continuous in-app session that begins at /demo
// (every step after that is in-app navigation, never a page reload). So if the page
// is freshly loaded anywhere other than /demo while the demo flag is still set —
// e.g. a mid-demo reload, or just opening the app normally — that's NOT the demo, and
// we must clear the flag so the normal app is never hijacked by the demo autopilots.
try {
  if (window.location.pathname !== "/demo" && sessionStorage.getItem("byuld_demo")) {
    sessionStorage.removeItem("byuld_demo");
  }
} catch { /* ignore */ }

// Note: React.StrictMode is intentionally not used. Its dev-only double-invoke of
// effects strands the self-running /demo autopilots (long-lived async scripts that
// must run exactly once and not be cancelled by a synthetic unmount). StrictMode has
// no effect on the production bundle, so this changes nothing in deployment.
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
      <PrivyProvider
        appId={privyAppId}
        config={{
          loginMethods: ["email", "wallet"],
          embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
          appearance: {
            theme: "dark",
            accentColor: "#7B5CF0",
          },
        }}
      >
        <ErrorBoundary>
          <MoonPayProvider apiKey={(import.meta.env.VITE_MOONPAY_PK ?? "").trim()}>
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <AppProvider>
                <App />
              </AppProvider>
            </BrowserRouter>
          </MoonPayProvider>
        </ErrorBoundary>
      </PrivyProvider>
    </ErrorBoundary>
);
