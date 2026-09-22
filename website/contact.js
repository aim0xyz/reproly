(() => {
  const form = document.querySelector('#enterprise-form');
  if (!form) return;

  document.querySelectorAll('a[href="#pilot"]').forEach((link) => {
    link.setAttribute('href', '#enterprise-contact');
  });

  const status = document.querySelector('#enterprise-form-status');
  const button = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const apiUrl = window.PATCHMASON_CONTACT_CONFIG?.apiUrl;
    if (!apiUrl) {
      status.textContent = 'The contact form is temporarily unavailable. Please try again shortly.';
      return;
    }

    button.disabled = true;
    status.textContent = 'Sending…';
    try {
      const response = await fetch(`${apiUrl}contact`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form).entries()))
      });
      if (!response.ok) throw new Error('Contact request failed');
      form.reset();
      status.textContent = 'Thanks — we received your request and will be in touch.';
    } catch {
      status.textContent = 'We could not send your request. Please try again shortly.';
    } finally {
      button.disabled = false;
    }
  });
})();
