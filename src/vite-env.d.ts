/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PRIVY_APP_ID: string;
  readonly VITE_STRIPE_PUBLISHABLE_KEY: string;
  readonly VITE_MOONPAY_PK: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
