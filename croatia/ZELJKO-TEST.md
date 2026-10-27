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

## 3. When sources disagree: whose figure, whose account

These are the family's rules, and they decide every conflict:

1. **Deaths and other numbers** (killed, wounded, buildings hit, people held): use the figure of an
   **international tribunal** (the ICTY) first, then an **international governing body** (the UN, UNESCO), then a
   **human rights organisation**. Say whose count it is. Where none of them has counted, use the Croatian figure,
   also attributed ("Croatian records count…", "the Museum of the Homeland War puts…").
2. **Croatian or Serbian versions** of interpretations, dates, events, death tolls, shell counts and the like:
   **use the Croatian one.**
3. Among Croatian sources, the national encyclopedias and peer-reviewed scholarship (Hrvatska enciklopedija,
   Proleksis, Hrvatski biografski leksikon, Hrčak) outrank press, popular history and Wikipedia.

## 4. Contested things say they are contested

- Numbers that sources disagree on are given as a range or with the source's own hedge ("some sources say 48").
- Tradition is called tradition ("by tradition", "is said to", "De Administrando Imperio says"). Entries tagged
  `tradition` or `debated` must say so in the text.

## 5. Names as the people there write them

- Full Croatian diacritics: Srđ, Čilipi, Župa dubrovačka, Gruž, Ploče, Šipan, Pelješac, Miličević, Bošković,
  Držić, Kosača, Marinović, Šumet, Đurinići. An ASCII-ized name in visible text is a failure.
- Local forms first: Rijeka dubrovačka, Dubrovačko primorje (the Littoral), Konavle.
- People keep their own names (Benedikt Kotruljević, also known as Benedetto Cotrugli).

## 6. The siege, as Dubrovnik remembers it

- The war is the **Homeland War** (Domovinski rat). Never "civil war", never "ethnic conflict".
- Those who held the city are **defenders** (branitelji). The attacking side is named plainly: the Yugoslav army
  and navy (JNA) with Montenegrin and Serb forces.
- Dubrovnik was never taken, and Fort Imperial held on 6 December 1991.
- The dates every family knows must be exact: blockade from 17 September 1991, first shells 22 September, the
  general attack 1 October, Cavtat taken 15 October, the darkest day 6 December, the siege broken 26 May 1992,
  Konavle freed 20–21 October 1992.
- The dead are counted as §3 says: the Hague tribunal and the UN Commission of Experts first, Croatian records
  where they have not counted (defenders), and every count says whose it is.
- The site does **not** collect or publish the family's own memories of the siege. No one should have to relive it
  for this site; the story is told from the documented record only.
- No graphic detail beyond what the record needs. Sombre entries carry `tone: "sombre"`.

## 7. Family history only from the family

- Never invent or infer family names, genealogy, register entries, ranks, deeds or stories about relatives.
- Family material goes in only as the family supplies it, in their words, cited by register, archive, book
  or the family member who gave it, and it is marked as theirs.
- The records guide ("Finding the family in the records") describes where records are kept, not what they say
  about anyone.

## 8. Mistakes never come back

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
| Sutorina and Neum shown as Ragusan until 1699 | Sutorina was Ottoman from 1482, Venetian from 1687; Neum was not Ragusan |
| 594 of 824 Old Town buildings damaged | 563 of 824 hit (68%), the survey cited by the Hague tribunal |
| 19 killed on 6 December 1991 | 13 civilians (UN Commission of Experts); the tribunal names two in the Old Town |
| Croatia "broke away" / "retook the Krajina" | Declared independence; freed its occupied land in Operation Storm |
| Daksa: "some sources say 48" | 53, as Croatian sources and the 2009 exhumation give |

## 9. How to run it

```bash
node tools/zeljko-test.js           # must print ✓ passed before every commit that touches history
node tools/zeljko-test.js --sheet   # also writes ZELJKO-REVIEW.md, the sign-off sheet
```

The checker looks at `history/chronicle.json` and the history constants in `bundle.js` (`THEN_MARKS`,
`PLACE_HISTORY`, `SIEGE_SPOTS`, `SIEGE_AREAS`, `SIEGE_FORT`, `GLOSSARY`). `history/history-data.json` is never
hand-edited: its era texts are corrected as the site loads them (`HIST_TEXT_FIX` and `HIST_NOT_RAGUSAN` in
`bundle.js`), and the checker tests the corrected text, and fails if a correction no longer matches the data.

Failures stop the commit. Warnings are things only a person can judge; they are marked ⚠ on the review sheet.

## 10. The human part

A checker can only catch what it has been taught. The final word belongs to people who know:

1. Run `node tools/zeljko-test.js --sheet` and send `ZELJKO-REVIEW.md` (or a print of it) to Zeljko and the family.
2. Each line gets ✓ or a correction **with its source** (register, archive, book, or "I was there").
3. Corrections go into the chronicle or the constants, a rule goes into the checker if it is a pattern, and the
   sheet is generated again.
4. Reviewers check facts against the record; they are never asked for their own memories of the siege.
