import {readFileSync,writeFileSync} from 'node:fs';
import {routes} from './phase7-scope.mjs';
import {applyReaderPresentation} from './lib/reading-layout.mjs';
for(const route of routes) writeFileSync(route.file,applyReaderPresentation(readFileSync(route.file,'utf8'),route));
console.log(`Reader layouts: ${routes.length} routes; protected originals excluded.`);
