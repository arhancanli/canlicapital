import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import cp from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dgram from 'node:dgram';
import dns from 'node:dns';
import { syncBuiltinESMExports } from 'node:module';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { performance } from 'node:perf_hooks';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync, inflateRawSync } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(tmpdir(), 'canli-audit-files-package-'));
fs.chmodSync(TMP, 0o700);
const L = Object.freeze({ compressed: 262144, expanded: 2097152, members: 32, exactMembers: 16,
  npmOutput: 65536, packMs: 20000, rawRecord: 524288, fixture: 8388608, work: 15000, close: 5000, total: 20000 });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const raw = value => Buffer.from(JSON.stringify(value));
const saved = [], originalSpawn = cp.spawn, originalRm = fs.rmSync;
let packed, packEntries = 0, commandEntries = 0, denials = 0;
const owned = value => {
  if (value instanceof URL) value = fileURLToPath(value);
  return typeof value === 'string' && (path.resolve(value) === TMP || path.resolve(value).startsWith(TMP + path.sep));
};
const deny = () => { denials++; const error = new Error('NATIVE_DENIAL_CONTROL'); error.code = 'NATIVE_DENIAL_CONTROL'; throw error; };
function replace(object, key, fn) { saved.push([object, key, object[key]]); object[key] = fn; }
// Native denial is armed BEFORE the new client/executor imports. Only this temp
// fixture, ONE offline pack and THREE exact owned command entries can delegate.
for (const [object, names] of [[http, ['get', 'request']], [https, ['get', 'request']], [net, ['connect', 'createConnection']],
  [tls, ['connect']], [dgram, ['createSocket']], [dns, ['lookup', 'resolve', 'resolve4', 'resolve6']]]) for (const name of names) replace(object, name, deny);
replace(net.Socket.prototype, 'connect', deny); replace(net.Server.prototype, 'listen', deny);
const oldFetch = globalThis.fetch; globalThis.fetch = deny;
for (const name of ['writeFile', 'appendFile', 'mkdir', 'rename', 'rm', 'unlink', 'truncate', 'copyFile', 'cp', 'symlink', 'link', 'chmod', 'chown']) {
  if (fs[name]) replace(fs, name, deny); if (fsp[name]) replace(fsp, name, deny);
}
for (const name of ['writeFileSync', 'appendFileSync', 'mkdirSync', 'renameSync', 'rmSync', 'unlinkSync', 'truncateSync', 'copyFileSync', 'cpSync', 'symlinkSync', 'linkSync', 'chmodSync', 'chownSync']) {
  const real = fs[name]; if (!real) continue;
  replace(fs, name, (...args) => {
    if (name === 'symlinkSync') { if (!owned(args[1])) deny(); }
    else if (!owned(args[0]) || (['renameSync', 'copyFileSync', 'cpSync', 'linkSync'].includes(name) && !owned(args[1]))) deny();
    return real(...args);
  });
}
const writable = flags => typeof flags === 'number' ? !!(flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_APPEND)) : flags !== undefined && !['r', 'rs'].includes(flags);
for (const [object, name] of [[fs, 'openSync'], [fs, 'open'], [fsp, 'open']]) {
  const real = object[name]; replace(object, name, (filename, flags, ...rest) => { if (writable(flags) && !owned(filename)) deny(); return real(filename, flags, ...rest); });
}
replace(fs, 'createWriteStream', deny);
for (const name of ['exec', 'execSync', 'execFile', 'execFileSync', 'fork', 'spawnSync']) replace(cp, name, deny);
replace(cp, 'spawn', (command, args, options) => {
  if (command === 'npm' && args[0] === 'pack') {
    assert.equal(++packEntries, 1); assert.equal(options.cwd, ROOT); assert.equal(options.shell, false);
    assert.deepEqual(args.slice(0, 6), ['pack', '--offline', '--ignore-scripts', '--update-notifier=false', '--audit=false', '--fund=false']);
  } else if (packed && [packed.entry, packed.alias].includes(command)) {
    assert.ok(++commandEntries <= 3); assert.ok(owned(options.cwd)); assert.equal(options.shell, false);
    assert.equal(args.length, 10); assert.equal(args[0], '--root'); assert.equal(args[1], packed.root);
  } else deny();
  return originalSpawn(command, args, options);
});
syncBuiltinESMExports();

const { captureAuditInputFiles, runAuditInputsClient, runAuditInputsFiles, auditClientCli, auditClientCommand, parseAuditClientArgs, AUDIT_CLIENT_LIMITS } = await import('../src/audit-inputs-client.mjs');
const { executeAuditInputs, AUDIT_TOOL } = await import('../src/audit-inputs-stdio.mjs');
const { contentHash } = await import('../src/canonical-json.mjs');
// Generated frozen byte declarations: all old bodies remain the original pins.
const SOURCE_PINS = Object.freeze({
  'src/expert-intake-stdio.mjs': '1cde7375eb1e63b381d9343373e55351b5efca4db27cb24e2e91a98e8515f0ae',"src/expert-intake-files.mjs": "68db164a80b8a37b8ed4ea9e3d4ffa0a42b43f8f6fcc28a91f7b97e702411a1f", "src/expert-submission-client.mjs": "2f6935f53821dcfee2a7cbae51e927672fb26c49c73353fc515ecb1096cceb31", "src/expert-submission-files.mjs": "a5ed0b30f5338d3ed560f7fbc7cbb0e78966a56da188b72a8515ab077c4ea22d", "src/audit-inputs-client.mjs": "95fe942b1278768b4c938d82054d2d472eb3411c5587bdd8be4067b1dc0bc9b7", "src/audit-inputs-core.mjs": "e612ba0e44d12fd275b3e1dc0a2331bfe6fb005b4da8075e46ae009c5e299059", "src/audit-inputs-stdio.mjs": "537673fc03d0954ae480b239b8b481d11e14d763f1d0c07a985bb7d8fbd5b5c0", "src/canonical-json.mjs": "881196513013ba1a9ab868d5fc2e30d7c7fba4e7bc760445d39356a10aacee0b", "src/expert-agreement.mjs": "80732bf61e1cef9bd3ff06cf831307675546f4789f8336f1668d5fd637a7b4ef", "src/expert-intake-core.mjs": "5095379afe5ca5be2c2fc8dc2fac191025c454f87e135d036b307f84bb57d545", "src/expert-submission-audit-core.mjs": "4040abc8f142d77571117979b73790be5a7ddb9bbf8fe6eee2fcb686ea9099f3", "src/expert-submission-stdio.mjs": "56075a5daaa61bffbace0551aefe1220c372854ddca295b6adddd62abef65208", "src/filing-facts-packet.mjs": "74f2b353c0bf48d6e409d25925a6d691cf105a6f50aafdf561efbbbe679023c8", "src/server.mjs": "3166e985089e96e4a677282dcdfc4b89c691f71c7749513cedf87bc5642bb7a1"});
