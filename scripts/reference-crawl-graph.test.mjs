import test from 'node:test';
import assert from 'node:assert/strict';
import { referenceCrawlGraph } from './lib/reference-crawl-graph.mjs';

test('counts rendered reachability, shortest depths, cycles and orphans', () => {
  const graph = referenceCrawlGraph();
  graph.recordPage('/companies', ['/a', '/a', '/missing']);
  graph.recordPage('/a', ['/companies', '/b', '/c']);
  graph.recordPage('/b', ['/c']);
  graph.recordPage('/c', ['/a']);
  graph.recordPage('/orphan', []);
  assert.deepEqual(graph.reachableFrom('/companies'), { pages: 4, maxDepth: 2 });
  assert.deepEqual(graph.reachableFrom('/missing'), { pages: 0, maxDepth: 0 });
  assert.deepEqual(graph.reachableFrom('/absent'), { pages: 0, maxDepth: 0 });
  assert.deepEqual(graph.stats(), { distinctPaths: 6, renderedPages: 5, edgeBytes: 28 });
});

test('repeated links use one path identity and compact unique numeric edges', () => {
  const graph = referenceCrawlGraph();
  const html = 'x'.repeat(200_000) + 'href="/companies/a" '.repeat(500);
  for (let i = 0; i < 1000; i++) {
    graph.recordPage('/companies/' + i, [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]));
  }
  assert.deepEqual(graph.stats(), { distinctPaths: 1001, renderedPages: 1000, edgeBytes: 4000 });
  graph.recordPage('/companies/a', ['/companies/0']);
  assert.deepEqual(graph.reachableFrom('/companies/a'), { pages: 2, maxDepth: 1 });
});
