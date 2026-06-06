import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { PrivyProvider } from "@privy-io/react-auth";
import { MoonPayProvider } from "@moonpay/moonpay-react";
import { AppProvider } from "./context/AppContext";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
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
      <MoonPayProvider apiKey={import.meta.env.VITE_MOONPAY_PK ?? ""}>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AppProvider>
            <App />
          </AppProvider>
        </BrowserRouter>
      </MoonPayProvider>
    </PrivyProvider>
  </StrictMode>
);
