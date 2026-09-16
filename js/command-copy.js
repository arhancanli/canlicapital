export function enhanceCommandCopy(root = document) {
  for (const pre of root.querySelectorAll('.api-preview pre')) {
    if (pre.dataset.copyReady) continue;
    pre.dataset.copyReady = 'true';
    pre.tabIndex = 0;
    pre.setAttribute('role', 'region');
    pre.setAttribute('aria-label', 'API command; scroll horizontally to read');
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'api-command-copy';
    button.textContent = 'Copy command';
    const status = document.createElement('span');
    status.className = 'api-command-status'; status.setAttribute('role', 'status');
    pre.after(button, status);
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(pre.textContent);
        status.textContent = 'Command copied.';
      } catch {
        status.textContent = 'Copy unavailable. Select and copy the command directly.';
        pre.focus();
      }
    });
  }
}