const ORIGINAL_PACKAGE = Object.freeze({"name": "canli-fundamentals-mcp", "version": "0.5.0", "description": "MCP server for SEC company fundamentals point in time: what was first reported, what was known on any date, and every later restatement, each value with the filing behind it. Computed locally from a hash-checked SEC snapshot.", "private": false, "type": "module", "license": "MIT", "bin": {"canli-fundamentals-mcp": "src/server.mjs", "canli-fundamentals-audit": "src/audit-inputs-stdio.mjs", "canli-expert-submission-audit": "src/expert-submission-stdio.mjs"}, "engines": {"node": ">=20.10"}, "files": ["src", "README.md", "AUDIT_INPUTS.md", "EXPERT_SUBMISSIONS.md"], "scripts": {"test": "node --test test/*.test.mjs"}, "dependencies": {"@modelcontextprotocol/server": "2.3.1", "zod": "4.6.5"}, "devDependencies": {"@modelcontextprotocol/client": "2.3.1"}, "mcpName": "io.github.arhancanli/canli-fundamentals-mcp", "repository": {"type": "git", "url": "git+https://github.com/arhancanli/canlicapital.git", "directory": "mcp-fundamentals"}, "homepage": "https://canlicapital.com/developers", "bugs": {"url": "https://github.com/arhancanli/canlicapital/issues"}, "keywords": ["mcp", "model-context-protocol", "sec", "edgar", "xbrl", "fundamentals", "point-in-time", "restatements", "backtesting", "quantitative-finance"]});
const ORIGINAL_LOCK = Object.freeze({"name": "canli-fundamentals-mcp", "version": "0.5.0", "lockfileVersion": 3, "requires": true, "packages": {"": {"name": "canli-fundamentals-mcp", "version": "0.5.0", "license": "MIT", "dependencies": {"@modelcontextprotocol/server": "2.3.1", "zod": "4.6.5"}, "bin": {"canli-fundamentals-mcp": "src/server.mjs", "canli-fundamentals-audit": "src/audit-inputs-stdio.mjs", "canli-expert-submission-audit": "src/expert-submission-stdio.mjs"}, "engines": {"node": ">=20.10"}, "devDependencies": {"@modelcontextprotocol/client": "2.3.1"}}, "node_modules/@modelcontextprotocol/client": {"version": "2.3.1", "resolved": "https://registry.npmjs.org/@modelcontextprotocol/client/-/client-2.3.1.tgz", "integrity": "sha512-mIGZXpHsjnZ6lD+gD/WCMpR5k8yVQQ8nNFH1N0Srf7AvnwTUMYD6pvTY8ng2+He5FfV7YMZLmrjL7cLa/cc3dQ==", "license": "Apache-2.0", "dependencies": {"@modelcontextprotocol/core": "2.3.1", "cross-spawn": "^7.0.5", "eventsource": "^3.0.2", "eventsource-parser": "^3.0.8", "jose": "^6.1.3", "pkce-challenge": "^5.0.0", "zod": "^4.2.0"}, "engines": {"node": ">=20"}, "dev": true}, "node_modules/@modelcontextprotocol/core": {"version": "2.3.1", "resolved": "https://registry.npmjs.org/@modelcontextprotocol/core/-/core-2.3.1.tgz", "integrity": "sha512-laVmIhPGpWi7rG9q+0UigblRN0Hws/Yjlb6qLFtVqryXVLkc4h+yN8z731POD2LnAGQlFe7/tXhUm7Bi0YB91g==", "license": "Apache-2.0", "dependencies": {"zod": "^4.2.0"}, "engines": {"node": ">=20"}}, "node_modules/@modelcontextprotocol/server": {"version": "2.3.1", "resolved": "https://registry.npmjs.org/@modelcontextprotocol/server/-/server-2.3.1.tgz", "integrity": "sha512-e59MfWuSssj6DoQ96JCTqdW1AXT5/XtnTl0WWd6MU1Ka434fFUGGosCLJbGNySDhHGvxQWoRWK137FXYFkYNWw==", "license": "Apache-2.0", "dependencies": {"@modelcontextprotocol/core": "2.3.1", "zod": "^4.2.0"}, "engines": {"node": ">=20"}}, "node_modules/cross-spawn": {"version": "7.0.6", "resolved": "https://registry.npmjs.org/cross-spawn/-/cross-spawn-7.0.6.tgz", "integrity": "sha512-uV2QOWP2nWzsy2aMp8aRibhi9dlzF5Hgh5SHaB9OiTGEyDTiJJyx0uy51QXdyWbtAHNua4XJzUKca3OzKUd3vA==", "license": "MIT", "dependencies": {"path-key": "^3.1.0", "shebang-command": "^2.0.0", "which": "^2.0.1"}, "engines": {"node": ">= 8"}, "dev": true}, "node_modules/eventsource": {"version": "3.0.7", "resolved": "https://registry.npmjs.org/eventsource/-/eventsource-3.0.7.tgz", "integrity": "sha512-CRT1WTyuQoD771GW56XEZFQ/ZoSfWid1alKGDYMmkt2yl8UXrVR4pspqWNEcqKvVIzg6PAltWjxcSSPrboA4iA==", "license": "MIT", "dependencies": {"eventsource-parser": "^3.0.1"}, "engines": {"node": ">=18.0.0"}, "dev": true}, "node_modules/eventsource-parser": {"version": "3.1.1", "resolved": "https://registry.npmjs.org/eventsource-parser/-/eventsource-parser-3.1.1.tgz", "integrity": "sha512-EKN1vKAMcZ8MlYMpaNuxN6R9yakzH6uajHcHVTqWJzvu5pWw9DyhbP35HH8MVBQ+dZjAfDxk+A8NiR9KWaXiyQ==", "license": "MIT", "engines": {"node": ">=18.0.0"}, "dev": true}, "node_modules/isexe": {"version": "2.0.0", "resolved": "https://registry.npmjs.org/isexe/-/isexe-2.0.0.tgz", "integrity": "sha512-RHxMLp9lnKHGHRng9QFhRCMbYAcVpn69smSGcq3f36xjgVVWThj4qqLbTLlq7Ssj8B+fIQ1EuCEGI2lKsyQeIw==", "license": "ISC", "dev": true}, "node_modules/jose": {"version": "6.2.12", "resolved": "https://registry.npmjs.org/jose/-/jose-6.2.12.tgz", "integrity": "sha512-9NiFmJEex0sy2Dk58j2UGBSHgUs2ypF9eZSu4L6vjOX3Dp96Sw1F3uL+H+D1sx02jZZdzUT0HgvCy59CuvXcWw==", "license": "MIT", "funding": {"url": "https://github.com/sponsors/panva"}, "dev": true}, "node_modules/path-key": {"version": "3.1.1", "resolved": "https://registry.npmjs.org/path-key/-/path-key-3.1.1.tgz", "integrity": "sha512-ojmeN0qd+y0jszEtoY48r0Peq5dwMEkIlCOu6Q5f41lfkswXuKtYrhgoTpLnyIcHm24Uhqx+5Tqm2InSwLhE6Q==", "license": "MIT", "engines": {"node": ">=8"}, "dev": true}, "node_modules/pkce-challenge": {"version": "5.0.1", "resolved": "https://registry.npmjs.org/pkce-challenge/-/pkce-challenge-5.0.1.tgz", "integrity": "sha512-wQ0b/W4Fr01qtpHlqSqspcj3EhBvimsdh0KlHhH8HRZnMsEa0ea2fTULOXOS9ccQr3om+GcGRk4e+isrZWV8qQ==", "license": "MIT", "engines": {"node": ">=16.20.0"}, "dev": true}, "node_modules/shebang-command": {"version": "2.0.0", "resolved": "https://registry.npmjs.org/shebang-command/-/shebang-command-2.0.0.tgz", "integrity": "sha512-kHxr2zZpYtdmrN1qDjrrX/Z1rR1kG8Dx+gkpK1G4eXmvXswmcE1hTWBWYUzlraYw1/yZp6YuDY77YtvbN0dmDA==", "license": "MIT", "dependencies": {"shebang-regex": "^3.0.0"}, "engines": {"node": ">=8"}, "dev": true}, "node_modules/shebang-regex": {"version": "3.0.0", "resolved": "https://registry.npmjs.org/shebang-regex/-/shebang-regex-3.0.0.tgz", "integrity": "sha512-7++dFhtcx3353uBaq8DDR4NuxBetBzC7ZQOhmTQInHEd6bSrXdiEyzCvG07Z44UYdLShWUyXt5M/yhz8ekcb1A==", "license": "MIT", "engines": {"node": ">=8"}, "dev": true}, "node_modules/which": {"version": "2.0.2", "resolved": "https://registry.npmjs.org/which/-/which-2.0.2.tgz", "integrity": "sha512-BLI3Tl1TW3Pvl70l3yq3Y64i+awpwXqsGBYWkkqMtnbXgrMD+yj7rhW0kuEDxzJaYXGjEW5ogapKNMEKNMjibA==", "license": "ISC", "dependencies": {"isexe": "^2.0.0"}, "bin": {"node-which": "bin/node-which"}, "engines": {"node": ">= 8"}, "dev": true}, "node_modules/zod": {"version": "4.6.5", "resolved": "https://registry.npmjs.org/zod/-/zod-4.6.5.tgz", "integrity": "sha512-v5l/aFXZQeai4awLbOpSoHecE9UiMrnfx75tEXLjNonXVARxQ5mOeipTjROUchszUNCqnE+hqAMujRsRHsut2Q==", "license": "MIT", "funding": {"url": "https://github.com/sponsors/colinhacks"}}}});
const RECIPE = Object.freeze([{"old": "from '../src/audit-inputs-stdio.mjs'", "new": "from './audit-inputs-stdio.mjs'", "count": 1}, {"old": "from '../src/audit-inputs-core.mjs'", "new": "from './audit-inputs-core.mjs'", "count": 1}, {"old": "from '../src/canonical-json.mjs'", "new": "from './canonical-json.mjs'", "count": 1}, {"old": "// Repository-only, offline example. Importing it starts no client or input capture.", "new": "// Packaged opt-in offline file client. Importing it starts no client or input capture.", "count": 1}, {"old": "resolve(dirname(fileURLToPath(import.meta.url)), '../..')", "new": "resolve(dirname(fileURLToPath(import.meta.url)), '..')", "count": 1}, {"old": "resolve(root, 'mcp-fundamentals/src/audit-inputs-stdio.mjs')", "new": "resolve(root, 'src/audit-inputs-stdio.mjs')", "count": 1}]);
const OWNERSHIP_HUNKS = Object.freeze([{"old": "const nativeSet = Uint8Array.prototype.set;\nconst sha = bytes => createHash('sha256').update(bytes).digest('hex');\nconst own = (o, k) => Object.hasOwn(o, k);\n\nexport class AuditClientError extends Error {\n  constructor(code) { super(`Offline audit client refused (${code}).`); this.code = code; this.name = 'AuditClientError'; }\n", "new": "const nativeSet = Uint8Array.prototype.set;\nconst sha = bytes => createHash('sha256').update(bytes).digest('hex');\nconst own = (o, k) => Object.hasOwn(o, k);\nconst CLI_BUDGET = Symbol('owned package CLI budget');\n\nexport class AuditClientError extends Error {\n  constructor(code) { super(`Offline audit client refused (${code}).`); this.code = code; this.name = 'AuditClientError'; }\n", "baseline_line": 27, "new_line": 27}, {"old": "}\n\nfunction sdkOperations(root, boundary, stderr, fail, sdkModules) {\n  let transport, client, processObject, ownedPid = null, exited = false, closed = false;\n  let exitPromise = Promise.resolve();\n  let closePromise;\n  return {\n", "new": "}\n\nfunction sdkOperations(root, boundary, stderr, fail, sdkModules) {\n  let transport, client, processObject, ownedPid = null, exited = false, closed = false, startAttempted = false;\n  let exitPromise = Promise.resolve();\n  let closePromise;\n  return {\n", "baseline_line": 286, "new_line": 287}, {"old": "      const start = transport.start.bind(transport);\n      transport.start = () => {\n        boundary(); if (closed) refuse('ABORTED');\n        const pending = start();\n        // Exact locked 2.1.0 field; keep the object BEFORE SDK close clears it.\n        processObject = transport._process;\n        if (processObject) {\n", "new": "      const start = transport.start.bind(transport);\n      transport.start = () => {\n        boundary(); if (closed) refuse('ABORTED');\n        startAttempted = true;\n        const pending = start();\n        // Handle BOTH original outcomes before any fallible child-field/listener\n        // admission. This observer never throws; return the original Promise.\n        const observed = pending.then(() => {}, () => { try { if (!closed) fail('CONNECT'); } catch { /* Owned outcome remains handled. */ } });\n        observed.catch(() => {});\n        // Exact locked 2.1.0 field; keep the object BEFORE SDK close clears it.\n        processObject = transport._process;\n        if (processObject) {\n", "baseline_line": 319, "new_line": 320}, {"old": "        if (client) await client.close();\n        // If initialization never adopted the transport, still dispose the same child.\n        if (transport) await transport.close();\n        if (processObject && ownedPid !== null && !exited) await exitPromise;\n        return { owned_pid: ownedPid, owned_child_absent: processObject ? exited : true, evidence: processObject ? 'same_owned_child_exit_or_close' : 'no_child_started' };\n      })();\n", "new": "        if (client) await client.close();\n        // If initialization never adopted the transport, still dispose the same child.\n        if (transport) await transport.close();\n        if (startAttempted && (!processObject || ownedPid === null)) refuse('CHILD_UNCERTAIN');\n        if (processObject && ownedPid !== null && !exited) await exitPromise;\n        return { owned_pid: ownedPid, owned_child_absent: processObject ? exited : true, evidence: processObject ? 'same_owned_child_exit_or_close' : 'no_child_started' };\n      })();\n", "baseline_line": 351, "new_line": 357}, {"old": "  };\n}\n\nasync function workflow(capture, expected, { operations, sdkModules, root, now = () => performance.now(), signal } = {}) {\n  // Primitive expected hash is checked before ANY supplied clock/capture/transport callback.\n  try { expectedSha(expected); } catch (error) { return terminalRefusal(errorCode(error, 'EXPECTED_SHA')); }\n  let started, previous, workEnd, closeStart, firstFailure, artifact, prepared, ops;\n  let connectAttempts = 0, auditCalls = 0, closeAttempts = 0, stderrBytes = 0;\n  let closure = { owned_pid: null, owned_child_absent: true, evidence: 'no_child_started' };\n  const abort = new AbortController();\n  const fail = code => { firstFailure ??= code; if (!abort.signal.aborted) abort.abort(new AuditClientError(code)); };\n  function observe() {\n    const value = now();\n    if (!Number.isFinite(value) || (previous !== undefined && value < previous)) refuse('CLOCK');\n", "new": "  };\n}\n\nasync function workflow(capture, expected, { operations, sdkModules, root, now = () => performance.now(), signal, [CLI_BUDGET]: cliBudget } = {}) {\n  // Primitive expected hash is checked before ANY supplied clock/capture/transport callback.\n  try { expectedSha(expected); } catch (error) { return terminalRefusal(errorCode(error, 'EXPECTED_SHA')); }\n  let started, previous, workEnd, closeStart, firstFailure, artifact, prepared, ops;\n  let connectAttempts = 0, auditCalls = 0, closeAttempts = 0, stderrBytes = 0;\n  let closure = { owned_pid: null, owned_child_absent: true, evidence: 'no_child_started' };\n  const abort = new AbortController();\n  const fail = code => { firstFailure ??= code; cliBudget?.fail(code); if (!abort.signal.aborted) abort.abort(new AuditClientError(code)); };\n  function observe() {\n    const value = now();\n    if (!Number.isFinite(value) || (previous !== undefined && value < previous)) refuse('CLOCK');\n", "baseline_line": 358, "new_line": 365}, {"old": "    } catch { fail('STDERR_BOUND'); }\n  };\n  try {\n    started = observe();\n    if (signal?.aborted) fail('ABORTED'); else signal?.addEventListener('abort', onAbort, { once: true });\n    workTimer = setTimeout(() => fail('WORK_DEADLINE'), AUDIT_CLIENT_LIMITS.workMs);\n    workBoundary();\n    const bytes = capture(workBoundary); workBoundary();\n    prepared = prepare(bytes, expected); workBoundary();\n", "new": "    } catch { fail('STDERR_BOUND'); }\n  };\n  try {\n    started = cliBudget ? cliBudget.started : observe();\n    if (signal?.aborted) fail('ABORTED'); else signal?.addEventListener('abort', onAbort, { once: true });\n    workTimer = setTimeout(() => fail('WORK_DEADLINE'), cliBudget ? Math.max(0, AUDIT_CLIENT_LIMITS.workMs - (observe() - started)) : AUDIT_CLIENT_LIMITS.workMs);\n    workBoundary();\n    const bytes = capture(workBoundary); workBoundary();\n    prepared = prepare(bytes, expected); workBoundary();\n", "baseline_line": 405, "new_line": 412}, {"old": "    let timer;\n    try {\n      workEnd = observe(); closeStart = workEnd;\n      if (ops) {\n        closeAttempts++;\n        const closeRemaining = Math.max(0, Math.min(AUDIT_CLIENT_LIMITS.closeMs, AUDIT_CLIENT_LIMITS.totalMs - (closeStart - started)));\n", "new": "    let timer;\n    try {\n      workEnd = observe(); closeStart = workEnd;\n      cliBudget?.beginClose(closeStart);\n      if (ops) {\n        closeAttempts++;\n        const closeRemaining = Math.max(0, Math.min(AUDIT_CLIENT_LIMITS.closeMs, AUDIT_CLIENT_LIMITS.totalMs - (closeStart - started)));\n", "baseline_line": 424, "new_line": 431}, {"old": "    if (workEnd - started > AUDIT_CLIENT_LIMITS.workMs) firstFailure ??= 'WORK_DEADLINE';\n    if (end - closeStart > AUDIT_CLIENT_LIMITS.closeMs || end - started > AUDIT_CLIENT_LIMITS.totalMs) firstFailure ??= 'CLOSE_DEADLINE';\n    if (signal?.aborted) firstFailure ??= 'ABORTED';\n    const report = firstFailure ? refusalReport(firstFailure, lifecycle) : {\n      schema: 'canli.fundamentals.audit-client-result.v1', status: 'ok', artifact,\n      verified: { compact_artifact_hash: true, original_byte_bindings: true, complete_selected_rows: true, complete_core_report: false, source_execution_authenticated: false },\n", "new": "    if (workEnd - started > AUDIT_CLIENT_LIMITS.workMs) firstFailure ??= 'WORK_DEADLINE';\n    if (end - closeStart > AUDIT_CLIENT_LIMITS.closeMs || end - started > AUDIT_CLIENT_LIMITS.totalMs) firstFailure ??= 'CLOSE_DEADLINE';\n    if (signal?.aborted) firstFailure ??= 'ABORTED';\n    if (firstFailure) cliBudget?.fail(firstFailure);\n    const report = firstFailure ? refusalReport(firstFailure, lifecycle) : {\n      schema: 'canli.fundamentals.audit-client-result.v1', status: 'ok', artifact,\n      verified: { compact_artifact_hash: true, original_byte_bindings: true, complete_selected_rows: true, complete_core_report: false, source_execution_authenticated: false },\n", "baseline_line": 454, "new_line": 462}, {"old": "    if (!firstFailure && (afterEncoding - closeStart > AUDIT_CLIENT_LIMITS.closeMs || afterEncoding - started > AUDIT_CLIENT_LIMITS.totalMs)) refuse('CLOSE_DEADLINE');\n    if (!firstFailure && signal?.aborted) refuse('ABORTED');\n    return { report, encoded };\n  } catch (error) { return terminalRefusal(firstFailure ?? errorCode(error, 'INTERNAL'), lifecycle); }\n}\nfunction refusalReport(code, lifecycle) {\n  return { schema: 'canli.fundamentals.audit-client-result.v1', status: 'refused', error: { code: CODES.has(code) ? code : 'INTERNAL', message: 'Offline audit did not produce a verified, closed compact result.' }, ...(lifecycle ? { lifecycle } : {}) };\n", "new": "    if (!firstFailure && (afterEncoding - closeStart > AUDIT_CLIENT_LIMITS.closeMs || afterEncoding - started > AUDIT_CLIENT_LIMITS.totalMs)) refuse('CLOSE_DEADLINE');\n    if (!firstFailure && signal?.aborted) refuse('ABORTED');\n    return { report, encoded };\n  } catch (error) { const code = firstFailure ?? errorCode(error, 'INTERNAL'); cliBudget?.fail(code); return terminalRefusal(code, lifecycle); }\n}\nfunction refusalReport(code, lifecycle) {\n  return { schema: 'canli.fundamentals.audit-client-result.v1', status: 'refused', error: { code: CODES.has(code) ? code : 'INTERNAL', message: 'Offline audit did not produce a verified, closed compact result.' }, ...(lifecycle ? { lifecycle } : {}) };\n", "baseline_line": 465, "new_line": 474}, {"old": "  return parsed;\n}\nexport async function auditClientCli(argv, dependencies = {}) {\n  try {\n    const options = parseAuditClientArgs(argv);\n    options.root = canonicalRoot(options.root, dependencies.fs ?? nativeFs);\n    return await runAuditInputsFiles(options, dependencies);\n  } catch (error) { return terminalRefusal(errorCode(error, 'ARGUMENTS')); }\n}\nfunction directEntry() {\n  if (!process.argv[1]) return false;\n", "new": "  return parsed;\n}\nexport async function auditClientCli(argv, dependencies = {}) {\n  let budget;\n  try {\n    budget = dependencies[CLI_BUDGET] ?? cliBudget(dependencies.now, dependencies.signal);\n    budget.workBoundary();\n    const options = parseAuditClientArgs(argv);\n    budget.workBoundary();\n    options.root = canonicalRoot(options.root, dependencies.fs ?? nativeFs);\n    budget.workBoundary();\n    return await runAuditInputsFiles(options, { ...dependencies, now: budget.observe, signal: budget.signal, [CLI_BUDGET]: budget });\n  } catch (error) {\n    const code = errorCode(error, 'ARGUMENTS'); budget?.fail(code);\n    return terminalRefusal(budget?.failure() ?? code);\n  } finally { if (budget && !dependencies[CLI_BUDGET]) budget.dispose(); }\n}\n\n// Package-only CLI ownership. Parsing, root capture, work, the original once-only\n// close reserve and the final native stdout observation share ONE clock.\nfunction cliBudget(now = () => performance.now(), signal) {\n  let previous, closeStart, firstFailure;\n  const abort = new AbortController();\n  const fail = code => { firstFailure ??= code; if (!abort.signal.aborted) abort.abort(new AuditClientError(firstFailure)); };\n  const observe = () => {\n    const time = now();\n    if (!Number.isFinite(time) || (previous !== undefined && time < previous)) { fail('CLOCK'); refuse('CLOCK'); }\n    previous = time; return time;\n  };\n  const started = observe();\n  const onAbort = () => fail('ABORTED');\n  if (signal?.aborted) onAbort(); else signal?.addEventListener('abort', onAbort, { once: true });\n  return {\n    started, signal: abort.signal, observe, fail, failure: () => firstFailure,\n    beginClose(time) { closeStart ??= time; },\n    workBoundary() {\n      const time = observe();\n      if (time - started >= AUDIT_CLIENT_LIMITS.workMs) fail('WORK_DEADLINE');\n      if (firstFailure) refuse(firstFailure);\n      return time;\n    },\n    terminalBoundary() {\n      const time = observe(); closeStart ??= time;\n      if (time - closeStart > AUDIT_CLIENT_LIMITS.closeMs || time - started > AUDIT_CLIENT_LIMITS.totalMs) fail('CLOSE_DEADLINE');\n      if (firstFailure) refuse(firstFailure);\n      return time;\n    },\n    remaining() { const time = observe(); closeStart ??= time; return Math.max(0, Math.min(AUDIT_CLIENT_LIMITS.closeMs - (time - closeStart), AUDIT_CLIENT_LIMITS.totalMs - (time - started))); },\n    dispose() { signal?.removeEventListener('abort', onAbort); },\n  };\n}\n\n/** Trusted native terminal hooks for finite fixtures; CLI flags cannot replace them. */\nexport async function auditClientCommand(argv, dependencies = {}) {\n  let budget, terminal, encoded, capturedWrite, stream, timer, written = false;\n  const interrupts = dependencies.interrupts ?? process;\n  const onInterrupt = () => budget?.fail('ABORTED');\n  let cleanup = () => {};\n  try {\n    budget = cliBudget(dependencies.now, dependencies.signal);\n    interrupts.on('SIGINT', onInterrupt); interrupts.on('SIGTERM', onInterrupt);\n    stream = dependencies.stdout ?? process.stdout;\n    capturedWrite = stream.write.bind(stream); // Save the native writer BEFORE serialization.\n    terminal = await auditClientCli(argv, { ...dependencies, [CLI_BUDGET]: budget });\n    budget.beginClose(budget.observe()); // Does not reset the original close reserve.\n    if (terminal.report.status !== 'ok') budget.fail(terminal.report.error.code);\n    try {\n      const serialize = dependencies.serializeTerminal ?? JSON.stringify;\n      const json = serialize(terminal.report);\n      if (typeof json !== 'string') refuse('OUTPUT_BOUND');\n      encoded = json + '\\n';\n      if (Buffer.byteLength(encoded) > (terminal.report.status === 'ok' ? AUDIT_CLIENT_LIMITS.output : AUDIT_CLIENT_LIMITS.refusal)) refuse('OUTPUT_BOUND');\n      budget.terminalBoundary();\n    } catch (error) {\n      budget.fail(errorCode(error, 'INTERNAL'));\n      terminal = terminalRefusal(budget.failure(), terminal.report.lifecycle);\n      encoded = terminal.encoded;\n    }\n    const pending = new Promise((resolveWrite, rejectWrite) => {\n      let returned = false, callbackDone = false, needsDrain = false, drained = false, settled = false;\n      const done = error => { if (settled) return; settled = true; error ? rejectWrite(error) : resolveWrite(); };\n      const complete = () => { if (returned && callbackDone && (!needsDrain || drained)) done(); };\n      const onDrain = () => { drained = true; complete(); };\n      const onError = () => done(new AuditClientError('INTERNAL'));\n      const onAbort = () => done(new AuditClientError(budget.failure() ?? 'ABORTED'));\n      cleanup = () => { stream.removeListener('drain', onDrain); stream.removeListener('error', onError); budget.signal.removeEventListener('abort', onAbort); };\n      stream.once('drain', onDrain); stream.once('error', onError);\n      if (terminal.report.status === 'ok') budget.signal.addEventListener('abort', onAbort, { once: true });\n      timer = setTimeout(() => done(new AuditClientError('CLOSE_DEADLINE')), Math.max(1, budget.remaining()));\n      try {\n        // Observed immediately AFTER encoding/cap/listener admission and immediately\n        // BEFORE the one captured write. Already-refused output stays a tiny refusal.\n        try { budget.terminalBoundary(); }\n        catch (error) {\n          if (terminal.report.status === 'ok') {\n            terminal = terminalRefusal(budget.failure() ?? errorCode(error, 'INTERNAL'), terminal.report.lifecycle);\n            encoded = terminal.encoded;\n          }\n          budget.observe();\n        }\n        written = true;\n        needsDrain = capturedWrite(encoded, error => { if (error) done(new AuditClientError('INTERNAL')); else { callbackDone = true; complete(); } }) === false;\n        returned = true; complete();\n      } catch (error) { done(new AuditClientError(errorCode(error, 'INTERNAL'))); }\n    });\n    pending.catch(() => {});\n    await pending;\n    if (terminal.report.status === 'ok') budget.terminalBoundary(); else budget.observe();\n    return { ...terminal, encoded, exitCode: terminal.report.status === 'ok' ? 0 : 1, written, write_completed: true };\n  } catch (error) {\n    budget?.fail(errorCode(error, 'INTERNAL'));\n    return { ...terminalRefusal(budget?.failure() ?? errorCode(error, 'INTERNAL'), terminal?.report.lifecycle), exitCode: 1, written, write_completed: false };\n  } finally {\n    clearTimeout(timer); cleanup(); budget?.dispose();\n    interrupts.removeListener('SIGINT', onInterrupt); interrupts.removeListener('SIGTERM', onInterrupt);\n  }\n}\nfunction directEntry() {\n  if (!process.argv[1]) return false;\n", "baseline_line": 498, "new_line": 507}, {"old": "  catch { return false; }\n}\nif (directEntry()) {\n  const terminal = await auditClientCli(process.argv.slice(2));\n  process.stdout.write(terminal.encoded);\n  process.exitCode = terminal.report.status === 'ok' ? 0 : 1;\n}\n", "new": "  catch { return false; }\n}\nif (directEntry()) {\n  const terminal = await auditClientCommand(process.argv.slice(2));\n  process.exitCode = terminal.exitCode;\n}\n", "baseline_line": 510, "new_line": 627}]);
const DEV_FLAGS = Object.freeze(["node_modules/@modelcontextprotocol/client", "node_modules/cross-spawn", "node_modules/eventsource", "node_modules/eventsource-parser", "node_modules/isexe", "node_modules/jose", "node_modules/path-key", "node_modules/pkce-challenge", "node_modules/shebang-command", "node_modules/shebang-regex", "node_modules/which"]);
const FOCUSED_LINES = Object.freeze(["    \"test:audit-inputs-client-package\": \"node --test --test-concurrency=1 mcp-fundamentals/test/audit-inputs-client-package.test.mjs\",\n", "    \"filingfacts:audit-inputs-files\": \"node mcp-fundamentals/src/audit-inputs-client.mjs\",\n", "    \"test:expert-submission-files-package\": \"node --test --test-concurrency=1 mcp-fundamentals/test/expert-submission-files-package.test.mjs\",\n", "    \"filingfacts:expert-submission-files\": \"node mcp-fundamentals/src/expert-submission-files.mjs\",\n"]);
const ORIGINAL_README_SHA = Object.freeze("8606a1ae17645536e05bb115ede37a2739e32b3997078aae32c55e24f490d33b");

