# canli.paper-evidence.v0

**PREPRINT. NOT PEER REVIEWED.** A proposed open standard, not a performance claim. It has one
implementation, the author's own, and no independent implementation as of this deposit.

## What this is

`canli.paper-evidence.v0` is a JSON Schema for reporting paper-traded and simulated strategy
performance. Its required fields are the ones a performance claim usually omits: what kind of
capital produced the record, whether the identity was frozen before the returns were opened, the
cost basis, how much searching produced the result, what has since been withdrawn, at least one
source binding a reader can check without trusting the publisher, and a mandatory list of what the
record does NOT establish.

This package contains:

- `schema.json` -- the JSON Schema itself.
- `paper-evidence-core.js` -- a zero-dependency JavaScript validator implementing the subset of
  JSON Schema the standard uses (type, const, enum, required, additionalProperties, properties,
  items, minItems, minLength, minimum, maximum, pattern, and the date/date-time formats), plus the
  semantic checks that shape alone cannot express (for example: a PAPER record cannot be net of
  REALISED costs, and a record that declares its Sharpe unreportable may not also publish one).
- `vectors/` -- twelve invalid conformance vectors, each breaking exactly one rule, and one valid
  vector, plus `vectors/manifest.json` describing what each one is meant to prove.
- `MANIFEST.sha256` -- a SHA-256 digest of every file above, so a reader can check this deposit is
  what it claims to be without trusting the publisher. Verify with `shasum -a 256 -c MANIFEST.sha256`
  from inside this directory.

## The valid vector is a worked example, not a claim by this deposit

`vectors/valid-alphac-book.json` is a real instance: the author's own live paper-traded book as of
the date it was generated. Its capital is MIXED: ALPACA PAPER fills for three sleeves and RESEARCH
SIMULATION (locally simulated) fills for the crypto sleeve, both disclosed in the record's own
`capital.notes` field. It explicitly declines to report a Sharpe ratio or an established maximum
drawdown, because the underlying sample is too short to support either.

That vector demonstrates what full disclosure under this schema looks like. It is not a return
claim by this deposit, and it is not kept current here; the live, currently-generated version is
at the source binding below.

## Sources

- Standard and live validator API: https://canlicapital.com/standards/paper-evidence
- Site and standard source: https://github.com/arhancanli/canlicapital
- Engine repositories the standard is designed to describe: https://github.com/arhancanli/canli-backtest
  and https://github.com/arhancanli/canli-pit-lake

## Licence

MIT. See the repository's `LICENSE`. Copyright (c) 2026 Arhan Canli / Canli Capital.

## Authorship and AI-assistance disclosure

Created and maintained by Arhan Canli for Canli Capital. Development uses reviewed AI-assisted
tooling, but project ownership, research decisions, methodology, claims, and publication
responsibility remain with Arhan Canli.

## What this deposit does not establish

- That the schema is complete, or that any published record conforms to a future version of it.
- That the validator is bug-free beyond what the twelve invalid vectors and the one valid vector
  exercise.
- Any performance claim about any strategy, sleeve or book. The bundled example vector is a
  disclosure worked example, not evidence that a strategy works.
