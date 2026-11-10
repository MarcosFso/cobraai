import { mockApi, mockAuth } from './mock';
import { realApi, realAuth } from './realApi';
import { isMock } from './supabase';
import type { Api, Auth } from './types';

// The mock (in-memory sample data) is only used for design previews and tests: VITE_MOCK=true.
export const api: Api = isMock ? mockApi : realApi;
export const auth: Auth = isMock ? mockAuth : realAuth;
