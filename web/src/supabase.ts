import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isMock = import.meta.env.VITE_MOCK === 'true';
export const backend = import.meta.env.VITE_BACKEND === 'rest' ? 'rest' : 'supabase';
export const isConfigured = isMock || backend === 'rest' || Boolean(url && anonKey);

// The anon key is public by design: what a user can read or change is decided by row level security in the database.
export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'not-configured');

/** What the visitor sandbox is, in words: shared and reset every night (Supabase) or private and deleted after a day. */
export const DEMO_NOTE =
  backend === 'rest'
    ? 'Uma empresa de exemplo só sua, com dados fictícios, apagada depois de 24 horas.'
    : 'Dados fictícios, restaurados toda madrugada.';

// Public test account (created by supabase/setup.sql). Its data is fictional and reset every night.
export const DEMO_EMAIL = 'demo@example.com';
export const DEMO_PASSWORD = 'Demo-2026!';
