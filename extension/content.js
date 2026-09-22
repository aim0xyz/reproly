function installContentRecorder(channel) {
  globalThis.__bugdropStop?.();
  let active = true, count = 0;
  const send = event => {
    if (!active || count++ >= 310) return;
    const clean = BugDropCore.normalizeEvent(event, count, Date.now());
    if (clean) chrome.runtime.sendMessage({ type: 'EVENT', channel, event: clean }).catch(() => stop());
  };
  const bridge = e => {
    if (typeof e.detail !== 'string' || e.detail.length > 18000) return;
    try { send(JSON.parse(e.detail)); } catch {}
  };
  const roleOf = el => el.getAttribute('role') || ({BUTTON:'button',A:'link',INPUT:'input',SELECT:'select',TEXTAREA:'textbox'}[el.tagName] || '');
  const selectorOf = el => {
    for (const attribute of ['data-testid', 'data-test', 'data-cy']) {
      const value = el.getAttribute(attribute);
      if (value && /^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(value)) return `[${attribute}="${value}"]`;
    }
    const parts = [];
    for (let node = el; node instanceof Element && node !== document.documentElement && parts.length < 5; node = node.parentElement) {
      let part = node.tagName.toLowerCase();
      if (node.parentElement) {
        const peers = [...node.parentElement.children].filter(peer => peer.tagName === node.tagName);
        if (peers.length > 1) part += `:nth-of-type(${peers.indexOf(node) + 1})`;
      }
      parts.unshift(part);
    }
    return parts.join(' > ');
  };
  const targetName = el => {
    // Never read input values, field names/IDs, editable contents, or form text.
    if (el.matches('input,textarea,select') || el.closest('[contenteditable]:not([contenteditable="false"])')) return 'form field (value omitted)';
    const text = (el.getAttribute('aria-label') || el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 100);
    return el.tagName.toLowerCase() + (text ? ' “' + text + '”' : '');
  };
  const click = e => {
    if (!e.isTrusted || !(e.target instanceof Element)) return;
    const el = e.target.closest('button,a,input,select,textarea,[role="button"],[contenteditable]');
    if (el) send({ kind: 'click', message: 'Clicked ' + targetName(el), selector: selectorOf(el), role: roleOf(el) });
  };
  const change = e => {
    if (!e.isTrusted || !(e.target instanceof Element)) return;
    if (e.target.matches('input,textarea,select')) send({ kind: 'input', message: 'Changed a form field (value omitted)' });
  };
  let maskMode = false, maskBanner = null, hovered = null;
  const masks = new Map();
  const placeMask = (el, mask) => {
    const box = el.getBoundingClientRect();
    Object.assign(mask.style, { left: box.left + 'px', top: box.top + 'px', width: box.width + 'px', height: box.height + 'px' });
  };
  const updateMasks = () => { for (const [el, mask] of masks) el.isConnected ? placeMask(el, mask) : (mask.remove(), masks.delete(el)); };
  const toggleMask = el => {
    if (masks.has(el)) { masks.get(el).remove(); masks.delete(el); return; }
    const mask = document.createElement('div');
    mask.setAttribute('data-bugdrop-mask', '');
    Object.assign(mask.style, { position:'fixed', zIndex:'2147483646', pointerEvents:'none', background:'repeating-linear-gradient(135deg,#242521 0,#242521 8px,#45463f 8px,#45463f 16px)', border:'2px solid #e95034', borderRadius:'4px' });
    document.documentElement.append(mask); masks.set(el, mask); placeMask(el, mask);
  };
  const endMaskMode = () => {
    maskMode = false; hovered?.removeAttribute('data-bugdrop-mask-hover'); hovered = null; maskBanner?.remove(); maskBanner = null;
    document.removeEventListener('mouseover', onMaskHover, true); document.removeEventListener('click', onMaskClick, true); document.removeEventListener('keydown', onMaskKey, true);
  };
  const onMaskHover = e => {
    if (!(e.target instanceof Element) || e.target.closest('[data-bugdrop-ui],[data-bugdrop-mask]')) return;
    hovered?.removeAttribute('data-bugdrop-mask-hover'); hovered = e.target; hovered.setAttribute('data-bugdrop-mask-hover','');
  };
  const onMaskClick = e => {
    if (!(e.target instanceof Element) || e.target.closest('[data-bugdrop-ui]')) return;
    e.preventDefault(); e.stopImmediatePropagation(); toggleMask(e.target);
  };
  const onMaskKey = e => { if (e.key === 'Escape') endMaskMode(); };
  const startMaskMode = () => {
    if (maskMode) return; maskMode = true;
    if (!document.getElementById('bugdrop-mask-style')) {
      const style = document.createElement('style'); style.id='bugdrop-mask-style'; style.dataset.bugdropUi=''; style.textContent='[data-bugdrop-mask-hover]{outline:3px solid #e95034!important;outline-offset:2px!important}'; document.documentElement.append(style);
    }
    maskBanner = document.createElement('div'); maskBanner.dataset.bugdropUi=''; maskBanner.textContent='Patchmason privacy mask: click areas to mask or unmask · Esc when done';
    Object.assign(maskBanner.style,{position:'fixed',top:'14px',left:'50%',transform:'translateX(-50%)',zIndex:'2147483647',padding:'11px 16px',borderRadius:'9px',background:'#242521',color:'#fff',font:'600 13px system-ui',boxShadow:'0 4px 20px #0005'});
    document.documentElement.append(maskBanner);
    document.addEventListener('mouseover',onMaskHover,true); document.addEventListener('click',onMaskClick,true); document.addEventListener('keydown',onMaskKey,true);
  };
  window.addEventListener('scroll', updateMasks, true); window.addEventListener('resize', updateMasks);
  const onMessage = (message, sender, respond) => {
    if (message.type === 'STOP_CAPTURE') { stop(); respond({ ok: true }); }
    if (message.type === 'START_MASK_MODE') { startMaskMode(); respond({ ok: true, count: masks.size }); }
    if (message.type === 'GET_MASK_COUNT') respond({ ok: true, count: masks.size });
  };
  function stop() {
    if (!active) return;
    active = false;
    window.dispatchEvent(new CustomEvent(channel + ':stop'));
    endMaskMode(); for (const mask of masks.values()) mask.remove(); masks.clear();
    window.removeEventListener('scroll', updateMasks, true); window.removeEventListener('resize', updateMasks);
    window.removeEventListener(channel, bridge);
    document.removeEventListener('click', click, true);
    document.removeEventListener('change', change, true);
    chrome.runtime.onMessage.removeListener(onMessage);
    delete globalThis.__bugdropStop;
  }
  window.addEventListener(channel, bridge);
  document.addEventListener('click', click, true);
  document.addEventListener('change', change, true);
  chrome.runtime.onMessage.addListener(onMessage);
  globalThis.__bugdropStop = stop;
  return { width: innerWidth, height: innerHeight, language: navigator.language, userAgent: navigator.userAgent };
}