function snapshot(filename, cap = L.expanded) {
  let fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | fs.constants.O_NOFOLLOW);
  try {
    const first = fs.fstatSync(fd, { bigint: true }); assert.ok(first.isFile() && first.size <= BigInt(cap), 'FILE_BOUND');
    const bytes = Buffer.alloc(Number(first.size) + 1); let position = 0;
    while (position < bytes.length) { const n = fs.readSync(fd, bytes, position, bytes.length - position, position); if (!n) break; position += n; }
    const last = fs.fstatSync(fd, { bigint: true }), post = fs.lstatSync(filename, { bigint: true });
    for (const key of ['dev', 'ino', 'mode', 'size', 'mtimeNs', 'ctimeNs']) { assert.equal(last[key], first[key]); assert.equal(post[key], last[key]); }
    assert.equal(position, Number(first.size)); const ownedFd = fd; fd = undefined; fs.closeSync(ownedFd);
    return Buffer.from(bytes.subarray(0, position));
  } finally { if (fd !== undefined) { const ownedFd = fd; fd = undefined; fs.closeSync(ownedFd); } }
}
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function decodeTar(compressed) {
  assert.ok(Buffer.isBuffer(compressed) && compressed.length >= 18 && compressed.length <= L.compressed, 'GZIP_BOUND');
  assert.deepEqual([...compressed.subarray(0, 4)], [31, 139, 8, 0], 'GZIP_HEADER');
  const inflated = inflateRawSync(compressed.subarray(10), { info: true, maxOutputLength: L.expanded });
  const bytes = inflated.buffer, end = 10 + inflated.engine.bytesWritten;
  assert.equal(end + 8, compressed.length, 'GZIP_SINGLE'); assert.equal(compressed.readUInt32LE(end), crc32(bytes), 'GZIP_CRC');
  assert.equal(compressed.readUInt32LE(end + 4), bytes.length >>> 0, 'GZIP_ISIZE');
  assert.ok(bytes.length <= L.expanded && bytes.length % 512 === 0, 'TAR_BOUND');
  const entries = new Map(); let offset = 0, ended = false;
  const ascii = (field, numeric = false) => {
    assert.ok(field.every(n => n <= 127), 'TAR_ASCII'); const zero = field.indexOf(0);
    if (zero >= 0) assert.ok(field.subarray(zero).every(n => n === 0 || (numeric && n === 32)), 'TAR_PADDING');
    return (zero < 0 ? field : field.subarray(0, zero)).toString('ascii');
  };
  const octal = field => { const text = ascii(field, true).trim(); assert.match(text, /^[0-7]+$/, 'TAR_OCTAL'); return parseInt(text, 8); };
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every(n => n === 0)) { assert.ok(offset + 1024 <= bytes.length && bytes.subarray(offset).every(n => n === 0), 'TAR_END'); ended = true; break; }
    assert.ok(entries.size < L.members, 'TAR_COUNT'); assert.ok(header.every(n => n <= 127), 'TAR_ASCII');
    const name = ascii(header.subarray(0, 100)), prefix = ascii(header.subarray(345, 500)), filename = prefix ? prefix + '/' + name : name;
    assert.match(filename, /^package\/[A-Za-z0-9_./-]+$/, 'TAR_PATH');
    assert.ok(filename.split('/').every(part => part && part !== '.' && part !== '..'), 'TAR_PATH');
    assert.ok(!entries.has(filename), 'TAR_DUPLICATE');
    const type = ascii(header.subarray(156, 157)); assert.ok(type === '' || type === '0', 'TAR_REGULAR');
    assert.equal(ascii(header.subarray(157, 257)), '', 'TAR_LINK');
    const mode = octal(header.subarray(100, 108)), size = octal(header.subarray(124, 136));
    assert.ok([0o644, 0o755].includes(mode) && size <= L.expanded, 'TAR_MODE_SIZE');
    assert.equal(octal(header.subarray(148, 156)), header.reduce((n, byte, i) => n + (i >= 148 && i < 156 ? 32 : byte), 0), 'TAR_CHECKSUM');
    const next = offset + 512 + Math.ceil(size / 512) * 512; assert.ok(next <= bytes.length, 'TAR_BODY');
    entries.set(filename, { mode, bytes: Buffer.from(bytes.subarray(offset + 512, offset + 512 + size)) }); offset = next;
  }
  assert.equal(ended, true, 'TAR_END'); return entries;
}
const MEMBERS = Object.freeze(['LICENSE', 'README.md', 'AUDIT_INPUTS.md', 'EXPERT_SUBMISSIONS.md', 'AUDIT_INPUTS_CLIENT.md', 'EXPERT_SUBMISSION_FILES.md', 'EXPERT_SUBMISSION_CLIENT.md', 'EXPERT_INTAKE_FILES.md', 'EXPERT_INTAKE_STDIO.md', 'package.json', ...Object.keys(SOURCE_PINS)].map(name => 'package/' + name).sort());
const BIN = Object.freeze({ 'canli-fundamentals-mcp': 'src/server.mjs', 'canli-fundamentals-audit': 'src/audit-inputs-stdio.mjs', 'canli-expert-submission-audit': 'src/expert-submission-stdio.mjs', 'canli-fundamentals-audit-files': 'src/audit-inputs-client.mjs', 'canli-expert-submission-files': 'src/expert-submission-files.mjs', 'canli-expert-submission-client': 'src/expert-submission-client.mjs', 'canli-expert-intake-files': 'src/expert-intake-files.mjs', 'canli-expert-intake-prepare': 'src/expert-intake-stdio.mjs' });
const MODES = Object.freeze(Object.fromEntries(MEMBERS.map(name => [name, Object.values(BIN).filter(p => p !== 'src/server.mjs').includes(name.slice(8)) ? 0o755 : 0o644])));
function imports(entries) {
  for (const [filename, row] of entries) {
    if (!/\.(?:js|mjs)$/.test(filename)) continue;
    const source = row.bytes.toString('utf8'), dynamic = [...source.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g)];
    if (filename === 'package/src/audit-inputs-client.mjs') {
      assert.equal(sha(row.bytes), SOURCE_PINS['src/audit-inputs-client.mjs'], 'CLIENT_SOURCE');
      assert.deepEqual(dynamic.map(hit => hit[2]), ['@modelcontextprotocol/client', '@modelcontextprotocol/client/stdio'], 'DYNAMIC_FIXED');
    } else if (filename === 'package/src/expert-submission-files.mjs') {
      assert.equal(sha(row.bytes), SOURCE_PINS['src/expert-submission-files.mjs'], 'SOURCE');
      assert.deepEqual(dynamic.map(hit => hit[2]), ['./expert-submission-audit-core.mjs'], 'DYNAMIC_FIXED');
      assert.ok(entries.has('package/src/expert-submission-audit-core.mjs'), 'LOCAL_IMPORT');
    } else if (filename === 'package/src/expert-submission-client.mjs') {
      assert.equal(sha(row.bytes), SOURCE_PINS['src/expert-submission-client.mjs'], 'SOURCE_PIN');
      assert.deepEqual(dynamic.map(hit => hit[2]), ['@modelcontextprotocol/client', '@modelcontextprotocol/client/stdio', './expert-submission-stdio.mjs'], 'DYNAMIC_FIXED');
      assert.ok(entries.has('package/src/expert-submission-stdio.mjs'), 'LOCAL_IMPORT');
    } else if (filename === 'package/src/expert-intake-files.mjs') {
      assert.equal(sha(row.bytes), SOURCE_PINS['src/expert-intake-files.mjs'], 'SOURCE_PIN');
      assert.deepEqual(dynamic.map(hit => hit[2]), ['./expert-intake-core.mjs'], 'FIXED_DYNAMIC_IMPORTS');
      assert.ok(entries.has('package/src/expert-intake-core.mjs'), 'LOCAL_IMPORT');
    } else assert.equal(dynamic.length, 0, 'DYNAMIC');
    assert.doesNotMatch(source.replace(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g, 'FIXED_SDK'), /\b(?:import\s*\(|require\s*\(|createRequire\b)/, 'DYNAMIC');
    assert.doesNotMatch(source, /^export\s+(?:\*\s*(?:as\s+\w+\s*)?|\{[^}]*\}\s*)from\b/gm, 'REEXPORT');
    const statics = [...source.matchAll(/^import .+ from ['"]([^'"]+)['"];$/gm)];
    assert.equal(statics.length, [...source.matchAll(/^import\b/gm)].length, 'UNPARSED_IMPORT');
    for (const [, specifier] of statics) {
      if (specifier.startsWith('.')) { const target = path.posix.normalize(path.posix.join(path.posix.dirname(filename), specifier)); assert.ok(target.startsWith('package/src/') && entries.has(target), 'LOCAL_IMPORT'); }
      else assert.ok(specifier.startsWith('node:') || ['@modelcontextprotocol/server', '@modelcontextprotocol/server/stdio', 'zod'].includes(specifier), 'EXTERNAL_IMPORT');
    }
  }
}
let expected;
function admit(entries) {
  assert.deepEqual([...entries.keys()].sort(), MEMBERS, 'MEMBERS'); imports(entries);
  for (const [filename, row] of entries) {
    assert.equal(row.mode, MODES[filename], 'MODE'); if (SOURCE_PINS[filename.slice(8)]) assert.equal(sha(row.bytes), SOURCE_PINS[filename.slice(8)], 'SOURCE');
  }
  const metadata = JSON.parse(entries.get('package/package.json').bytes);
  assert.deepEqual(metadata.bin, BIN, 'BIN'); assert.deepEqual(metadata.files, ['src', 'README.md', 'AUDIT_INPUTS.md', 'EXPERT_SUBMISSIONS.md', 'AUDIT_INPUTS_CLIENT.md', 'EXPERT_SUBMISSION_FILES.md', 'EXPERT_SUBMISSION_CLIENT.md', 'EXPERT_INTAKE_FILES.md', 'EXPERT_INTAKE_STDIO.md'], 'FILES');
  assert.deepEqual(metadata.dependencies, { '@modelcontextprotocol/server': '2.3.1', zod: '4.6.5', '@modelcontextprotocol/client': '2.3.1' }, 'RUNTIME');
  assert.equal(metadata.devDependencies, undefined); assert.equal(metadata.version, '0.5.0'); assert.equal(metadata.private, false);
  for (const [filename, row] of entries) assert.deepEqual(row.bytes, expected.get(filename), 'FROZEN_BYTES');
  return metadata;
}
function cloneEntries() { return new Map([...packed.entries].map(([name, row]) => [name, { mode: row.mode, bytes: Buffer.from(row.bytes) }])); }
function checksum(header) { header.fill(32, 148, 156); header.write(header.reduce((n, b) => n + b, 0).toString(8).padStart(6, '0') + '\0 ', 148, 'ascii'); return header; }
function tinyTar(rows, mutate = () => {}) {
  const chunks = [];
  rows.forEach((row, index) => { const header = Buffer.alloc(512); header.write(row.name, 0, 'ascii'); header.write('0000644\0', 100, 'ascii');
    header.write(row.bytes.length.toString(8).padStart(11, '0') + '\0', 124, 'ascii'); header[156] = 48;
    mutate(header, index); checksum(header); chunks.push(header, row.bytes, Buffer.alloc((512 - row.bytes.length % 512) % 512)); });
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]), { mtime: 0 });
}
const absent = pid => { assert.ok(Number.isSafeInteger(pid) && pid > 1); try { process.kill(pid, 0); return false; } catch (error) { if (error.code === 'ESRCH') return true; throw error; } };
const bounded = (promise, ms) => { let timer; return Promise.race([Promise.resolve(promise), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('OWNED_BOUND')), Math.max(1, ms)); })]).finally(() => clearTimeout(timer)); };
function guardSource(kind, packageRoot) {
  return `
import fs from 'node:fs'; import fsp from 'node:fs/promises'; import cp from 'node:child_process';
import http from 'node:http'; import https from 'node:https'; import net from 'node:net'; import tls from 'node:tls'; import dgram from 'node:dgram'; import dns from 'node:dns';
import { syncBuiltinESMExports } from 'node:module'; import path from 'node:path';
const kind=${JSON.stringify(kind)}, own=${JSON.stringify(TMP)}, root=${JSON.stringify(packageRoot)}, guard=import.meta.url;
let denied=0, launches=0, controls=true;
const ownedFDs=new Set([1,2]);
const isClient=kind==='client'&&fs.realpathSync(process.argv[1])===path.join(root,'src/audit-inputs-client.mjs');
const deny=()=>{denied++;if(!controls)process.stderr.write('DENIED_OPERATION\\n');const e=new Error('NATIVE_DENIAL_CONTROL');e.code='NATIVE_DENIAL_CONTROL';throw e;};
const inside=p=>typeof p==='string'&&(path.resolve(p)===own||path.resolve(p).startsWith(own+path.sep));
const writable=f=>typeof f==='number'?!!(f&(fs.constants.O_WRONLY|fs.constants.O_RDWR|fs.constants.O_CREAT|fs.constants.O_TRUNC|fs.constants.O_APPEND)):f!==undefined&&!['r','rs'].includes(f);
globalThis.fetch=deny;
for(const [o,ns] of [[http,['request','get']],[https,['request','get']],[net,['connect','createConnection']],[tls,['connect']],[dgram,['createSocket']],[dns,['lookup','resolve','resolve4','resolve6']]])for(const n of ns)o[n]=deny;
net.Socket.prototype.connect=deny;net.Server.prototype.listen=deny;
for(const n of ['writeFile','writeFileSync','appendFile','appendFileSync','mkdir','mkdirSync','rename','renameSync','rm','rmSync','unlink','unlinkSync','truncate','truncateSync','createWriteStream','copyFile','copyFileSync','cp','cpSync','symlink','symlinkSync','link','linkSync','chmod','chmodSync','chown','chownSync']) {
 const original=fs[n];if(original)fs[n]=(...args)=>{if(kind!=='pack'||!inside(args[0])||(['rename','renameSync','copyFile','copyFileSync','cp','cpSync','link','linkSync'].includes(n)&&!inside(args[1])))deny();return original(...args);};
 if(fsp[n]){const original=fsp[n];fsp[n]=(...args)=>{if(kind!=='pack'||!inside(args[0])||(['rename','copyFile','cp','link'].includes(n)&&!inside(args[1])))deny();return original(...args);};}
}
for(const [o,n]of[[fs,'openSync'],[fs,'open'],[fsp,'open']]){const original=o[n];o[n]=(p,f,...rest)=>{const write=writable(f);if(write&&(kind!=='pack'||!inside(p)))deny();if(!write)return original(p,f,...rest);if(n==='openSync'){const fd=original(p,f,...rest);ownedFDs.add(fd);return fd;}if(o===fsp)return original(p,f,...rest).then(handle=>{const fd=handle.fd;ownedFDs.add(fd);const close=handle.close.bind(handle);handle.close=(...args)=>{ownedFDs.delete(fd);return close(...args);};return handle;});const callback=rest.pop();return original(p,f,...rest,(error,fd)=>{if(!error)ownedFDs.add(fd);callback(error,fd);});};}
for(const n of ['close','closeSync']){const original=fs[n];fs[n]=(fd,...args)=>{ownedFDs.delete(fd);return original(fd,...args);};}
for(const n of ['write','writeSync','writev','writevSync']){const original=fs[n];fs[n]=(...args)=>ownedFDs.has(args[0])?original(...args):deny();}
const originalSpawn=cp.spawn;
cp.spawn=(command,args,options)=>{
 if(!isClient||command!==process.execPath||JSON.stringify(args)!==JSON.stringify([path.join(root,'src/audit-inputs-stdio.mjs')])||options.cwd!==root||options.shell!==false||++launches!==1)deny();
 const child=originalSpawn(command,['--import',guard,...args],options),pid=child.pid;
 process.stderr.write('OWNED_AUDIT_CHILD '+JSON.stringify({event:'start',pid})+'\\n');
 let calls=0,discoveries=0;const write=child.stdin.write.bind(child.stdin);
 child.stdin.write=(frame,...rest)=>{const message=JSON.parse(frame);if(message.method==='tools/call')calls++;if(['tools/list','server/discover'].includes(message.method))discoveries++;return write(frame,...rest);};
 child.once('exit',(code,signal)=>process.stderr.write('OWNED_AUDIT_CHILD '+JSON.stringify({event:'exit',pid,code,signal,calls,discoveries})+'\\n'));
 return child;
};
for(const n of ['spawnSync','exec','execSync','execFile','execFileSync','fork'])cp[n]=deny;
syncBuiltinESMExports();
for(const fn of [()=>fetch('https://invalid.invalid'),()=>fs.writeFileSync('/unallocated-audit-files-proof','x'),()=>cp.spawn('unallocated',[])])try{fn();throw new Error('DENIAL_NOT_ARMED');}catch(e){if(e.code!=='NATIVE_DENIAL_CONTROL')throw e;}
if(denied!==3)throw new Error('DENIAL_NOT_ARMED');controls=false;
process.stderr.write('AUDIT_FILES_NATIVE_GUARD '+JSON.stringify({denied:3,kind})+'\\n');
`;
}
async function packOnce() {
  const output = path.join(TMP, 'pack'), cache = path.join(TMP, 'cache'); fs.mkdirSync(output); fs.mkdirSync(cache);
  const guard = path.join(TMP, 'pack-guard.mjs'), user = path.join(TMP, 'user.conf'), global = path.join(TMP, 'global.conf');
  fs.writeFileSync(guard, guardSource('pack', ''), { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(user, '', { flag: 'wx', mode: 0o600 }); fs.writeFileSync(global, '', { flag: 'wx', mode: 0o600 });
  const args = ['pack', '--offline', '--ignore-scripts', '--update-notifier=false', '--audit=false', '--fund=false', '--json', '--cache', cache, '--pack-destination', output, '--userconfig', user, '--globalconfig', global];
  const started = performance.now(), child = cp.spawn('npm', args, { cwd: ROOT, shell: false, env: { PATH: process.env.PATH, CI: 'true', NODE_OPTIONS: '--import=' + pathToFileURL(guard).href }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', n = 0, failure;
  const terminal = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })); }); terminal.catch(() => {});
  for (const [stream, append] of [[child.stdout, text => { stdout += text; }], [child.stderr, text => { stderr += text; }]]) stream.on('data', bytes => {
    n += bytes.length; if (n > L.npmOutput) { failure ??= 'NPM_OUTPUT'; child.kill('SIGKILL'); return; } append(bytes.toString());
  });
  const timer = setTimeout(() => { failure ??= 'NPM_DEADLINE'; child.kill('SIGKILL'); }, L.packMs);
  try {
    const end = await bounded(terminal, L.packMs); assert.ok(performance.now() - started <= L.packMs);
    assert.equal(failure, undefined); assert.equal(end.code, 0); assert.equal(end.signal, null); assert.equal(absent(child.pid), true);
    assert.match(stderr, /AUDIT_FILES_NATIVE_GUARD/); assert.doesNotMatch(stderr, /DENIED_OPERATION|DENIAL_NOT_ARMED/);
    const rows = JSON.parse(stdout); assert.equal(rows.length, 1); assert.match(rows[0].filename, /^[A-Za-z0-9_.-]+\.tgz$/);
    const compressed = snapshot(path.join(output, rows[0].filename), L.compressed); assert.equal(compressed.length, rows[0].size); return { compressed, args };
  } finally { clearTimeout(timer); if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await bounded(terminal, L.close); } }
}
function marked(guide, label) {
  const begin = `<!-- AUDIT_FILES_${label}_BEGIN -->`, end = `<!-- AUDIT_FILES_${label}_END -->`;
  assert.equal(guide.split(begin).length, 2); assert.equal(guide.split(end).length, 2);
  const block = guide.split(begin)[1].split(end)[0].trim(); return block.slice(block.indexOf('\n') + 1, block.lastIndexOf('\n'));
}
before(async t => {
  expected = new Map(MEMBERS.map(name => [name, snapshot(path.join(ROOT, name.slice(8)))]));
  const artifact = await packOnce(), entries = decodeTar(artifact.compressed);
  const capture = { admission: 'RAW_CAPTURED_NOT_ADMITTED', compressed_bytes: artifact.compressed.length, compressed_sha256: sha(artifact.compressed), original_gzip_base64: artifact.compressed.toString('base64'), files: [...entries].map(([filename, row]) => ({ path: filename, mode: row.mode, bytes: row.bytes.length, sha256: sha(row.bytes) })) };
  assert.ok(Buffer.byteLength(JSON.stringify(capture)) <= L.rawRecord); t.diagnostic('CANLI_AUDIT_FILES_RAW ' + JSON.stringify(capture));
  const metadata = admit(entries), consumer = path.join(TMP, 'consumer'), root = path.join(consumer, 'node_modules', metadata.name);
  fs.mkdirSync(root, { recursive: true, mode: 0o700 }); let stored = 0;
  for (const [filename, row] of entries) { stored += row.bytes.length; assert.ok(stored <= L.fixture); const target = path.join(root, filename.slice(8)); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, row.bytes, { flag: 'wx', mode: row.mode }); fs.chmodSync(target, row.mode); }
  const locked = path.join(ROOT, 'node_modules'); const dependencyPins = [];
  for (const [name, version] of [['@modelcontextprotocol/client', '2.3.1'], ['@modelcontextprotocol/server', '2.3.1'], ['@modelcontextprotocol/core', '2.3.1'], ['zod', '4.6.5']]) { const bytes = snapshot(path.join(locked, name, 'package.json'), 65536); assert.equal(JSON.parse(bytes).version, version); dependencyPins.push({ name, version, sha256: sha(bytes) }); }
  fs.symlinkSync(locked, path.join(root, 'node_modules'), 'dir'); // Only disclosed cached dependencies; no repository source link/install.
  const bin = path.join(consumer, 'node_modules', '.bin'); fs.mkdirSync(bin);
  for (const [name, local] of Object.entries(BIN)) { fs.symlinkSync('../' + metadata.name + '/' + local, path.join(bin, name)); if (local === 'src/server.mjs') fs.chmodSync(path.join(root, local), 0o755); }
  const guard = path.join(consumer, 'guard.mjs'); fs.writeFileSync(guard, guardSource('client', root), { flag: 'wx', mode: 0o600 });
  const guide = entries.get('package/AUDIT_INPUTS_CLIENT.md').bytes.toString();
  const fixture = Object.fromEntries(['REFERENCE', 'USAGE', 'SETTINGS'].map(label => [label.toLowerCase(), Buffer.from(marked(guide, label))]));
  for (const bytes of Object.values(fixture)) JSON.parse(bytes);
  packed = { ...artifact, entries, metadata, capture, root, consumer, guard, guide, fixture, dependencyPins, entry: path.join(root, 'src/audit-inputs-client.mjs'), alias: path.join(bin, 'canli-fundamentals-audit-files') };
  fixtureCensus();
  t.diagnostic('CANLI_AUDIT_FILES_ADMITTED ' + JSON.stringify({ admission: 'ADMITTED', compressed_sha256: capture.compressed_sha256, members: capture.files, dependencyPins, source_links: false, fixture_only_default_chmod: true, production_install_established: null }));
});
function fixtureCensus() {
  let bytes = 0, count = 0;
  const visit = (directory, depth) => {
    assert.ok(depth <= 16);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      assert.ok(++count <= 512, 'FIXTURE_COUNT'); const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(filename, depth + 1);
      else if (entry.isSymbolicLink()) { const target = fs.readlinkSync(filename); bytes += Buffer.byteLength(target); assert.ok(owned(path.resolve(directory, target)) || filename === path.join(packed.root, 'node_modules'), 'FIXTURE_LINK'); }
      else { assert.equal(entry.isFile(), true, 'FIXTURE_REGULAR'); bytes += snapshot(filename, L.fixture).length; }
      assert.ok(bytes <= L.fixture, 'FIXTURE_BYTES');
    }
  };
  visit(TMP, 0); return { bytes, count };
}
after(() => {
  try {
    if (packed) { fixtureCensus(); assert.equal(denials, 3); }
    assert.equal(packEntries, 1); assert.ok(commandEntries <= 3);
  } finally {
    for (const [object, key, prior] of saved.reverse()) object[key] = prior;
    globalThis.fetch = oldFetch; syncBuiltinESMExports();
    originalRm(TMP, { recursive: true, force: true });
  }
});

