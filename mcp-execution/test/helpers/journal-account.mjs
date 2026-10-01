import { genesisLine, nextLine } from '../../src/core/js/trade-journal-core.js';
import { keyFromSeed } from '../../../scripts/research/trade-journal/corpus.mjs';

const KEY = keyFromSeed('synthetic MCP journal integration');
export const PEM = KEY.export({ type: 'pkcs8', format: 'pem' });
export function syntheticAccountJournal(count = 3) {
  const lines = [genesisLine({ privateKey: KEY, ts: '2025-01-01T00:00:00.000Z', payload: { account: { schema: 'canli.trade-journal.account.v0', strategy_id: 'synthetic-mcp', session_id: 'label-only', venue: 'local_sim', currency: 'USD', initial_cash: 1000, initial_positions: [], frequency: 'IRREGULAR' } } })];
  for (let i = 1; i <= count; i++) lines.push(nextLine({ privateKey: KEY, last: lines.at(-1), kind: 'mark', ts: new Date(Date.UTC(2025, 0, 1 + i)).toISOString(), payload: { marks: {}, source: 'synthetic no positions' } }));
  return Buffer.from(lines.join('\n') + '\n');
}
