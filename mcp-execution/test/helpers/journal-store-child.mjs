// Only synthetic test input reaches this process; it has no network or broker integration.
import { appendJournalStore } from '../../src/journal-store.mjs';
const chunks = [];
process.stdin.on('data', chunk => chunks.push(chunk));
process.stdin.on('end', () => {
  try {
    appendJournalStore(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    console.log(JSON.stringify({ code: 'UNEXPECTED_SUCCESS' }));
  } catch (error) { console.log(JSON.stringify({ code: error.code })); }
});
