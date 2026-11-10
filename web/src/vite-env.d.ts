/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** "true" runs the screens on in-memory sample data (design previews and tests). Never set in production. */
  readonly VITE_MOCK?: string;
}
