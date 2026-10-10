# Price Breakdown tests

Drives the real `dcc-custom-checkout/assets/checkout.js` against real MotoPress
breakdown markup in jsdom. No part of the code under test is stubbed.

```bash
cd tests/breakdown
npm install      # jsdom, the only dependency
npm test
```

## Why these exist

The breakdown is the price display. `restructureBreakdown()` removes rows and
rewrites one figure, so a mistake here misstates what a guest is being charged.
Two rules make that safe, and both are covered:

- **Nothing is computed.** Every figure shown is one MotoPress rendered, copied
  verbatim. A row is removed only when its amount string is *identical* to the
  row superseding it.
- **Unrecognised means untouched.** Rows are found by their rendered label, so
  this is English-only by nature. `renamedLabels` renames every label and
  asserts the breakdown comes through completely unaltered.

## Fixtures

| Fixture | What it pins down |
|---|---|
| `noService` | The owner's verified 2-guest booking. The target shape: one line item at its pre-tax amount, one Subtotal, one Taxes, one Total, no figure twice. |
| `withService` | 4 guests with the untaxed $200 extra-guest fee. `Accommodation Total $350` is *not* a duplicate of `Subtotal $550` and must survive. |
| `twoAccommodations` | Nothing duplicates. No row is removed, both indices stay, no line item is rewritten, and the tax fold stands down — one cottage's components under a combined total would misrepresent the bill. |
| `renamedLabels` | Every label renamed. Nothing is recognised, so nothing changes. |

Fixtures are transcribed from live checkouts; the figures are the ones verified
on doracanalcourt.com.
