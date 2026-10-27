# The Zeljko Test

Named for Zeljko, who keeps the Dubrovnik family's registers of names and births going back to the 1400s.

**The bar:** every history statement on this site must hold up when it is read by people who have lived in
Dubrovnik all their lives, whose families have lived there for centuries, and who lived through the siege of
1991–92. Some of them fought in it. If a sentence would make one of them wince, it fails.

This applies to the whole site: the Chronicle and its four strands, the siege calendar, the "Then" map
landmarks, the notes on place pages, the siege notes on the map, the glossary, and anything added later.

## 1. Every claim is traceable

- Each entry has its own sources (`src`), and the site shows them in a folded "sources" line under the text.
- A claim needs **one institutional, archival, scholarly or court source** (Hrvatska enciklopedija, Proleksis,
  Hrvatski biografski leksikon, Hrčak papers, the State Archives, UNESCO, the ICTY, the Museum of the Homeland War,
  the City of Dubrovnik, the Tourist Board, the Society of Friends of Dubrovnik Antiquities), **or two independent
  sources**. A single Wikipedia article is not enough on its own.
- Never a travel blog, TripAdvisor, Airbnb, a fan wiki, Medium, Substack, Reddit or Quora as the only support.
- Links are `https` and point to the page that says it, not a home page.

## 2. Dates are exact or honestly vague

- A day is given only when sources agree on the day. Otherwise give the month, the year or a range.
- The heading year, the anniversary (`days`), the siege-calendar date (`d`) and the sort order must agree.
- A landmark's label year is the year it appears on the map, and the year is in its text.
- Where a landmark and a place note tell the same story, their years must match.

## 3. Contested things say they are contested

- Numbers that sources disagree on are given as a range or with the source's own hedge ("some sources say 48").
- Tradition is called tradition ("by tradition", "is said to", "De Administrando Imperio says"). Entries tagged
  `tradition` or `debated` must say so in the text.
- When encyclopedias disagree, the site follows the Croatian scholarly source and flags the item for review.

## 4. Names as the people there write them

- Full Croatian diacritics: Srđ, Čilipi, Župa dubrovačka, Gruž, Ploče, Šipan, Pelješac, Miličević, Bošković,
  Držić, Kosača, Marinović, Šumet, Đurinići. An ASCII-ized name in visible text is a failure.
- Local forms first: Rijeka dubrovačka, Dubrovačko primorje (the Littoral), Konavle.
- People keep their own names (Benedikt Kotruljević, also known as Benedetto Cotrugli).

## 5. The siege, as Dubrovnik remembers it

- The war is the **Homeland War** (Domovinski rat). Never "civil war", never "ethnic conflict".
- Those who held the city are **defenders** (branitelji). The attacking side is named plainly: the Yugoslav army
  and navy (JNA) with Montenegrin and Serb forces.
- Dubrovnik was never taken, and Fort Imperial held on 6 December 1991.
- The dates every family knows must be exact: blockade from 17 September 1991, first shells 22 September, the
  general attack 1 October, Cavtat taken 15 October, the darkest day 6 December, the siege broken 26 May 1992,
  Konavle freed 20–21 October 1992.
- The dead are counted from official or court sources, and every count says whose count it is.
- No graphic detail beyond what the record needs. Sombre entries carry `tone: "sombre"`.

## 6. Family history only from the family

- Never invent or infer family names, genealogy, register entries, ranks, deeds or stories about relatives.
- Family material goes in only as the family supplies it, in their words, cited by register, archive, book
  or the family member who gave it, and it is marked as theirs.
- The records guide ("Finding the family in the records") describes where records are kept, not what they say
  about anyone.

## 7. Mistakes never come back

Every error that was found and corrected becomes a rule in the checker, so it cannot return. Some examples:

| Wrong | Right |
|---|---|
| Blockade began 25 September 1991 | 17 September 1991 |
| First shells 23 September 1991 | 22 September 1991 |
| Siege ended 31 May 1992 | Broken on 26 May 1992 |
| 1806 siege "until 1 October" | Lifted by Molitor on 6 July 1806 |
| Pile bridge from 1537 | Stone bridge from 1471, by Paskoje Miličević |
| Orlando's Column 1419 | 1418, by Bonino da Milano and Antun Dubrovčanin |
| Quarantine of 40 days in 1377 | 30 days (the trentino); 40 was Venice's later rule |
| Ragusa "ceded" Neum at Karlowitz | The Ottomans kept outlets at Neum–Klek and Sutorina, at Ragusa's urging |
| "Civil war" for 1991 | The Homeland War |

## 8. How to run it

```bash
node tools/zeljko-test.js           # must print ✓ passed before every commit that touches history
node tools/zeljko-test.js --sheet   # also writes ZELJKO-REVIEW.md, the sign-off sheet
```

The checker looks at `history/chronicle.json` and the history constants in `bundle.js` (`THEN_MARKS`,
`PLACE_HISTORY`, `SIEGE_SPOTS`, `SIEGE_AREAS`, `SIEGE_FORT`, `GLOSSARY`). It reports on
`history/history-data.json` but never edits it.

Failures stop the commit. Warnings are things only a person can judge; they are marked ⚠ on the review sheet.

## 9. The human part

A checker can only catch what it has been taught. The final word belongs to people who know:

1. Run `node tools/zeljko-test.js --sheet` and send `ZELJKO-REVIEW.md` (or a print of it) to Zeljko and the family.
2. Each line gets ✓ or a correction **with its source** (register, archive, book, or "I was there").
3. Corrections go into the chronicle or the constants, a rule goes into the checker if it is a pattern, and the
   sheet is generated again.
4. Lived memory of the siege is recorded as testimony, credited to the person, and kept apart from the
   documented record.
