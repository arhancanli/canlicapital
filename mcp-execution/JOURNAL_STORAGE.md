# Private local journal storage

`src/journal-store.mjs` is a storage foundation for later paper workflows. It is
not registered as an MCP tool. Supply an existing absolute local directory with
mode `0700` and an Ed25519 private key held by the caller. It creates no directory,
generates or stores no key, and chooses no account, limits, market or order.

```js
import { initializeJournalStore, appendJournalStore } from './src/journal-store.mjs';

const initial = initializeJournalStore({
  home: '/absolute/private/local/directory',
  privateKey, operationId: 'initialize-synthetic-example',
  ts: '2026-10-01T00:00:00.000Z', payload: {},
});
const entry = appendJournalStore({
  home: '/absolute/private/local/directory',
  privateKey, operationId: 'record-synthetic-decision',
  expectedHead: initial.entry_head,
  ts: '2026-10-01T00:00:00.000Z',
  kind: 'decision', payload: { decision_id: 'synthetic-example' },
});
```

Initialization creates `journal.jsonl` exclusively. Appends verify the entire
bounded signed chain, require its genesis key and the caller's expected head,
then add one canonical signed line. Files must be owned regular files with mode
`0600` and exactly one hard link. Final symlinks, observed directory/file identity
changes and ordinary concurrent edits refuse. Permissions are never repaired
silently. This module caps a journal at 8 MiB and one new line at 64 KiB; other
journal readers retain their separate limits.
Directory identity uses its device, inode, owner, group and permissions; its
link count can change when child entries are created. Regular journal and lock
files still require exactly one link.

Payload capture enforces an aggregate canonical JSON byte budget before full
request serialization or filesystem access. It counts escaped strings, member
names and JSON punctuation as well as depth and nodes. The final signed line
has its separate 64 KiB limit, including signing metadata. This is a resource
bound, with no latency claim.
Kind and timestamp are bounded strings before request serialization. The signed
chain remains authoritative for supported kinds and calendar-valid timestamps.

The reserved payload member `_canli_store` records the operation ID and hash of
the exact kind, payload, timestamp and original expected head. An identical
retry returns the original entry head, sequence and journal-prefix binding,
with `replayed: true`. Later appends do not change that prefix identity. Reusing
the ID with changed contents or an updated expected head refuses. The prefix
hash binds the bytes through that operation; it is not a claim that the current
journal ends there. Signed operation metadata is checked for consistency and
duplicate IDs; it remains a statement by the journal's key holder.

Writers create `journal.append.lock` exclusively and persist its request marker.
They complete short writes, request journal and directory `fsync`, read back the
exact expected bytes through the same descriptor, and persist lock removal
before returning success. An existing lock always refuses, including a lock
whose process has died. There is no automatic stale-lock deletion.

`JOURNAL_STORE_UNCERTAIN` returns no success receipt after an interrupted write,
creation or persistence operation. `journal_persistence_attempted` indicates
whether the journal persistence stage was entered; it does not establish how
many bytes reached storage. A partial or complete append, empty newly created
file or incomplete lock may remain. An error after lock removal may leave no
lock even though acknowledgement failed. A subsequent identical retry can
verify the complete signed operation and request persistence again; it never
appends a second copy. A retained lock requires explicit recovery review.

Keep the original files and compare the pending request with the verified
journal before deciding how to recover. Do not delete a lock based solely on a
PID, age or a failed response. This foundation supplies no recovery command,
broker submission, truncation, automatic replay or reconciliation policy.
Failure cleanup never unlinks a journal or an unrelated replacement lock.
Each descriptor is closed at most once. After the private home is validated,
a close error returns uncertainty and
no acknowledgement; the descriptor may already have been closed by the system.
There is no blind retry on its numeric descriptor. Other held descriptors still
receive their own close attempt.
Uncertainty errors retain their immediate error as `cause` for local diagnosis;
that cause does not establish whether any bytes reached durable storage.

The supported model is cooperating writers on a local POSIX filesystem that
implements exclusive creation and directory `fsync`. Network filesystems and
Windows are not established support targets. Descriptor, inode, mode and content
checks observe ordinary replacements; changes entirely between checks by the
same OS user cannot be excluded. A process with that user's filesystem access
can edit the package and bypass cooperative locking. Keep local credentials and
future broker controls separate from this mechanism.

`fsync` requests persistence; its effect depends on the operating system and
device. Software fault fixtures do not establish power-loss or hardware behavior.
No latency figure or 20 ms release target is claimed here. See the
[Node 22 filesystem documentation](https://nodejs.org/docs/latest-v22.x/api/fs.html#fsfsyncsyncfd)
for the API's scope. The journal standard's self-attested time, alternate-journal
and fill-authenticity limits still apply.
