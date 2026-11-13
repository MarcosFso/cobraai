import { config, describe, getToken, powerState, startVm } from './_azure.js';

let lastStart = 0;
const COOLDOWN_MS = 60_000; // one start request per minute per server instance: repeated clicks do nothing extra

/**
 * POST /api/wake: starts the VM if it is off. Starting a running machine does nothing, and the VM stops itself again
 * after a few hours without use, so the worst a stranger can do is keep it on for a while.
 */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST.' });
  }
  try {
    const cfg = config();
    const token = await getToken(cfg);
    const state = await powerState(cfg, token);
    if (state === 'running' || state === 'starting') return res.status(200).json({ state });
    if (state === 'deallocating' || state === 'stopping') return res.status(200).json({ state, message: 'A máquina ainda está desligando. Tente de novo em um minuto.' });
    if (Date.now() - lastStart < COOLDOWN_MS) return res.status(200).json({ state: 'starting' });
    lastStart = Date.now();
    await startVm(cfg, token);
    return res.status(200).json({ state: 'starting' });
  } catch (error) {
    const { code, body } = describe(error);
    return res.status(code).json(body);
  }
}
