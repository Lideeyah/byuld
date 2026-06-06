import { StrictMode, Component } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { PrivyProvider } from "@privy-io/react-auth";
import { MoonPayProvider } from "@moonpay/moonpay-react";
import { AppProvider } from "./context/AppContext";
import App from "./App";
import "./index.css";

// Catches any crash and shows the error on screen instead of blank page
class ErrorBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: "" };
  static getDerivedStateFromError(e: Error) { return { error: e.message }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", background: "#080E1D", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px" }}>
          <div style={{ maxWidth: "560px", color: "#fff", fontFamily: "monospace" }}>
            <div style={{ color: "#f87171", marginBottom: "12px", fontSize: "14px" }}>⚠ Startup error</div>
            <pre style={{ fontSize: "12px", color: "#94a3b8", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{this.state.error}</pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <PrivyProvider
        appId={import.meta.env.VITE_PRIVY_APP_ID ?? ""}
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
          <MoonPayProvider apiKey={import.meta.env.VITE_MOONPAY_PK ?? ""}>
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <AppProvider>
                <App />
              </AppProvider>
            </BrowserRouter>
          </MoonPayProvider>
        </ErrorBoundary>
      </PrivyProvider>
    </ErrorBoundary>
  </StrictMode>
);
