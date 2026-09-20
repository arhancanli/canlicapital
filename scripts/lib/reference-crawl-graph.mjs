// Intern copied paths and retain numeric edges, not regex slices into page HTML.
export function referenceCrawlGraph() {
  const ids = new Map(), edges = new Map();
  function id(path) {
    if (!ids.has(path)) ids.set(Buffer.from(path, 'utf8').toString('utf8'), ids.size);
    return ids.get(path);
  }
  return {
    recordPage(path, links) {
      edges.set(id(path), Uint32Array.from(new Set(Array.from(links, id))));
    },
    reachableFrom(path) {
      const start = ids.get(path);
      if (start === undefined || !edges.has(start)) return { pages: 0, maxDepth: 0 };
      const depths = new Map([[start, 0]]), queue = [start];
      let maxDepth = 0;
      for (let i = 0; i < queue.length; i++) {
        for (const child of edges.get(queue[i])) {
          if (!edges.has(child) || depths.has(child)) continue;
          const depth = depths.get(queue[i]) + 1;
          depths.set(child, depth); queue.push(child); maxDepth = Math.max(maxDepth, depth);
        }
      }
      return { pages: depths.size, maxDepth };
    },
    stats: () => ({ distinctPaths: ids.size, renderedPages: edges.size,
      edgeBytes: [...edges.values()].reduce((sum, row) => sum + row.byteLength, 0) }),
  };
}
