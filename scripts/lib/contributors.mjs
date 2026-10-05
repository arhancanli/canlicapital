import { readFileSync } from 'node:fs';
import { escapeHtml } from './html-text.mjs';

export const contributorProgram = JSON.parse(readFileSync(new URL('../../config/contributor-program.json', import.meta.url), 'utf8'));

export function renderContributorRewards() {
  return `<div class="contributor-rewards">${contributorProgram.benefits.map(item => `<article><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p></article>`).join('')}</div><p class="contributor-boundary" data-contributor-status="${escapeHtml(contributorProgram.status)}">${escapeHtml(contributorProgram.boundary)}</p>`;
}

export function renderContributorChapter() {
  return `<section class="home-contributors" id="contributors" aria-labelledby="contributors-title"><p class="eyebrow">The people behind the work</p><div class="home-editorial"><h2 id="contributors-title">Make the evidence<br />stronger.</h2><div><p class="home-lead">Open work improves when more people can check it.</p><p>Reproduce a result, fix a tool, improve a source or make the explanation clearer. Contributions stay in the public history, with the work they changed.</p><a class="button button--primary" href="/contributors">Become a contributor <span aria-hidden="true">↗</span></a></div></div>${renderContributorRewards()}</section>`;
}
