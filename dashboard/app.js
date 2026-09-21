(async () => {
  const config = window.REPROLY_CONFIG;
  const root = document.querySelector('#app');
  if (!config) { root.innerHTML = '<p class="loading">Dashboard configuration is missing.</p>'; return; }
  const loginUrl = `${config.cognitoDomain}/login?client_id=${encodeURIComponent(config.clientId)}&response_type=code&scope=openid+email+profile&redirect_uri=${encodeURIComponent(config.dashboardUrl)}`;
  const code = new URLSearchParams(location.search).get('code');
  if (code) { const tokenResponse = await fetch(`${config.cognitoDomain}/oauth2/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: config.clientId, code, redirect_uri: config.dashboardUrl }) }); if (tokenResponse.ok) { const tokens = await tokenResponse.json(); sessionStorage.setItem('bugdrop_id_token', tokens.id_token); history.replaceState({}, '', '/'); } }
  const token = sessionStorage.getItem('bugdrop_id_token');
  let reports = [];
  if (token) { const response = await fetch(`${config.apiUrl}reports`, { headers: { authorization: token } }); if (response.ok) reports = (await response.json()).reports || []; }
  const reportRows = reports.length ? reports.map((r) => `<article class="card"><span class="eyebrow">${r.status.toUpperCase()}</span><h2>${escapeHtml(r.summary)}</h2><p>${escapeHtml(r.reportId)}</p><pre class="key">${escapeHtml(r.agentMarkdown || '')}</pre></article>`).join('') : '<div class="empty">No reviewed reports yet.</div>';
  root.innerHTML = `<div class="shell"><header class="top"><div class="brand"><i></i>Reproly Cloud</div>${token ? '<button id="signout" class="button alt">Sign out</button>' : `<a class="button" href="${loginUrl}">Sign in</a>`}</header><section class="hero"><span class="eyebrow">PRODUCTION DEBUGGING, WITH CONSENT</span><h1>Reports with the context to fix them.</h1><p>Manage projects, generate a public SDK key, and triage reviewed reports. Reproly never grants unrestricted access to customer accounts.</p></section><section class="grid"><article class="card"><span class="eyebrow">01 — PROJECTS</span><h2>Connect an app</h2><p>Create a project, select approved context fields, and copy its SDK key.</p></article><article class="card"><span class="eyebrow">02 — INBOX</span><h2>Triage reports</h2><p>Search, assign and send a reviewed report to your issue tracker.</p></article><article class="card"><span class="eyebrow">03 — CONTROLS</span><h2>Keep data bounded</h2><p>Set redaction, retention and workspace access before accepting evidence.</p></article></section><section class="reports"><h2>Your report inbox</h2>${reportRows}</section></div>`;
  document.querySelector('#signout')?.addEventListener('click', () => { sessionStorage.removeItem('bugdrop_id_token'); location.assign('/'); });
})();

function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }
