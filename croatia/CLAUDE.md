# CLAUDE.md — Croatia trip archive

The family's Croatia 2025 trip archive (PWA, GitHub Pages). Static: `index.html`, `bundle.js`, `bundle.css`,
`service-worker.js` (bump `CACHE_VERSION` on every shipped change), `history/`, `tools/`.

## The Zeljko Test (always)

Every history statement on this site must pass the **Zeljko Test**: it has to hold up for Dubrovnik people
whose families go back centuries and who lived through, and fought in, the siege of 1991–92. Read
`ZELJKO-TEST.md` before touching any history text, and run the checker before every commit that does:

```bash
node tools/zeljko-test.js           # must print "✓ passed"
node tools/zeljko-test.js --sheet   # regenerates ZELJKO-REVIEW.md, the sign-off sheet for Zeljko
```

In short: every claim sourced (one institutional/scholarly/court source or two independent ones), exact dates
only where sources agree, traditions and disputes labelled, full Croatian diacritics, "Homeland War" and
"defenders" for 1991–95, and **never invent family history** — family material only as the family supplies it.
When sources conflict: death tolls and other numbers come from international tribunals (ICTY), then international
bodies (UN, UNESCO), then human rights organisations; between Croatian and Serbian versions, use the Croatian.
Never ask for or publish the family's own memories of the siege.
When you correct an error, add a rule for it to `KNOWN_ERRORS` in the checker so it cannot come back.

## Standing rules

- Trip data is append-only: never modify, re-geocode or rename existing items. Never hand-edit
  `history/history-data.json`. Media are priceless family artefacts: never delete them. Don't delete branches.
- UI stays as simple as possible on phone and desktop: no clutter of options, settings or layers. Buttons follow
  the site's style (round play buttons, pill chips, tint plus outline when pressed).
- Photos and other tabs link to the History place page once, not repeatedly.
- Push every commit to `claude/croatia-trip-interactive-tour-9omtya` (GitHub Pages) and to
  `claude/sharp-turing-3cn61a`. No pull requests unless asked.
