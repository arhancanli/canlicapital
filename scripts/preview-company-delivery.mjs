import { companyPreviewServer } from './lib/company-preview-server.mjs';
const [catalogDir, deliveryDir, distDir, portText = '4187', discoveryDir] = process.argv.slice(2);
if (!distDir) throw new Error('Usage: node scripts/preview-company-delivery.mjs CATALOG DELIVERY DIST [PORT] [DISCOVERY]');
const port = Number(portText);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid preview port');
const { server } = companyPreviewServer({ catalogDir, deliveryDir, distDir, discoveryDir });
server.listen(port, '127.0.0.1', () => console.log(`Staged noindex company preview on http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.closeAllConnections(); server.close(); });
