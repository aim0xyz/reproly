const $ = id => document.getElementById(id);
let report, dirty = false, toastTimer;
async function command(type, data = {}) {
  const result = await chrome.runtime.sendMessage({ type, ...data });
  if (!result?.ok) throw new Error(result?.error || 'Extension unavailable.');
  return result.data;
}
function toast(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 3500); }
function invalidate() { $('reviewed').checked = false; gates(); }
function gates() { for (const id of ['copy', 'markdown', 'json']) $(id).disabled = !$('reviewed').checked || dirty || !report || report.recording; for (const button of document.querySelectorAll('.download-shot')) button.disabled = !$('reviewed').checked || dirty; }
function render() {
  $('empty').hidden = !!report; $('report').hidden = !report;
  if (!report) return;
  if (report.recording) { $('report').hidden = true; $('empty').hidden = false; $('empty').textContent = 'Recording is still running. Stop it from the extension popup, then reload this page.'; return; }
  $('title').value = report.title || ''; $('expected').value = report.expected || ''; $('actual').value = report.actual || '';
  $('meta').textContent = new Date(report.startedAt).toLocaleString() + '\n' + report.events.length + ' events · ' + Math.round((report.endedAt - report.startedAt) / 1000) + 's';
  $('steps').textContent = report.events.filter(e => ['click', 'input'].includes(e.kind)).length;
  $('errors').textContent = report.events.filter(e => e.kind === 'error' || e.kind === 'console' && /^(ERROR|WARN):/.test(e.message)).length;
  $('requests').textContent = report.events.filter(e => e.kind === 'network').length;
  $('timeline').replaceChildren();
  for (const event of report.events) {
    const li = document.createElement('li'); li.className = 'event';
    const time = document.createElement('span'); time.className = 'time'; time.textContent = BugDropCore.formatOffset(event.ms);
    const content = document.createElement('div');
    const kind = document.createElement('div'); kind.className = 'kind ' + event.kind; kind.textContent = event.kind;
    const message = document.createElement('p'); message.className = 'event-message'; message.textContent = event.message;
    content.append(kind, message);
    if (event.stack) { const stack = document.createElement('pre'); stack.className = 'event-stack mono'; stack.textContent = event.stack; content.append(stack); }
    if (event.url) { const url = document.createElement('p'); url.className = 'event-url mono'; url.textContent = (event.method ? event.method + ' ' + (event.status || 'FAILED') + ' · ' : '') + event.url; content.append(url); }
    if (event.selector || event.role) { const target = document.createElement('p'); target.className = 'event-url mono'; target.textContent = [event.role && 'role: ' + event.role, event.selector && 'selector: ' + event.selector].filter(Boolean).join(' · '); content.append(target); }
    const remove = document.createElement('button'); remove.className = 'remove'; remove.textContent = '×'; remove.setAttribute('aria-label', 'Remove event ' + event.id);
    remove.addEventListener('click', () => safe(async () => { await saveIfDirty(); report = await command('REMOVE_EVENT', { id: report.id, eventId: event.id }); invalidate(); render(); }));
    li.append(time, content, remove); $('timeline').append(li);
  }
  if (!report.events.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'No captured events remain. Add your observations above.'; $('timeline').append(li); }
  $('notes').textContent = (report.stopReason || '') + (report.droppedEvents ? ' ' + report.droppedEvents + ' event(s) omitted at the capture limit.' : '') + (report.autoScreenshotNote ? ' ' + report.autoScreenshotNote : '');
  const screenshots = report.screenshots || [];
  $('image-panel').hidden = !screenshots.length; $('image-count').textContent = screenshots.length + ' SAVED'; $('image-gallery').replaceChildren();
  for (const shot of screenshots) {
    const card = document.createElement('article'); card.className = 'image-card';
    const img = document.createElement('img'); img.className = 'screenshot'; img.src = shot.data; img.alt = 'Captured page — review for sensitive content';
    const footer = document.createElement('footer'); const details = document.createElement('div');
    const reason = document.createElement('strong'); reason.textContent = shot.reason || 'Screenshot'; const time = document.createElement('span'); time.className = 'mono'; time.textContent = '+' + ((shot.ms || 0) / 1000).toFixed(1) + 's'; details.append(reason, time);
    const actions = document.createElement('div'); const downloadButton = document.createElement('button'); downloadButton.className = 'download-shot'; downloadButton.textContent = 'Download';
    downloadButton.onclick = () => { if (!$('reviewed').checked || dirty) return; const a=document.createElement('a'); a.href=shot.data; a.download='patchmason-screenshot-'+(screenshots.indexOf(shot)+1)+'.jpg'; a.click(); };
    const removeButton = document.createElement('button'); removeButton.className='danger'; removeButton.textContent='Remove'; removeButton.onclick=()=>safe(async()=>{report=await command('REMOVE_SCREENSHOT',{id:report.id,screenshotId:shot.id});invalidate();render();});
    actions.append(downloadButton,removeButton); footer.append(details,actions); card.append(img,footer); $('image-gallery').append(card);
  }
  gates();
}
async function safe(fn) { $('error').hidden = true; try { await fn(); } catch (error) { $('error').textContent = error.message; $('error').hidden = false; } }
async function saveIfDirty() {
  if (!dirty) return;
  report = await command('EDIT', { id: report.id, title: $('title').value, expected: $('expected').value, actual: $('actual').value });
  dirty = false; $('saved').textContent = 'Saved locally'; invalidate(); render();
}
function download(text, name, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
for (const id of ['title', 'expected', 'actual']) $(id).addEventListener('input', () => { dirty = true; $('saved').textContent = 'Unsaved changes'; invalidate(); });
$('reviewed').addEventListener('change', gates);
$('save').addEventListener('click', () => safe(async () => { await saveIfDirty(); toast('Context saved on this device'); }));
$('copy').addEventListener('click', () => safe(async () => { if (!$('reviewed').checked || dirty) return; await navigator.clipboard.writeText(BugDropCore.markdown(report)); toast('Copied. Paste into your coding agent.'); }));
$('markdown').addEventListener('click', () => { if ($('reviewed').checked && !dirty) download(BugDropCore.markdown(report), 'patchmason-report.md', 'text/markdown'); });
$('json').addEventListener('click', () => { if ($('reviewed').checked && !dirty) download(JSON.stringify(BugDropCore.portable(report), null, 2), 'patchmason-report.json', 'application/json'); });
$('delete').addEventListener('click', () => safe(async () => { if (!confirm('Delete this capture and all of its screenshots from this browser?')) return; await command('DELETE', { id: report.id }); report = null; dirty = false; render(); }));
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
// Never allow an older review tab to export a report that another tab changed or deleted.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.report || !report) return;
  invalidate();
  if (!dirty) { report = changes.report.newValue || null; render(); }
});
safe(async () => { report = await command('GET'); render(); });
