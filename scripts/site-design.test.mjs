import test from 'node:test';
import assert from 'node:assert/strict';
import {applySiteDesign} from './build-site-design.mjs';
import {applyReaderPresentation,applyHubNavigation} from './lib/reading-layout.mjs';
import {applyReleaseReadiness} from './build-release-readiness.mjs';
import {htmlText,escapeHtml} from './lib/html-text.mjs';
const page='<!doctype html><html lang="en"><head><title>Source example</title><meta name="robots" content="index, follow"><link rel="stylesheet" href="../css/paper.css"></head><body><header data-product-shell="v3"></header><main><h1>Source example</h1><table><caption>Filing history</caption><tbody><tr><td>Original value</td></tr></tbody></table><a href="/verify">Verify</a></main></body></html>';
test('the design migration is byte-identical on a second run',()=>{const once=applySiteDesign(page,'research/example.html');assert.equal(applySiteDesign(once,'research/example.html'),once);});
test('route migration preserves the title, robots, evidence cells and links',()=>{const result=applySiteDesign(page,'research/example.html');for(const text of ['<title>Source example</title>','content="index, follow"','<td>Original value</td>','href="/verify"'])assert.ok(result.includes(text),text);assert.match(result,/data-design="reader"/);assert.match(result,/class="cc-table-scroll"/);assert.match(result,/href="\/css\/product-shell.css"/);assert.doesNotMatch(result,/href="\.\.\/css\/paper.css"/);});
test('immutable documents outside the shared site shell are untouched',()=>{const source=page.replace('data-product-shell="v3"','data-original-paper="true"');assert.equal(applySiteDesign(source,'publication/example/paper.html'),source);});
test('standalone paper and hub generation retains the same reading layout on a repeated build',()=>{
 for(const file of ['research/example.html','research/topics/example.html']){
  const decorate=html=>applySiteDesign(file.includes('/topics/')?applyHubNavigation(html,{file}):applyReaderPresentation(html,{file,family:'research'}),file);
  const once=decorate(page.replace('<h1>Source example</h1>','<h1>Source example</h1><h2>Inspect the source</h2>'));
  assert.equal(decorate(once),once);
  assert.match(once,file.includes('/topics/')?/class="hub-index"/:/class="reader-index"/);
  assert.doesNotMatch(once,/href="\/css\/(?:reader|hub)-experience.css"/);
 }
});
test('the release pass and final design preserve source-date bytes across full rebuilds',()=>{
 for(const file of ['index.html','progress.html','open.html']){
  const decorate=html=>applySiteDesign(applyReleaseReadiness(html,{file,chainCount:1}),file);
  const once=decorate(page);
  assert.equal(decorate(once),once,file);
  assert.equal(decorate(decorate(once)),once,file);
  assert.doesNotMatch(once,/release-style:/);
 }
});
test('nested style removal and reading labels preserve prose without creating markup',()=>{
 const source=page.replace('</head>','<sty<style>discard</style>le>discard</style><STYLE>discard</STYLE></head>');
 const result=applySiteDesign(source,'research/example.html');
 assert.doesNotMatch(result,/<style\b/i);
 assert.match(result,/<title>Source example<\/title>/);
 assert.equal(htmlText('<em>Trials &amp; limits</em><SCRIPT>discard</SCRIPT>'),'Trials & limits');
 assert.equal(escapeHtml(htmlText('&lt;script&gt; &amp; limits')),'&lt;script&gt; &amp; limits');
 const reading=applyReaderPresentation(page.replace('<h1>Source example</h1>','<h1>Source example</h1><h2>Trials &amp; &lt;limits&gt;</h2>'),{file:'research/example.html',family:'research'});
 assert.match(reading,/<a href="#reader-section-1">Trials &amp; &lt;limits&gt;<\/a>/);
});