const clone = value => JSON.parse(JSON.stringify(value));
const inputs = () => Object.fromEntries(Object.entries(packed.fixture).map(([key, bytes]) => [key, Buffer.from(bytes)]));
function requestFor(f) { return { reference_base64: f.reference.toString('base64'), expected_reference_sha256: sha(f.reference), usage_base64: f.usage.toString('base64'), settings_base64: f.settings.toString('base64'), detail: 'compact' }; }
function injected({ connect, call, close } = {}) {
  const effects = { connects: 0, calls: 0, closes: 0, requests: [] };
  const operations = {
    connect(options) { effects.connects++; return connect?.(options); },
    callTool(request, options) { effects.calls++; effects.requests.push(request); assert.deepEqual(options.toolDefinition, AUDIT_TOOL); return call ? call(request, options) : executeAuditInputs(request.arguments); },
    close() { effects.closes++; return close ? close() : { owned_pid: null, owned_child_absent: true, evidence: 'injected_no_child' }; },
  };
  return { effects, operations };
}
function run(f = inputs(), options = {}, control = injected()) { return runAuditInputsClient(f.reference, sha(f.reference), f.usage, f.settings, { ...options, operations: control.operations }); }
function refused(result, code) { assert.equal(result.report.status, 'refused'); assert.equal(result.report.error.code, code); assert.equal(result.report.artifact, undefined); assert.ok(Buffer.byteLength(result.encoded) <= 2048); assert.doesNotMatch(result.encoded, /PRIVATE_RAW_|\/owned\/|stack|SYNTHETIC_EXCEPTION/); }
function rehash(reply, change) { const out = clone(reply); change(out.structuredContent); out.structuredContent.content_hash = contentHash(out.structuredContent, createHash); out.content[0].text = JSON.stringify(out.structuredContent); return out; }
function fileAdapter(f = inputs(), { sizes, fault } = {}) {
  const paths = { root: ROOT, expected_reference_sha256: sha(f.reference), reference: '/owned/reference', usage: '/owned/usage', settings: '/owned/settings' };
  const effects = { opens: 0, reads: 0, stats: 0, closes: [], postReads: 0 }, keys = ['reference', 'usage', 'settings'];
  const counts = new Map();
  const adapter = {
    constants: fs.constants,
    realpathSync: () => ROOT,
    openSync(filename, flags) { assert.equal(flags, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | fs.constants.O_NOFOLLOW); effects.opens++; return keys.indexOf(filename.slice('/owned/'.length)) + 10; },
    fstatSync(fd) {
      effects.stats++; counts.set(fd, (counts.get(fd) ?? 0) + 1); const key = keys[fd - 10];
      const stat = { dev: 1n, ino: BigInt(fd), mode: 0o100600n, size: BigInt(sizes?.[key] ?? f[key].length), mtimeNs: 1n, ctimeNs: 1n, isFile: () => true };
      return fault?.('stat', { fd, key, count: counts.get(fd), stat, effects }) ?? stat;
    },
    readSync(fd, bytes, offset, length, position) {
      effects.reads++; const key = keys[fd - 10];
      const altered = fault?.('read', { fd, key, bytes, offset, length, position, effects }); if (altered !== undefined) return altered;
      const count = Math.min(length, Math.max(0, f[key].length - position)); f[key].copy(bytes, offset, position, position + count); return count;
    },
    closeSync(fd) { effects.closes.push(fd); return fault?.('close', { fd, effects }); },
  };
  return { paths, effects, fs: adapter };
}
function flags(paths) { return ['--root', paths.root, '--reference', paths.reference, '--expected-reference-sha256', paths.expected_reference_sha256, '--usage', paths.usage, '--settings', paths.settings]; }
function nativeSdk({ beforeSend = () => {}, serialize = message => message, backpressure = false, writeThrow = false, startReject, admissionThrow = false, taskReject, pid = 12345678 } = {}) {
  const effects = { starts: 0, writes: 0, clientCloses: 0, transportCloses: 0, calls: 0, serializations: 0, drains: 0 }, frames = [];
  let transport, child, originalPending, returnedOriginal = false;
  class StdioClientTransport {
    constructor(parameters) { assert.deepEqual(parameters.args, [path.join(ROOT, 'src/audit-inputs-stdio.mjs')]); assert.equal(parameters.cwd, ROOT); assert.equal(parameters.maxBufferSize, 524288); this.stderr = { on() {} }; transport = this; }
    start() {
      effects.starts++; child = new EventEmitter(); child.pid = pid; child.stdin = new EventEmitter();
      child.stdin.write = frame => { effects.writes++; frames.push(frame); if (writeThrow) throw new Error('SYNTHETIC_EXCEPTION'); if (backpressure) { queueMicrotask(() => { assert.equal(child.stdin.listenerCount('drain'), 1); effects.drains++; child.stdin.emit('drain'); }); return false; } return true; };
      if (admissionThrow) Object.defineProperty(this, '_process', { configurable: true, get() { throw new Error('SYNTHETIC_EXCEPTION'); } }); else this._process = child;
      originalPending = startReject === 'immediate' ? Promise.reject(new Error('SYNTHETIC_EXCEPTION')) : startReject === 'delayed' ? new Promise((_, reject) => setTimeout(() => reject(new Error('SYNTHETIC_EXCEPTION')), 5)) : Promise.resolve();
      return originalPending;
    }
    send() { assert.fail('SAME owned adapter must replace the SDK serializer/send boundary'); }
    close() { effects.transportCloses++; child?.emit('close'); Object.defineProperty(this, '_process', { configurable: true, writable: true, value: undefined }); return Promise.resolve(); }
  }
  class Client {
    constructor(identity, options) { assert.deepEqual(options.versionNegotiation, { mode: 'legacy' }); assert.equal(options.inputRequired.autoFulfill, false); }
    async connect(t) { this.transport = t; const pending = t.start(); returnedOriginal = pending === originalPending; await pending; if (taskReject) await taskReject(); }
    async callTool(request, options) {
      effects.calls++; assert.deepEqual(options.toolDefinition, AUDIT_TOOL); await beforeSend();
      const message = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: request };
      await this.transport.send({ toJSON() { effects.serializations++; return serialize(message, transport, child); } });
      const result = clone(executeAuditInputs(request.arguments)); delete result.resultType; return result;
    }
    close() { effects.clientCloses++; return this.transport.close(); }
  }
  return { effects, frames, returnedOriginal: () => returnedOriginal, sdkModules: { Client, StdioClientTransport } };
}
async function runSdk(control, options = {}) { const f = inputs(); return runAuditInputsClient(f.reference, sha(f.reference), f.usage, f.settings, { root: ROOT, sdkModules: control.sdkModules, ...options }); }
class Terminal extends EventEmitter {
  constructor(behavior) { super(); this.frames = []; this.behavior = behavior; }
  write(frame, callback) { this.frames.push(frame); if (this.behavior) return this.behavior(frame, callback, this); callback(); return true; }
}
async function command(control = injected(), changes = {}) {
  const file = fileAdapter(), output = changes.stdout ?? new Terminal();
  const result = await auditClientCommand(flags(file.paths), { fs: file.fs, operations: control.operations, stdout: output, interrupts: new EventEmitter(), now: () => 0, ...changes });
  return { result, output, file, control };
}
async function actualCommand(kind, t) {
  const directory = fs.mkdtempSync(path.join(packed.consumer, 'entry-')), f = inputs(), paths = { root: packed.root, expected_reference_sha256: sha(f.reference) };
  if (kind === 'refusal') { f.reference = raw({ schema: 'invalid_synthetic_schema', companyfacts: [] }); paths.expected_reference_sha256 = sha(f.reference); }
  for (const key of ['reference', 'usage', 'settings']) { paths[key] = path.join(directory, key + '.json'); fs.writeFileSync(paths[key], f[key], { mode: 0o600, flag: 'wx' }); }
  const template = marked(packed.guide, 'COMMAND');
  assert.equal(template, 'canli-fundamentals-audit-files --root "$PACKAGE_ROOT" --reference "$REFERENCE" --expected-reference-sha256 "$REFERENCE_SHA256" --usage "$USAGE" --settings "$SETTINGS"');
  const entry = kind === 'alias' ? packed.alias : packed.entry, beforeEntries = commandEntries, started = performance.now();
  // ONE lexical new native command launch; exactly the THREE named tests below.
  const child = cp.spawn(entry, flags(paths), { cwd: directory, shell: false, env: { PATH: process.env.PATH, NODE_OPTIONS: '--import=' + pathToFileURL(packed.guard).href }, stdio: ['ignore', 'pipe', 'pipe'] });
  const ended = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })); }); ended.catch(() => {});
  let stdout = '', stderr = '', outputBytes = 0, errorBytes = 0, failure;
  child.stdout.on('data', bytes => { outputBytes += bytes.length; if (outputBytes > 524288) { failure ??= 'STDOUT_BOUND'; child.kill('SIGKILL'); return; } stdout += bytes.toString(); });
  child.stderr.on('data', bytes => { errorBytes += bytes.length; if (errorBytes > 65536) { failure ??= 'STDERR_BOUND'; child.kill('SIGKILL'); return; } stderr += bytes.toString(); });
  const timer = setTimeout(() => { failure ??= 'ENTRY_DEADLINE'; child.kill('SIGKILL'); }, L.total);
  try {
    const terminal = await bounded(ended, L.total); assert.ok(performance.now() - started <= L.total); assert.equal(commandEntries, beforeEntries + 1); assert.equal(failure, undefined); assert.equal(terminal.signal, null); assert.equal(absent(child.pid), true);
    assert.equal(stdout.split('\n').length, 2); const report = JSON.parse(stdout); assert.equal(terminal.code, kind === 'refusal' ? 1 : 0); assert.equal(report.status, kind === 'refusal' ? 'refused' : 'ok');
    assert.doesNotMatch(stdout + stderr, /DENIED_OPERATION|SYNTHETIC_EXCEPTION|PRIVATE_RAW_|DENIAL_NOT_ARMED/);
    const events = stderr.split('\n').filter(line => line.startsWith('OWNED_AUDIT_CHILD ')).map(line => JSON.parse(line.slice('OWNED_AUDIT_CHILD '.length)));
    assert.equal(events.length, 2); assert.equal(events[0].event, 'start'); assert.equal(events[1].event, 'exit'); assert.equal(events[0].pid, events[1].pid); assert.equal(events[1].calls, 1); assert.equal(events[1].discoveries, 0);
    assert.equal(report.lifecycle.owned_pid, events[0].pid); assert.equal(absent(events[0].pid), true); assert.equal(report.lifecycle.owned_child_absent, true); assert.equal(report.lifecycle.close_attempts, 1); assert.equal(report.lifecycle.connect_attempts, 1); assert.equal(report.lifecycle.audit_calls, 1);
    for (const [field, cap] of [['work_ms', 15000], ['closure_before_encoding_ms', 5000], ['total_before_encoding_ms', 20000]]) assert.ok(Number.isFinite(report.lifecycle[field]) && report.lifecycle[field] >= 0 && report.lifecycle[field] <= cap);
    if (kind === 'refusal') { assert.equal(report.error.code, 'TOOL_REFUSED'); assert.equal(report.artifact, undefined); assert.ok(outputBytes <= 2048); }
    else { assert.deepEqual(report.artifact, clone(executeAuditInputs(requestFor(f)).structuredContent)); assert.equal(report.verified.complete_core_report, false); assert.equal(report.verified.source_execution_authenticated, false); }
    assert.equal(fs.existsSync(path.join(directory, '.git')), false); assert.deepEqual(fs.readdirSync(directory).sort(), ['reference.json', 'settings.json', 'usage.json']);
    t.diagnostic('CANLI_AUDIT_FILES_ENTRY ' + JSON.stringify({ entry: commandEntries, kind, command_pid: child.pid, command_absent: true, owned_server_pid: events[0].pid, owned_server_absent: true, calls: events[1].calls, discoveries: 0, exit_code: terminal.code, work: report.lifecycle.work_ms, close: report.lifecycle.closure_before_encoding_ms, total: report.lifecycle.total_before_encoding_ms }));
    return report;
  } finally { clearTimeout(timer); if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await bounded(ended, L.close); } }
}

