import { pathToFileURL } from 'node:url';

/** @param {{origin: string, token: string, serviceToken?: string, fetchImpl?: (url: string, init: RequestInit) => Promise<Response>}} options */
export async function runRetention({ origin, token, serviceToken, fetchImpl = fetch }) {
  if (!['https://renewalmatch.com', 'https://renewal-match-mission-preview.chris-barnes.chatgpt.site'].includes(origin) || !token || token.length < 32) throw new Error('Invalid maintenance configuration');
  const headers = { authorization: `Bearer ${token}`, ...(serviceToken ? { 'OAI-Sites-Authorization': `Bearer ${serviceToken}` } : {}) };
  const call = async (method) => {
    try {
      const response = await fetchImpl(origin + '/api/internal/retention-automation', { method, headers, redirect: 'error', signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error('Maintenance request rejected');
      return await response.json();
    } catch { throw new Error('Maintenance request rejected or unavailable'); }
  };
  let run;
  try { run = await call('POST'); } catch { run = await call('POST'); }
  const status = await call('GET');
  if (run.status !== 'COMPLETED' || run.failures !== 0 || !run.runId || status.healthy !== true || status.latest?.id !== run.runId || status.latest?.status !== 'COMPLETED' || status.latest?.failures !== 0) throw new Error('Persisted retention receipt not accepted');
  return { origin, run, status, observedAt: new Date().toISOString() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await runRetention({ origin: process.env.RETENTION_ORIGIN, token: process.env.RETENTION_TOKEN, serviceToken: process.env.SITE_SERVICE_TOKEN })));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
