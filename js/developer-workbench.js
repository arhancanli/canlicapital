// Progressive enhancement: every original example remains available without JS.
document.querySelectorAll('.dev-snippets').forEach((group, groupIndex) => {
  const panels = [...group.children].filter(node => node.matches('.dev-snippet'));
  if (panels.length < 2) return;
  const tabs = document.createElement('div');
  tabs.className = 'dev-language-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Code example language');
  const buttons = panels.map((panel, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = panel.querySelector('.dev-snippet-label').textContent;
    button.id = `dev-language-${groupIndex}-${index}`;
    panel.id = `dev-example-${groupIndex}-${index}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', panel.id);
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', button.id);
    tabs.append(button);
    return button;
  });
  function select(index, focus = false) {
    buttons.forEach((button, item) => {
      button.setAttribute('aria-selected', String(item === index));
      button.tabIndex = item === index ? 0 : -1;
      panels[item].hidden = item !== index;
    });
    if (focus) buttons[index].focus();
    // Existing site motion observes resize; no animation dependency in this module.
    window.dispatchEvent(new Event('resize'));
  }
  buttons.forEach((button, index) => {
    button.addEventListener('click', () => select(index));
    button.addEventListener('keydown', event => {
      const next = { ArrowRight: (index + 1) % panels.length,
        ArrowLeft: (index + panels.length - 1) % panels.length,
        Home: 0, End: panels.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      select(next, true);
    });
  });
  group.prepend(tabs);
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'dev-copy-example';
  copy.textContent = 'Copy example';
  const status = document.createElement('p');
  status.className = 'dev-copy-status';
  status.setAttribute('role', 'status');
  copy.addEventListener('click', async () => {
    const panel = panels.find(panel => !panel.hidden);
    const code = panel.querySelector('pre');
    try {
      await navigator.clipboard.writeText(code.textContent);
      status.textContent = 'Example copied.';
    } catch {
      status.textContent = 'Clipboard unavailable. Select the example and copy it manually.';
      code.tabIndex = 0;
      code.focus();
    }
  });
  tabs.addEventListener('click', () => { status.textContent = ''; });
  tabs.addEventListener('keydown', () => { status.textContent = ''; });
  group.append(copy, status);
  group.classList.add('is-workbench');
  select(0);
});
