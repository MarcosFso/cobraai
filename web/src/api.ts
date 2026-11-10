import { mockApi, mockAuth } from './mock';
import { realApi, realAuth } from './realApi';
import { backend, isMock } from './supabase';
import { restApi, restAuth } from './restApi';
import type { Api, Auth } from './types';

// Supabase is the default back end. VITE_BACKEND=rest talks to the Java/Kafka microservices instead.
// The mock (in-memory sample data) is only used for design previews and tests: VITE_MOCK=true.
export const api: Api = isMock ? mockApi : backend === 'rest' ? restApi : realApi;
export const auth: Auth = isMock ? mockAuth : backend === 'rest' ? restAuth : realAuth;
