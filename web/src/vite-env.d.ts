/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Which back end the site talks to: "supabase" (default, the web version) or "rest" (the Java/Kafka microservices). */
  readonly VITE_BACKEND?: string;
  readonly VITE_BILLING_URL?: string;
  readonly VITE_REPORT_URL?: string;
  readonly VITE_NOTIFICATION_URL?: string;
  /** "true" runs the screens on in-memory sample data (design previews and tests). Never set in production. */
  readonly VITE_MOCK?: string;
}
