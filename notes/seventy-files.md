# Seventy files that were never meant to be public

> I published two open-source repositories with a check that proved they were faithful copies.
> The check passed every time I ran it. It was structurally incapable of failing.

**Published 2026-08-27. Reproducible: the fix is in `canli-pit-lake` and `canli-backtest`,
and the incident is described in both READMEs rather than only here.**

## The setup

The research engine is a single repository of about 1,700 tracked files. Two parts of it are
worth reading on their own: the point-in-time data layer, and the backtester with its
multiple-testing machinery. So I extracted each into its own repository.

An extraction has an obvious failure mode. It drifts. Six months later the "published" copy is
a fork with different behaviour, and every claim made about it is stale. The usual answer is
discipline, which is not an answer.

So I wrote a mechanical one. Every extracted file's SHA-256 is recorded at extraction time in
`extraction_manifest.json`. A tool, `check_parity.py`, re-reads each file from the engine and
fails if a single byte differs. It runs in CI on every push.

I mutation-tested it three ways before trusting it:

- corrupt a source file, expect red;
- tamper with a hash in the manifest, expect red;
- delete a shipped file, expect red.

All three turned it red. All three passed the restore. I considered the check earned.

## The bug

The extractor read the engine's **working directory**.

A working directory is a superset of what a repository publishes. It holds build output,
scratch files, local caches, and in this case 312 megabytes of research artifacts under
`artifacts/`, a path the engine's `.gitignore` excludes wholesale. About ten files under that
path are force-added as deliberate exceptions. The rest are private by design.

Some tests in the extracted suite read those artifacts. So the extractor copied them in, to
make the tests pass. Seventy files that the engine had specifically chosen not to publish were
pushed to a public repository, and the suite went green.

## Why the check could not catch it

Here is the part worth the note.

Running the parity tool locally looks like this:

```
ALPHAC_PATH=~/alphaforge python tools/check_parity.py
```

It compares each shipped file against the engine on disk. The leaked files came **from** the
engine on disk. So the tool compared them against their own source and found them identical,
which they were. It reported `OK: all 187 files are byte-identical to the engine` and it was
telling the truth. It was answering a question I had not asked.

The question I thought I was asking was "is this the same code the world can see?" The question
I was actually asking was "is this the same code as the folder I copied it from?" Those differ
by exactly the set of files the engine does not publish, which is exactly the set that leaked.

The tool has a second mode that fetches from GitHub at a pinned commit. First run:

```
MISSING IN ENGINE   artifacts/probe/tom_diversifier/result.json
```

Seventy of them.

My three mutation tests were all mutations of the **local copy**. Every one of them was
detectable by comparing a file to itself after changing it. Not one of them perturbed the
*source of truth*, so not one of them could have discovered that the source of truth was the
wrong document.

## The fix

Two changes, and only one of them is the obvious one.

The obvious one: the extractor now builds its allowed set from `git ls-files` in the engine.
Support files that are not tracked are skipped and the count is reported. Source modules that
are not tracked raise, because a module the engine does not publish has no business being in a
published extraction, and silently dropping it would produce a repository that imports
something nobody can read.

The one that matters more: the parity check in CI runs against **GitHub**, not against a local
checkout. The local mode still exists because it is fast and useful while working, but it is no
longer the thing that certifies the claim. A check and the thing it validates must not share a
source.

The seventy files were removed by rebuilding the repository's history, so they were public for
about twenty minutes and are not in any commit. I verified the removal by fetching the paths
from `raw.githubusercontent.com` and confirming 404 against a control file returning 200,
rather than by looking at my own working copy, which is the mistake that started this.

## The general shape

I have hit this three times now in different clothes, and it always looks like competence:

- a coverage gate that reads the artifact its own job produced;
- a staleness check whose freshness timestamp is written by the process being checked;
- a parity check pointed at the folder it copied from.

The tell is that the check and its subject have the same parent. When a gate passes on the
first try and keeps passing, the useful question is not "is the code correct" but **"what
would have to be true for this check to fail, and can that state actually occur?"** If you
cannot name a reachable failing state, you do not have a check. You have a screenshot.

The corollary for mutation testing, which I had thought I was doing properly: perturbing the
artifact under test is necessary and not sufficient. You have to perturb the **oracle** too. If
your test suite cannot tell the difference between a correct oracle and a convenient one, its
green is worth nothing.

*The extraction rule and the remote parity check are live in
[canli-pit-lake](https://github.com/arhancanli/canli-pit-lake) and
[canli-backtest](https://github.com/arhancanli/canli-backtest). Both READMEs describe this
incident, because a repository that only documents its successes is a brochure.*