test('audit files package: complete ownership-hunk and relocation inverse restores the entire protected client', () => {
  let source = packed.entries.get('package/src/audit-inputs-client.mjs').bytes.toString();
  assert.equal(sha(Buffer.from(source)), SOURCE_PINS['src/audit-inputs-client.mjs']);
  for (const { old, new: replacement } of [...OWNERSHIP_HUNKS].reverse()) { assert.equal(source.split(replacement).length, 2); source = source.replace(replacement, old); }
  assert.equal(sha(Buffer.from(source)), '5c2fdae15f1e164c07bd52a97ae0c99f913191d02d4f4e47a332d5ba95662ea5');
  for (const { old, new: replacement } of [...RECIPE].reverse()) { assert.equal(source.split(replacement).length, 2); source = source.replace(replacement, old); }
  assert.ok(source.startsWith('#!/usr/bin/env node\n')); source = source.slice('#!/usr/bin/env node\n'.length);
  assert.deepEqual(Buffer.from(source), snapshot(path.join(ROOT, 'examples/audit-inputs-client.mjs')));
  assert.equal(sha(Buffer.from(source)), '60f20a7297bbb463139a829bc4d14e35f108d650faa4488faa91525a2d9e4195');
});
test('audit files package: runtime classification changes only root metadata and eleven dev flags with all integrity edges intact', () => {
  const candidate = JSON.parse(snapshot(path.join(ROOT, 'package.json'))), inverse = clone(candidate);
  delete inverse.bin['canli-expert-intake-prepare']; inverse.files = inverse.files.filter(name => name !== 'EXPERT_INTAKE_STDIO.md');
  delete inverse.bin['canli-expert-intake-files']; inverse.files = inverse.files.filter(name => name !== 'EXPERT_INTAKE_FILES.md');
  delete inverse.bin['canli-expert-submission-client']; inverse.files = inverse.files.filter(name => name !== 'EXPERT_SUBMISSION_CLIENT.md');
  delete inverse.bin['canli-expert-submission-files']; inverse.files = inverse.files.filter(name => name !== 'EXPERT_SUBMISSION_FILES.md');
  delete inverse.bin['canli-fundamentals-audit-files']; inverse.files.pop(); delete inverse.dependencies['@modelcontextprotocol/client']; inverse.devDependencies = { '@modelcontextprotocol/client': '2.3.1' };
  assert.deepEqual(inverse, ORIGINAL_PACKAGE);
  const lock = JSON.parse(snapshot(path.join(ROOT, 'package-lock.json'))); assert.equal(Object.keys(lock.packages).length, 15);
  const old = clone(lock); old.packages[''].bin = ORIGINAL_LOCK.packages[''].bin; old.packages[''].dependencies = ORIGINAL_LOCK.packages[''].dependencies; old.packages[''].devDependencies = ORIGINAL_LOCK.packages[''].devDependencies;
  for (const name of DEV_FLAGS) { assert.equal(Object.hasOwn(lock.packages[name], 'dev'), false); old.packages[name].dev = true; }
  assert.deepEqual(old, ORIGINAL_LOCK); assert.equal(DEV_FLAGS.length, 11);
});
// The root package.json belongs to the whole repository. This package needs only its own root
// scripts, each present once; hashing the rest of the file failed every unrelated script or
// dependency change in CI.
test('audit files package: the root scripts for these package commands are present once and the bounded README retains its whole old prefix', () => {
  const root = snapshot(path.join(ROOT, '../package.json')).toString();
  assert.equal(typeof JSON.parse(root).scripts.verify, 'string');
  for (const line of [...FOCUSED_LINES, "    \"test:expert-intake-stdio-package\": \"node --test --test-concurrency=1 mcp-fundamentals/test/expert-intake-stdio-package.test.mjs\",\n", "    \"filingfacts:expert-intake-prepare\": \"node mcp-fundamentals/src/expert-intake-stdio.mjs\",\n", "    \"test:expert-intake-files-package\": \"node --test --test-concurrency=1 mcp-fundamentals/test/expert-intake-files-package.test.mjs\",\n", "    \"filingfacts:expert-intake-files\": \"node mcp-fundamentals/src/expert-intake-files.mjs\",\n", "    \"test:expert-submission-client-package\": \"node --test --test-concurrency=1 mcp-fundamentals/test/expert-submission-client-package.test.mjs\",\n", "    \"filingfacts:expert-submission-client\": \"node mcp-fundamentals/src/expert-submission-client.mjs\",\n"]) assert.equal(root.split(line).length, 2, line);
  // Remove ONLY the assigned current whole-prefix append for this historical subset.
  const readme = packed.entries.get('package/README.md').bytes.subarray(0, 15960); assert.ok(readme.length - 14412 <= 2048); assert.equal(sha(readme.subarray(0, 14412)), ORIGINAL_README_SHA);
});
test('audit files package: actual raw and admitted captures bind exact sixteen bodies modes four bins and the same gzip', () => {
  assert.equal(MEMBERS.length, 24); assert.deepEqual(admit(cloneEntries()), packed.metadata); assert.equal(packed.capture.admission, 'RAW_CAPTURED_NOT_ADMITTED'); assert.equal(packed.capture.compressed_sha256, sha(packed.compressed));
  assert.equal(packed.entries.get('package/src/server.mjs').mode, 0o644); assert.equal(packed.entries.get('package/src/audit-inputs-client.mjs').mode, 0o755); assert.equal(packed.entries.get('package/AUDIT_INPUTS_CLIENT.md').mode, 0o644);
  assert.deepEqual(Object.keys(BIN), ['canli-fundamentals-mcp', 'canli-fundamentals-audit', 'canli-expert-submission-audit', 'canli-fundamentals-audit-files', 'canli-expert-submission-files', 'canli-expert-submission-client', 'canli-expert-intake-files', 'canli-expert-intake-prepare']);
  for (const [name, row] of packed.entries) assert.deepEqual(row.bytes, snapshot(path.join(ROOT, name.slice(8))));
});
test('audit files package: every JS and MJS static dependency and fixed client dynamic import remains closed', () => {
  imports(cloneEntries());
  for (const suffix of ['js', 'mjs']) for (const target of ['./absent.mjs', '../../private.mjs']) { const rows = cloneEntries(); rows.set('package/src/fixture.' + suffix, { mode: 0o644, bytes: Buffer.from(`import x from '${target}';\n`) }); assert.throws(() => imports(rows), /LOCAL_IMPORT/); }
  for (const source of ["const x = import(privateName);\n", "const x = import('@unallocated/sdk');\n"]) { const rows = cloneEntries(); rows.set('package/src/fault.mjs', { mode: 0o644, bytes: Buffer.from(source) }); assert.throws(() => imports(rows), /DYNAMIC/); }
  const changed = cloneEntries(); changed.get('package/src/audit-inputs-client.mjs').bytes = Buffer.from("const x = import('@modelcontextprotocol/client');\n"); assert.throws(() => imports(changed), /CLIENT_SOURCE/);
});
test('audit files package: exported constant from-text is admitted while real reexports are refused', () => {
  const positive = cloneEntries(); positive.set('package/src/constant.js', { mode: 0o644, bytes: Buffer.from("export const notice = 'from elsewhere';\n") }); imports(positive);
  for (const source of ["export * from './absent.mjs';\n", "export { x } from './absent.mjs';\n", "export * as x from './absent.mjs';\n"]) { const rows = cloneEntries(); rows.set('package/src/reexport.js', { mode: 0o644, bytes: Buffer.from(source) }); assert.throws(() => imports(rows), /REEXPORT/); }
});
test('audit files package: CRC ISIZE concatenation and trailing bytes refuse before extraction', () => {
  assert.equal(decodeTar(packed.compressed).size, 24);
  for (const offset of [8, 4]) { const broken = Buffer.from(packed.compressed); broken[broken.length - offset] ^= 1; assert.throws(() => decodeTar(broken), offset === 8 ? /GZIP_CRC/ : /GZIP_ISIZE/); }
  assert.throws(() => decodeTar(Buffer.concat([packed.compressed, Buffer.from('x')])), /GZIP_SINGLE/);
  assert.throws(() => decodeTar(Buffer.concat([packed.compressed, gzipSync(Buffer.alloc(0))])), /GZIP_SINGLE/);
});
test('audit files package: compressed expanded and parser-count bounds refuse before writes', () => {
  const before = fs.readdirSync(packed.consumer).sort();
  assert.throws(() => decodeTar(Buffer.alloc(L.compressed + 1)), /GZIP_BOUND/); assert.throws(() => decodeTar(gzipSync(Buffer.alloc(L.expanded + 512))));
  const rows = Array.from({ length: 33 }, (_, i) => ({ name: 'package/item-' + i, bytes: Buffer.alloc(0) })); assert.throws(() => decodeTar(tinyTar(rows)), /TAR_COUNT/);
  assert.deepEqual(fs.readdirSync(packed.consumer).sort(), before);
});
test('audit files package: checksum-valid high-bit path prefix mode size type and checksum refuse raw ASCII', () => {
  const positive = tinyTar([{ name: 'package/a', bytes: Buffer.from('x') }]); assert.equal(decodeTar(positive).size, 1);
  for (const offset of [0, 345, 100, 124, 156]) assert.throws(() => decodeTar(tinyTar([{ name: 'package/a', bytes: Buffer.from('x') }], header => { header[offset] |= 128; })), /TAR_ASCII/);
  const tar = inflateRawSync(positive.subarray(10)); tar[148] |= 128; assert.throws(() => decodeTar(gzipSync(tar)), /TAR_ASCII/);
});
test('audit files package: octal and checksum faults hit their intended admission predicates', () => {
  assert.throws(() => decodeTar(tinyTar([{ name: 'package/a', bytes: Buffer.from('x') }], header => { header[124] = 57; })), /TAR_OCTAL/);
  const tar = inflateRawSync(tinyTar([{ name: 'package/a', bytes: Buffer.from('x') }]).subarray(10)); tar[148] ^= 1; assert.throws(() => decodeTar(gzipSync(tar)), /TAR_CHECKSUM/);
});
test('audit files package: traversal link nonregular and duplicate headers refuse before fixture writes', () => {
  const before = fs.readdirSync(packed.consumer).sort();
  assert.throws(() => decodeTar(tinyTar([{ name: 'package/../secret', bytes: Buffer.alloc(0) }])), /TAR_PATH/);
  assert.throws(() => decodeTar(tinyTar([{ name: 'package/a', bytes: Buffer.alloc(0) }], header => { header.write('elsewhere', 157); })), /TAR_LINK/);
  assert.throws(() => decodeTar(tinyTar([{ name: 'package/a', bytes: Buffer.alloc(0) }], header => { header[156] = 50; })), /TAR_REGULAR/);
  assert.throws(() => decodeTar(tinyTar([{ name: 'package/a', bytes: Buffer.alloc(0) }, { name: 'package/a', bytes: Buffer.alloc(0) }])), /TAR_DUPLICATE/);
  assert.deepEqual(fs.readdirSync(packed.consumer).sort(), before);
});
test('audit files package: missing changed wrong-mode members and altered bins refuse full admission', () => {
  const missing = cloneEntries(); missing.delete('package/src/canonical-json.mjs'); assert.throws(() => admit(missing), /MEMBERS/);
  const changed = cloneEntries(); changed.get('package/src/audit-inputs-core.mjs').bytes[400] ^= 1; assert.throws(() => admit(changed), /SOURCE/);
  const mode = cloneEntries(); mode.get('package/src/audit-inputs-client.mjs').mode = 0o644; assert.throws(() => admit(mode), /MODE/);
  const bin = cloneEntries(), metadata = JSON.parse(bin.get('package/package.json').bytes); metadata.bin['canli-fundamentals-audit-files'] = '../private.mjs'; bin.get('package/package.json').bytes = raw(metadata); assert.throws(() => admit(bin), /BIN/);
});
test('audit files package: all three descriptors and individual caps are admitted before any body read', () => {
  const good = fileAdapter(), bytes = captureAuditInputFiles(good.paths, { fs: good.fs }); assert.deepEqual(bytes, inputs()); assert.equal(good.effects.opens, 3); assert.ok(good.effects.reads >= 6); assert.equal(good.effects.closes.length, 3);
  for (const [key, limit] of [['reference', 524288], ['usage', 65536], ['settings', 4096]]) { const bad = fileAdapter(inputs(), { sizes: { [key]: limit + 1 } }); assert.throws(() => captureAuditInputFiles(bad.paths, { fs: bad.fs }), error => error.code === 'INPUT_BOUND'); assert.equal(bad.effects.reads, 0); assert.equal(bad.effects.closes.length, bad.effects.opens); }
  const kind = fileAdapter(inputs(), { fault: (stage, ctx) => stage === 'stat' && ctx.key === 'settings' ? { ...ctx.stat, isFile: () => false } : undefined }); assert.throws(() => captureAuditInputFiles(kind.paths, { fs: kind.fs }), error => error.code === 'INPUT_TYPE'); assert.equal(kind.effects.reads, 0);
});
test('audit files package: aggregate short overflow and same-FD mutation controls retain refusal and close all admitted inputs', () => {
  const aggregate = fileAdapter(inputs(), { sizes: { reference: 524288, usage: 65536, settings: 4096 } }); assert.throws(() => captureAuditInputFiles(aggregate.paths, { fs: aggregate.fs }), error => error.code === 'INPUT_AGGREGATE'); assert.equal(aggregate.effects.opens, 3); assert.equal(aggregate.effects.reads, 0);
  for (const code of ['INPUT_SHORT', 'INPUT_OVERFLOW', 'INPUT_CHANGED']) {
    let fired = 0; const f = inputs(), adapter = fileAdapter(f, { fault(stage, ctx) {
      if (code === 'INPUT_SHORT' && stage === 'read') { fired++; return 0; }
      if (code === 'INPUT_OVERFLOW' && stage === 'read' && ctx.position === f[ctx.key].length) { fired++; return 1; }
      if (code === 'INPUT_CHANGED' && stage === 'stat' && ctx.count === 2) { fired++; return { ...ctx.stat, mtimeNs: 2n }; }
    } });
    assert.throws(() => captureAuditInputFiles(adapter.paths, { fs: adapter.fs }), error => error.code === code); assert.equal(fired, 1); assert.equal(adapter.effects.closes.length, 3);
  }
});
test('audit files package: close-after-close numeric reuse never retries the foreign descriptor', () => {
  let foreignOpen = false; const adapter = fileAdapter(inputs(), { fault(stage, ctx) { if (stage === 'close' && ctx.fd === 11) { assert.equal(foreignOpen, false); foreignOpen = true; throw new Error('SYNTHETIC_EXCEPTION'); } } });
  assert.throws(() => captureAuditInputFiles(adapter.paths, { fs: adapter.fs }), error => error.code === 'INPUT_CLOSE'); assert.equal(foreignOpen, true); assert.deepEqual(adapter.effects.closes, [12, 11, 10]);
});
test('audit files package: one compact request binds original base64 second options full N six statuses and unknowns', async () => {
  const f = inputs(), control = injected(), result = await run(f, {}, control); assert.equal(result.report.status, 'ok'); assert.deepEqual(control.effects.requests, [{ name: 'audit_inputs', arguments: requestFor(f) }]);
  assert.equal(control.effects.connects, 1); assert.equal(control.effects.calls, 1); assert.equal(control.effects.closes, 1);
  assert.equal(result.report.artifact.audit.rows.length, 6); assert.deepEqual(result.report.artifact.audit.rows.map(row => row.status), ['match', 'mismatch', 'missing', 'ambiguous', 'unsupported', 'timing_indeterminate']);
  assert.equal(result.report.artifact.projection.retained_selected_n, 6); assert.equal(result.report.verified.complete_core_report, false); assert.equal(result.report.verified.source_execution_authenticated, false);
  assert.equal(result.report.artifact.audit.implementation.declared_module_sha256_verified, false); assert.equal(result.report.artifact.audit.established.source_rights, null);
});
test('audit files package: rehashed selected identity order and denominator tampering never upgrades the compact artifact', async () => {
  for (const change of [d => { d.audit.rows[0].usage.value++; }, d => { [d.audit.rows[0], d.audit.rows[1]] = [d.audit.rows[1], d.audit.rows[0]]; }, d => { d.audit.coverage.selected_n--; }]) { const control = injected({ call: request => rehash(executeAuditInputs(request.arguments), change) }); refused(await run(inputs(), {}, control), 'RESPONSE_ROWS'); assert.equal(control.effects.calls, 1); }
});
test('audit files package: rehashed byte bindings rights and source-verification promotions are refused', async () => {
  for (const key of ['reference', 'usage', 'settings']) { const control = injected({ call: request => rehash(executeAuditInputs(request.arguments), d => { d.audit.bindings[key].sha256 = 'a'.repeat(64); }) }); refused(await run(inputs(), {}, control), 'RESPONSE_BINDING'); }
  for (const change of [d => { d.audit.established.source_rights = true; }, d => { d.audit.implementation.declared_module_sha256_verified = true; }, d => { d.audit.rows[5].verdict = true; }]) { const control = injected({ call: request => rehash(executeAuditInputs(request.arguments), change) }); refused(await run(inputs(), {}, control), 'RESPONSE_UNKNOWNS'); }
});
test('audit files package: response graphs with accessors proxies or unbound text refuse without getter effects', async () => {
  let effects = 0;
  for (const make of [() => Object.defineProperty({}, 'content', { enumerable: true, get() { effects++; throw new Error('SYNTHETIC_EXCEPTION'); } }), () => new Proxy({}, { ownKeys() { effects++; throw new Error('SYNTHETIC_EXCEPTION'); } })]) refused(await run(inputs(), {}, injected({ call: make })), 'RESPONSE_SHAPE');
  assert.equal(effects, 0); refused(await run(inputs(), {}, injected({ call: request => { const r = clone(executeAuditInputs(request.arguments)); r.content[0].text = '{}'; return r; } })), 'RESPONSE_TEXT');
});
test('audit files package: SAME native adapter handles original startup Promise one wire write and memoized child close', async () => {
  const control = nativeSdk(), result = await runSdk(control); assert.equal(result.report.status, 'ok'); assert.equal(control.returnedOriginal(), true); assert.deepEqual(control.effects, { starts: 1, writes: 1, clientCloses: 1, transportCloses: 1, calls: 1, serializations: 1, drains: 0 });
  assert.deepEqual(control.frames, [JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'audit_inputs', arguments: requestFor(inputs()) } }) + '\n']);
});
test('audit files package: serialization crossing the original absolute work deadline performs zero native writes', async () => {
  let time = 0; const control = nativeSdk({ beforeSend: () => { time = 14999.5; }, serialize: message => { time++; return message; } }); refused(await runSdk(control, { now: () => time }), 'WORK_DEADLINE'); assert.equal(control.effects.serializations, 1); assert.equal(control.effects.writes, 0); assert.equal(control.effects.transportCloses, 1);
});
test('audit files package: serialization-triggered sticky abort close and known exit prevent any native write', async () => {
  for (const kind of ['abort', 'close', 'exit']) { const abort = new AbortController(), control = nativeSdk({ serialize(message, transport, child) { if (kind === 'abort') abort.abort(); else if (kind === 'close') transport.close(); else child.emit('exit'); return message; } }); refused(await runSdk(control, { signal: abort.signal }), 'ABORTED'); assert.equal(control.effects.writes, 0); assert.equal(control.effects.serializations, 1); assert.equal(control.effects.transportCloses, 1); }
});
test('audit files package: exact native frame capacity admits once while encoded plus-one refuses before write', async () => {
  for (const overflow of [0, 1]) { const control = nativeSdk({ serialize: () => ({ padding: 'x'.repeat(1048576 - 15 + overflow) }) }); const result = await runSdk(control); if (overflow) { refused(result, 'INPUT_BOUND'); assert.equal(control.effects.writes, 0); } else { assert.equal(result.report.status, 'ok'); assert.equal(Buffer.byteLength(control.frames[0]), 1048576); assert.equal(control.effects.writes, 1); } }
});
test('audit files package: native stdin backpressure waits one drain and a throwing writer is never retried', async () => {
  const good = nativeSdk({ backpressure: true }); assert.equal((await runSdk(good)).report.status, 'ok'); assert.equal(good.effects.writes, 1); assert.equal(good.effects.drains, 1);
  const bad = nativeSdk({ writeThrow: true }); refused(await runSdk(bad), 'CALL'); assert.equal(bad.effects.writes, 1); assert.equal(bad.effects.transportCloses, 1);
});
test('audit files package: immediate and delayed original startup rejections are consumed with zero audit writes', { timeout: 1000 }, async () => {
  const unhandled = []; const observe = error => unhandled.push(error); process.on('unhandledRejection', observe);
  try { for (const startReject of ['immediate', 'delayed']) { const control = nativeSdk({ startReject }); refused(await runSdk(control), 'CONNECT'); assert.equal(control.returnedOriginal(), true); assert.equal(control.effects.writes, 0); assert.equal(control.effects.calls, 0); assert.equal(control.effects.transportCloses, 1); } await new Promise(resolve => setTimeout(resolve, 15)); assert.deepEqual(unhandled, []); }
  finally { process.removeListener('unhandledRejection', observe); }
});
test('audit files package: rejection observation precedes fallible child admission and never loses the original outcome', { timeout: 1000 }, async () => {
  const unhandled = []; const observe = error => unhandled.push(error); process.on('unhandledRejection', observe);
  try { const control = nativeSdk({ admissionThrow: true, startReject: 'delayed' }); const result = await runSdk(control); refused(result, 'CONNECT'); assert.equal(control.effects.starts, 1); assert.equal(control.effects.writes, 0); assert.equal(control.effects.transportCloses, 1); assert.equal(result.report.lifecycle.owned_child_absent, null); await new Promise(resolve => setTimeout(resolve, 15)); assert.deepEqual(unhandled, []); }
  finally { process.removeListener('unhandledRejection', observe); }
});
test('audit files package: delayed SDK task rejection after sticky abort remains handled with no retry', { timeout: 1000 }, async () => {
  const abort = new AbortController(), unhandled = [], observe = error => unhandled.push(error); process.on('unhandledRejection', observe);
  const control = nativeSdk({ taskReject: () => new Promise((_, reject) => { setTimeout(() => abort.abort(), 1); setTimeout(() => reject(new Error('SYNTHETIC_EXCEPTION')), 10); }) });
  try { refused(await runSdk(control, { signal: abort.signal }), 'ABORTED'); await new Promise(resolve => setTimeout(resolve, 20)); assert.deepEqual(unhandled, []); assert.equal(control.effects.starts, 1); assert.equal(control.effects.calls, 0); assert.equal(control.effects.transportCloses, 1); }
  finally { process.removeListener('unhandledRejection', observe); }
});
test('audit files package: uncertain child PID or close acknowledgement cannot establish success', async () => {
  const native = nativeSdk({ pid: null }); const result = await runSdk(native); refused(result, 'CHILD_UNCERTAIN'); assert.equal(result.report.lifecycle.owned_child_absent, null); assert.equal(native.effects.transportCloses, 1);
  const control = injected({ close: () => ({ owned_pid: null, owned_child_absent: null, evidence: 'unknown' }) }); refused(await run(inputs(), {}, control), 'CHILD_UNCERTAIN'); assert.equal(control.effects.closes, 1);
});
test('audit files package: CLI parsing and package-root capture consume the same pre-input work clock', async () => {
  let time = 0; const file = fileAdapter(), control = injected(), originalReal = file.fs.realpathSync;
  file.fs.realpathSync = value => { time = 15001; return originalReal(value); };
  refused(await auditClientCli(flags(file.paths), { fs: file.fs, operations: control.operations, now: () => time }), 'WORK_DEADLINE'); assert.equal(file.effects.opens, 0); assert.equal(control.effects.connects, 0);
  assert.throws(() => parseAuditClientArgs(['--root', ROOT]), error => error.code === 'ARGUMENTS');
  const wrong = flags(file.paths); wrong[1] = TMP; refused(await auditClientCli(wrong), 'ROOT');
});
test('audit files package: backwards and nonfinite clocks refuse before a new input or SDK effect', async () => {
  for (const values of [[5, 4], [NaN]]) { let at = 0; const file = fileAdapter(), control = injected(); refused(await auditClientCli(flags(file.paths), { fs: file.fs, operations: control.operations, now: () => values[Math.min(at++, values.length - 1)] }), 'CLOCK'); assert.equal(file.effects.opens, 0); assert.equal(control.effects.connects, 0); }
});
test('audit files package: final terminal encoding shares the original close reserve and suppresses late success', async () => {
  let time = 0;
  const late = await command(injected(), { now: () => time, serializeTerminal: report => { const json = JSON.stringify(report); time = 5001; return json; } }); refused(late.result, 'CLOSE_DEADLINE'); assert.equal(late.output.frames.length, 1); assert.equal(JSON.parse(late.output.frames[0]).status, 'refused');
  const over = await command(injected(), { serializeTerminal: () => 'x'.repeat(524288) }); refused(over.result, 'OUTPUT_BOUND'); assert.equal(over.output.frames.length, 1); assert.ok(Buffer.byteLength(over.output.frames[0]) <= 2048);
});
test('audit files package: captured terminal writer and caller or process abort are reobserved after serialization', async () => {
  const output = new Terminal(); let wrongWrites = 0;
  const positive = await command(injected(), { stdout: output, serializeTerminal: report => { output.write = () => { wrongWrites++; throw new Error('SYNTHETIC_EXCEPTION'); }; return JSON.stringify(report); } }); assert.equal(positive.result.exitCode, 0); assert.equal(output.frames.length, 1); assert.equal(wrongWrites, 0);
  for (const kind of ['caller', 'SIGINT', 'SIGTERM']) { const abort = new AbortController(), interrupts = new EventEmitter(); const out = await command(injected(), { signal: abort.signal, interrupts, serializeTerminal: report => { if (kind === 'caller') abort.abort(); else interrupts.emit(kind); return JSON.stringify(report); } }); refused(out.result, 'ABORTED'); assert.equal(JSON.parse(out.output.frames[0]).status, 'refused'); assert.equal(out.output.frames.length, 1); assert.equal(interrupts.listenerCount('SIGINT'), 0); assert.equal(interrupts.listenerCount('SIGTERM'), 0); }
});
test('audit files package: terminal drain throw and observed late completion never write a second frame', async () => {
  const drain = new Terminal((frame, callback, stream) => { queueMicrotask(() => { callback(); stream.emit('drain'); }); return false; }); const good = await command(injected(), { stdout: drain }); assert.equal(good.result.exitCode, 0); assert.equal(drain.frames.length, 1); assert.equal(drain.listenerCount('drain'), 0);
  const throwing = new Terminal(() => { throw new Error('SYNTHETIC_EXCEPTION'); }); const bad = await command(injected(), { stdout: throwing }); refused(bad.result, 'INTERNAL'); assert.equal(throwing.frames.length, 1); assert.equal(bad.result.write_completed, false);
  let time = 0; const late = new Terminal((frame, callback) => { time = 5001; callback(); return true; }); const result = await command(injected(), { stdout: late, now: () => time }); refused(result.result, 'CLOSE_DEADLINE'); assert.equal(late.frames.length, 1); assert.equal(JSON.parse(late.frames[0]).status, 'ok'); assert.equal(result.result.exitCode, 1); // Already accepted bytes cannot be recalled; completion refuses.
});
test('audit files package: native guards positively deny network foreign writes and unknown child starts', () => {
  const before = denials;
  for (const action of [() => fetch('https://invalid.invalid'), () => fs.writeFileSync('/unallocated-audit-file-test', 'x'), () => cp.spawn('unallocated', [])]) assert.throws(action, error => error.code === 'NATIVE_DENIAL_CONTROL');
  assert.equal(denials, before + 3); assert.equal(packEntries, 1); assert.equal(commandEntries, 0);
});
test('audit files package: malformed bytes oversized stderr and private exceptions remain bounded without echo', async () => {
  const f = inputs(); f.usage = Buffer.from([255]); const control = injected(); refused(await run(f, {}, control), 'INPUT_UTF8'); assert.equal(control.effects.connects, 0);
  const stderr = injected({ connect: options => { options.onStderr(Buffer.alloc(65536)); options.onStderr(Buffer.from('PRIVATE_RAW_STDERR')); } }); const result = await run(inputs(), {}, stderr); refused(result, 'STDERR_BOUND'); assert.equal(stderr.effects.calls, 0);
  const exception = injected({ call: () => { throw new Error('SYNTHETIC_EXCEPTION PRIVATE_RAW_REQUEST'); } }); refused(await run(inputs(), {}, exception), 'CALL'); assert.equal(exception.effects.calls, 1); assert.equal(exception.effects.closes, 1);
});
let directArtifact;
test('audit files package: command entry1 executes the exact marked packaged guide with one owned child and complete compact parity', { timeout: 25000 }, async t => { const result = await actualCommand('direct', t); directArtifact = result.artifact; assert.equal(result.artifact.audit.rows.length, 6); assert.equal(commandEntries, 1); });
test('audit files package: command entry2 owned bin symlink preserves exact artifact nulls and known-child closure', { timeout: 25000 }, async t => { const result = await actualCommand('alias', t); assert.deepEqual(result.artifact, directArtifact); assert.equal(result.artifact.audit.established.source_rights, null); assert.equal(commandEntries, 2); });
test('audit files package: command entry3 bounded server refusal closes the same child without discovery retry or input echo', { timeout: 25000 }, async t => { const result = await actualCommand('refusal', t); assert.equal(result.error.code, 'TOOL_REFUSED'); assert.equal(commandEntries, 3); });
