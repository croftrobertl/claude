# Mutation runner

    python3 tests/mutate/run.py            # every mutation
    python3 tests/mutate/run.py fields     # only mutations naming that suite
    python3 tests/mutate/run.py css-banner-border   # one, by id

Added by the 2026-09-19 audit sweep. It exists to answer one question the suites
cannot answer about themselves: **if this claim stopped being true, would
anything go red?**

## AN EXIT CODE IS NOT A TEST RESULT

This is the rule the rest of the file serves, and it generalises past mutation
testing: **any runner that infers "the assertion failed" from "the process
failed" reports a broken harness as proof that it works.** A crash, a syntax
error, a missing dependency and a real assertion failure all exit non-zero. Read
what the suite *printed*, not how it *exited*.

The first version of this runner decided a suite had noticed a mutation with
`p.returncode == 0`. Three separate measurements of the damage:

1. With `tests/footnote/node_modules` moved aside, `css-footnote-width-pair` was
   reported **KILLED** by a suite that executed zero assertions.
2. `js-form-ceiling-ALL` left `checkout.js` with unbalanced braces. Every suite
   crashed on parse, and it was reported **KILLED for five days** — so the claim
   it existed to isolate, *"a service row can never be the form"* (the defect
   that once blanked the whole checkout), had no evidence behind it at all. The
   re-targeted `js-form-ceiling-none` does kill honestly.

   **This is the argument for the preflight, and the lesson is not "check your
   braces."** Of every claim in this repo, that one had the most apparent
   evidence — a mutation written specifically to isolate it after a narrower
   version survived — and it had none. **A kill count is a claim about your
   runner before it is a claim about your code.** Read it in that order: the
   preflight and the syntax gate exist so the first claim is checked before the
   second one is believed.
3. The same fault was seen here four days earlier — two Chromium suites crashing
   on `require('playwright')` — and **only its trigger was fixed** (a pinned
   lockfile). The mechanism that turned a crash into a pass was left in place.

It is the same family as the repo's own rule about claims nothing constructs the
condition for: a signal that cannot distinguish success from absence of measurement.

## What mutation testing cannot do

**Mutations test the guarantees you wrote.** They cannot test one you never
thought to write, and that is where the near-misses live.

The case, from v0.24.0: gating `guest_fee_steps()` on the new Guest 3/4 switch
would have stripped the price label off historical bookings in wp-admin, because
`Admin_Fields` reads it to price a fee an EXISTING booking really carries. **No
mutation would have caught it** — "the admin still shows the price for a past
booking" was not a guarantee anywhere, so there was nothing to mutate. It was
found by asking who called the function.

So when you add a gate, run the question that catches this class. It is cheap:

> **WHO READS THIS, AND DO THEY ALL WANT IT GATED?**

If the readers split — some want the gated value, some want the raw one — the gate
belongs in a second method, not in the shared one. In this repo that split is two
pairs (`collected_guest_field_groups()` / `guest_field_groups()`, and
`offered_guest_fee_steps()` / `guest_fee_steps()`), and both pairs exist because
the answer came back "no".

## Keep survivors; do not explain them away

A `SURVIVED` that turns out to be a wrong CLAIM rather than a missing test is the
runner working, not a false positive.

v0.24.0: the docblock said the early return before `apply_filters` was what
stopped a snippet re-enabling a switched-off fee. The mutation moved the gate
after the filter and **survived** — because `$enabled && guest34_enabled()` holds
the guarantee just as well. The guard was sound; the sentence about why was not.
The docblock was corrected and the mutation re-aimed at the ordering that does
break it: **applying the filter last, so a snippet gets the final word.**

Explaining that survivor away as "equivalent, no finding" would have left a false
statement in the source and an untested guarantee beside it.

## Verdicts

| | |
|---|---|
| `KILLED`   | a suite printed a `FAIL` line. The only thing that kills. |
| `SURVIVED` | every suite ran and stayed green. The claim is prose. |
| `STALE`    | the mutation did not land. **Not a pass.** |
| `HARNESS`  | a suite did not run — `NO RUN` or `NO SUITE`. **Not red.** |
| `INVALID`  | the mutated file does not parse. The mutation is wrong. |

Per-suite outcomes:

- `PASS` — exit 0, at least one `PASS` line, no `FAIL` line.
- `FAIL` — at least one `FAIL` line.
- `NO RUN` — no verdict printed at all, or a non-zero exit with no `FAIL` line
  (a crash, possibly part-way through a run that had already printed passes).
- `NO SUITE` — the script is not on disk, or the mutation names a suite this
  runner does not know.

`STALE`, `HARNESS` and `INVALID` all fail the exit code and none of them count as
red. `STALE` is printed as loudly as `SURVIVED` on purpose: the find-string
matched a different number of times than `count` declares, so nothing changed and
nothing was proved.

## The baseline preflight

Every suite runs once, unmutated, before any source file is touched. **If one is
not green the run stops**, because after that every mutation would look killed —
which is how a broken harness produces a perfect score. The preflight also prints
the suite files on disk beside the suites this runner executes, so a suite that
exists but was never wired up is visible instead of silently absent.

    python3 tests/mutate/run.py --preflight     # baseline only

A mutated `.js` file is checked with `node --check` and a `.php` file with
`php -l` before any suite runs, which is what now catches case 2 above
automatically.

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
