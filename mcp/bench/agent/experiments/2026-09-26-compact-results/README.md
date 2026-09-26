# Compact validation results (2026-09-26)

The 24 benchmark tasks, three passes each, gpt-5.4-mini, one arm after the other on the same
evening: the server on main (full API envelopes) and the server with compact validation results.
A first attempt ran both arms at once and hit the provider's 200,000 tokens-per-minute limit on 22 and
18 of each arm's 72 requests; it was discarded.

| arm | accuracy | total tokens | median tokens per task | prompt tokens served from cache | records |
|---|---|---|---|---|---|
| full envelopes (main) | 100% | 453609 | 6144 | 89.9% | `full-envelopes.json` |
| compact results (this change) | 98.6% | 445742 | 6121 | 90.1% | `compact-results.json` |

Compact results saved little here, because a validation result is a small part of what a model
reads: the tool list is re-sent on every turn and is most of each task's prompt. Most of those
prompt tokens were served from the provider's cache, which is billed at a fraction of the price and
holds only while the tool list is identical on every launch (test/tool-list-stable.test.mjs).
Compact results matter more in long sessions, where every earlier result stays in the context.
