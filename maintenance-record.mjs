// Operational status only. No credentials or case data are persisted.
const { GH_TOKEN, GITHUB_REPOSITORY, GITHUB_RUN_ID, MAINTENANCE_STATUS } = process.env;
if (!GH_TOKEN || !/^realchrisbarnes\/renewal-match-operations$/.test(GITHUB_REPOSITORY || '')) throw new Error('Invalid operational repository');
const api = async (path, method = 'GET', body, allowMissing = false) => {
  const response = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/${path}`, { method, headers: { authorization: `Bearer ${GH_TOKEN}`, accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, body: body ? JSON.stringify(body) : undefined, redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (allowMissing && response.status === 404) return null;
  if (!response.ok) throw new Error('Operational record request failed');
  return response.status === 204 ? null : response.json();
};
const title = 'Renewal Match retention needs attention';
const issues = await api('issues?state=open&labels=retention-alert&per_page=10');
const existing = issues.find(issue => issue.title === title && !issue.pull_request);
const runUrl = `https://github.com/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`;
if (MAINTENANCE_STATUS !== 'success') {
  if (!existing) await api('issues', 'POST', { title, body: `Independent maintenance failed. Inspect [this operational run](${runUrl}) and the product cleanup receipt. No customer details are included.`, labels: ['retention-alert'], assignees: ['realchrisbarnes'] });
} else if (existing) {
  await api(`issues/${existing.number}/comments`, 'POST', { body: `Maintenance recovered with an accepted persisted receipt: [run](${runUrl}).` });
  await api(`issues/${existing.number}`, 'PATCH', { state: 'closed' });
}
// Scheduled workflows in public repositories require source activity within
// 60 days. One monthly operational commit preserves unattended execution.
const previous = await api('contents/last-maintenance.json', 'GET', undefined, true);
let lastAt = 0;
if (previous) {
  try { lastAt = Date.parse(JSON.parse(Buffer.from(previous.content, 'base64').toString('utf8')).observedAt); } catch { /* replace malformed operational metadata */ }
}
if (!lastAt || Date.now() - lastAt >= 30 * 24 * 60 * 60 * 1000) {
  const content = Buffer.from(JSON.stringify({ observedAt: new Date().toISOString(), status: MAINTENANCE_STATUS, runUrl }, null, 2) + '\n').toString('base64');
  await api('contents/last-maintenance.json', 'PUT', { message: 'Record monthly independent maintenance activity', content, ...(previous ? { sha: previous.sha } : {}) });
}
console.log(JSON.stringify({ operationalStatus: MAINTENANCE_STATUS, alert: MAINTENANCE_STATUS === 'success' ? 'clear' : 'open', runUrl }));
