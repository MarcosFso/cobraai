import { config, describe, getToken, powerState, siteIsUp } from './_azure.js';

/** GET /api/status: is the machine on, and is the site answering? Read-only, so a crawler hitting it costs nothing. */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const cfg = config();
    const state = await powerState(cfg, await getToken(cfg));
    const ready = state === 'running' && (await siteIsUp(cfg));
    res.status(200).json({ state, ready, url: cfg.target });
  } catch (error) {
    const { code, body } = describe(error);
    res.status(code).json(body);
  }
}
