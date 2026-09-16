export function enhanceResearchLibrary(wrap, list) {
  if (wrap.querySelector('.archive-search')) {
    wrap.querySelector('input').dispatchEvent(new Event('input'));
    return;
  }
  const toolbar = document.createElement('div');
  toolbar.className = 'archive-search';
  const label = document.createElement('label');
  label.htmlFor = 'archive-query';
  label.textContent = 'Find a research document';
  const input = document.createElement('input');
  input.type = 'search';
  input.id = 'archive-query';
  input.placeholder = 'Search titles and descriptions';
  input.setAttribute('aria-controls', list.id);
  const status = document.createElement('p');
  status.className = 'archive-search__status';
  status.setAttribute('role', 'status');
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.textContent = 'Clear search';
  clear.hidden = true;
  toolbar.append(label, input, clear, status);
  list.before(toolbar);
  function filter() {
    const items = [...list.children];
    const index = items.map(item => item.textContent.toLocaleLowerCase());
    const words = input.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    let count = 0;
    items.forEach((item, i) => {
      item.hidden = !words.every(word => index[i].includes(word));
      if (!item.hidden) count++;
    });
    status.textContent = count ? `${count} of ${items.length} documents` : 'No matching documents. Try a different title or topic.';
    clear.hidden = !input.value;
    window.dispatchEvent(new Event('canli:content-layout'));
  }
  input.addEventListener('input', filter);
  clear.addEventListener('click', () => { input.value = ''; filter(); input.focus(); });
  filter();
}
