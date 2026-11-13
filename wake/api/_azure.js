// Talks to Azure on behalf of the wake page: reads the VM's power state and starts it.
// The credentials come from environment variables set in Vercel (never in the code):
//   AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET   an app registration allowed to start THIS VM only
//   AZURE_SUBSCRIPTION_ID, AZURE_RESOURCE_GROUP, AZURE_VM_NAME
//   TARGET_URL                                              the site to open once it is up
const ARM = 'https://management.azure.com';
const API = '2024-03-01';

/** An error that says which step failed (never any secret), so the page can tell the owner what to fix. */
function fail(step, message, status) {
  const error = new Error(message);
  error.step = step;
  error.azureStatus = status;
  return error;
}

export function config(env = process.env) {
  const keys = ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_SUBSCRIPTION_ID', 'AZURE_RESOURCE_GROUP', 'AZURE_VM_NAME', 'TARGET_URL'];
  const missing = keys.filter((key) => !env[key]);
  if (missing.length) {
    const error = new Error(`not configured: ${missing.join(', ')}`);
    error.code = 'NOT_CONFIGURED';
    throw error;
  }
  return {
    tenant: env.AZURE_TENANT_ID,
    clientId: env.AZURE_CLIENT_ID,
    secret: env.AZURE_CLIENT_SECRET,
    vm: `/subscriptions/${env.AZURE_SUBSCRIPTION_ID}/resourceGroups/${env.AZURE_RESOURCE_GROUP}/providers/Microsoft.Compute/virtualMachines/${env.AZURE_VM_NAME}`,
    target: env.TARGET_URL.replace(/\/$/, ''),
  };
}

export function describe(error) {
  if (error.code === 'NOT_CONFIGURED') return { code: 503, body: { error: 'A página ainda não foi configurada.' } };
  const hints = {
    login: 'O Azure recusou a credencial (confira o segredo, o ID do aplicativo e o ID do diretório).',
    read: 'A credencial entrou, mas não tem permissão de ler a máquina (falta o papel Colaborador da Máquina Virtual na máquina billing).',
    start: 'A credencial entrou, mas não tem permissão de ligar a máquina (falta o papel Colaborador da Máquina Virtual).',
  };
  console.error('azure step failed:', error.step ?? 'unknown', error.azureStatus ?? '', error.message);
  return { code: 502, body: { error: hints[error.step] ?? 'Não consegui falar com o Azure.', step: error.step ?? 'unknown', azureStatus: error.azureStatus ?? null } };
}

export async function getToken(cfg, fetchImpl = fetch) {
  const response = await fetchImpl(`https://login.microsoftonline.com/${cfg.tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: cfg.clientId,
      client_secret: cfg.secret,
      scope: `${ARM}/.default`,
    }),
  });
  if (!response.ok) throw fail('login', `azure login failed (${response.status})`, response.status);
  return (await response.json()).access_token;
}

/** 'running', 'starting', 'deallocated', 'deallocating', 'stopped', 'stopping' or 'unknown'. */
export async function powerState(cfg, token, fetchImpl = fetch) {
  const response = await fetchImpl(`${ARM}${cfg.vm}/instanceView?api-version=${API}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw fail('read', `azure instanceView failed (${response.status})`, response.status);
  const view = await response.json();
  const status = (view.statuses ?? []).find((s) => typeof s.code === 'string' && s.code.startsWith('PowerState/'));
  return status ? status.code.slice('PowerState/'.length) : 'unknown';
}

export async function startVm(cfg, token, fetchImpl = fetch) {
  const response = await fetchImpl(`${ARM}${cfg.vm}/start?api-version=${API}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Length': '0' },
  });
  if (response.status !== 200 && response.status !== 202) throw fail('start', `azure start failed (${response.status})`, response.status);
}

/** True when the site answers its health check (the machine is on AND the services came up). */
export async function siteIsUp(cfg, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(`${cfg.target}/api/billing/health`, { signal: AbortSignal.timeout(4000) });
    return response.ok;
  } catch {
    return false;
  }
}
