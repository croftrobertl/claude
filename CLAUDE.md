# Repo conventions

## Verify the checkout against the REMOTE, every session

Containers are sometimes provisioned carrying **another plugin's workspace**. A
branch named for the incoming session is created at that foreign HEAD, and
`refs/remotes/origin/<branch>` is written *without contacting the server*. So
`git status` reports a clean, up-to-date branch: it compares HEAD against a
cache that agrees with it. Four of eight checkouts came back wrong on
2026-09-19; one clean container proves nothing about the next one.

**Before the first commit of every session** — not once, every session:

```
git ls-remote origin <your-branch>      # live query, the only source of truth
git rev-parse HEAD
```

A remote-tracking ref (`origin/...`) is a local cache and is not evidence.
A tell: `git reflog show origin/<branch>` on a poisoned ref has an empty
message, where a genuine fetch records `fetch`. A later real fetch reports
`+ <old>...<new> (forced update)`, because the poisoned value was never an
ancestor of the true tip.

### Never force-push these branches

The conclusion is absolute; the mechanism below is the tested one, because a
rule believed for the wrong reason fails in the case it was written for.

Measured in a throwaway repo with the tracking ref poisoned the same way:

| state | command | result |
|---|---|---|
| poisoned cache | plain `push` | rejected (non-fast-forward) |
| poisoned cache | `--force-with-lease` | **rejected, "stale info" — remote unchanged** |
| **after `git fetch`** | `--force-with-lease` | **SUCCEEDS — remote history replaced** |

So the lease *does* protect you while the cache is stale: it compares the stale
expected value against the true remote and they differ. **The protection is
removed by the fetch** — the very step that repairs the disagreement. The
dangerous sequence is therefore **"fetch, then force"**, which is exactly what a
careful person reaches for. Never force, never `--force-with-lease`, never
"reconcile".

### Recovery, when the live check disagrees

First prove nothing local is worth keeping — verify it, do not assume it:

```
git status --porcelain                  # must be empty
git stash list                          # must be empty
git for-each-ref refs/heads refs/remotes
git ls-remote origin                    # every local commit must be reachable
                                        # from some remote branch here
```

Typically local HEAD *is* the tip of another plugin's remote branch, so
discarding it locally loses nothing. Then, and only then:

```
git fetch origin <your-branch>
git reset --hard origin/<your-branch>   # or merge --ff-only if merely behind
```

Both are local-only and touch nothing on the server.

**After that fetch you are in the dangerous state above.** The next push must be
an ordinary fast-forward push. If it is rejected, **STOP AND REPORT IT** — a
rejection after a repair means something is still wrong, and the repair is not
yours to improvise.


## Naming files delivered to the user

Two rules, depending on what the file is.

**Plugin zips — no dash:**

```
Contact Form <version>.zip
```

e.g. `Contact Form 0.34.0.zip`, `Contact Form 1.6.0.zip`.

**Every other file — dash prefix:**

```
Contact Form - <name>
```

e.g. `Contact Form - Spam Report.md`, `Contact Form - hover-states.png`,
`Contact Form - widget.js`.

The prefix REPLACES any earlier one rather than stacking: never
`Contact Form - Contact Form 1.6.0.zip`.

Files delivered before a naming convention changed keep the name they were
delivered under; they are not renamed retroactively. The repo history therefore
contains `dcc-contact-form.zip` (pre-convention) alongside `Contact Form 1.3.0.zip`
through `Contact Form 1.5.0.zip`, and that is expected.

The zip still contains a single top-level `dcc-contact-form/` folder — only the
archive's filename changes, so Plugins -> Upload Plugin continues to install and
update in place.

## Releasing

A change to plugin behaviour gets a version bump in the same commit. The version
appears in three places and all three must agree:

- `dcc-contact-form/dcc-contact-form.php` -> `* Version:` header
- `dcc-contact-form/dcc-contact-form.php` -> `DCC_CONTACT_VERSION` constant
- `dcc-contact-form/readme.txt` -> `Stable tag:` + a `== Changelog ==` entry

Build the zip from the committed state and deliver one zip per version, so a
version number always identifies exactly one build.

Repo-level files (`CLAUDE.md`, `.gitignore`, the notes docs) are not part of the
plugin and are not shipped in the zip, so changing them needs no version bump.
