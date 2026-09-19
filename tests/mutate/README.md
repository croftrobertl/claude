# Mutation runner

    python3 tests/mutate/run.py            # every mutation
    python3 tests/mutate/run.py fields     # only mutations naming that suite
    python3 tests/mutate/run.py css-banner-border   # one, by id

Added by the 2026-09-19 audit sweep. It exists to answer one question the suites
cannot answer about themselves: **if this claim stopped being true, would
anything go red?**

## Verdicts

| | |
|---|---|
| `KILLED`   | a suite went red. The claim is tested. |
| `SURVIVED` | every suite stayed green. The claim is prose. |
| `STALE`    | the mutation did not land. **Not a pass.** |

`STALE` is printed as loudly as `SURVIVED` on purpose. It means the find-string
matched a different number of times than `count` declares, so nothing was
changed and nothing was proved. Counting a stale mutation as killed is how a
mutation run flatters itself.

## Read the mutation before you believe the verdict

Of the first run's six survivors, **three were bad mutations, not gaps**:

- `setAttr(el, 'type', 'button')` at `checkout.js:2544` is a fallback branch for
  a `<button>` that arrives without a type. The real write is `btn.type` at
  :2518. The fixture never reaches the fallback, so mutating it proved nothing.
- The `el.tagName === 'FORM'` ceiling in `tooBigToBeAServiceRow()` is backed by
  the contains-price-breakdown check immediately below it. Removing the name
  check alone leaves the claim enforced — defence in depth, correctly.
- `rowLabel()`'s `data-dcc-injected` skip is backed by the asterisk retirement
  pass at :393, which removes the injected node before the next read.

And two `STALE` results were findings in their own right: "pattern found 2x" is
how the four copies of the pet/extra-guest bucket logic were discovered.

## Adding one

Append to `mutations.json`:

```json
{"id": "short-kebab-id",
 "file": "dcc-custom-checkout/assets/checkout.css",
 "suites": ["fields"],
 "claim": "the sentence from CLAUDE.md or the source comment being tested",
 "find": "exact source text",
 "replace": "the broken version",
 "count": 1}
```

Include enough surrounding context in `find` to be unique — if it is not, the
runner says `STALE` and tells you how many times it matched, which is usually
more interesting than the mutation was going to be.

The original file is restored in a `finally`, so an interrupted run leaves the
tree clean; `git status` after a run is the check.
