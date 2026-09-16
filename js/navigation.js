// Native disclosure first: all routes remain available without JavaScript.
const header = document.querySelector('header[data-shell-revision="4"]');
if (header && !header.dataset.navigationReady) {
  header.dataset.navigationReady = 'true';
  const menu = header.querySelector('.cc-shell__index');
  const toggle = menu.querySelector('summary');
  const close = (restoreFocus = false) => {
    menu.open = false;
    if (restoreFocus) toggle.focus({ preventScroll: true });
  };
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.open) {
      event.preventDefault();
      close(true);
    }
  });
  document.addEventListener('click', event => {
    if (menu.open && !menu.contains(event.target)) close(menu.contains(document.activeElement));
  });
  menu.addEventListener('focusout', event => {
    // During focusout document.activeElement may temporarily be body. The
    // destination is authoritative; a microtask can run before focusin.
    if (event.relatedTarget) {
      if (menu.open && !menu.contains(event.relatedTarget)) close();
    } else {
      // WebKit mouse clicks can blur the summary to body without focusing the
      // anchor. Closing then removes the link before mouseup/click can activate
      // it. Only close for an actual focus destination; outside clicks and
      // Escape already have their own handlers.
      setTimeout(() => {
        const active = document.activeElement;
        if (menu.open && active && active !== document.body && !menu.contains(active)) close();
      }, 0);
    }
  });
  menu.addEventListener('click', event => {
    if (event.target.closest('a[href]')) close();
  });

  const normalize = path => path.replace(/\/index\.html$/, '/').replace(/\.html$/, '').replace(/\/$/, '') || '/';
  const current = normalize(location.pathname);
  document.querySelectorAll('[data-shell-revision="4"] a[href]').forEach(link => {
    const url = new URL(link.href, location.href);
    link.removeAttribute('aria-current');
    if (url.origin === location.origin && normalize(url.pathname) === current && !url.hash) {
      link.setAttribute('aria-current', 'page');
      link.dataset.current = 'true';
    }
  });

  // Keep preserved footer headings reachable after consolidating its story.
  const revealFooterHash = () => {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    if (!id) return;
    const target = document.getElementById(id);
    const disclosure = target?.closest('.cc-footer__context');
    if (!disclosure) return;
    disclosure.open = true;
    requestAnimationFrame(() => target.scrollIntoView({ block: 'start', behavior: 'instant' }));
  };
  addEventListener('hashchange', revealFooterHash);
  addEventListener('pageshow', revealFooterHash);
  revealFooterHash();

  // Preserve table semantics, cells and source content. Wide tables scroll inside
  // a labeled keyboard-accessible region instead of widening the whole page.
  document.querySelectorAll('main table').forEach((table, index) => {
    const region = document.createElement('div');
    region.className = 'cc-table-scroll';
    table.before(region);
    region.append(table);
    const label = table.caption?.textContent.trim() || table.getAttribute('aria-label') || `Data table ${index + 1}`;
    const update = () => {
      if (region.scrollWidth > region.clientWidth + 1) {
        region.tabIndex = 0;
        region.setAttribute('role', 'region');
        region.setAttribute('aria-label', label);
      } else {
        region.removeAttribute('tabindex');
        region.removeAttribute('role');
        region.removeAttribute('aria-label');
      }
    };
    const observer = new ResizeObserver(update);
    observer.observe(region);
    observer.observe(table);
    update();
  });
}
