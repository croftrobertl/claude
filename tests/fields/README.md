# Field geometry (tap targets)

```
npm install && npm test
```

Measures the checkout's fields in real Chromium at 390x844 with touch
emulation — the owner's phone.

## Why it exists

The owner needs 3-4 taps to operate anything on `/submit-booking/` on his
phone. The v0.12.0 tap diagnostic showed nearly every press landing on the
`<p class="mphb-customer-*">` wrapper or on the `<section>`, not on an input.
The presses that reached an input were at x 261-277; the ones that hit nothing
were at x 339-374. Tapping a `<p>` does nothing, so the tap is simply lost.

The cause: this plugin never styled MotoPress's own text inputs. It styled
`select` and its own injected pet fields, and left First Name / Last Name /
Address / Apartment to the theme — while `Custom Checkout - Field Standard.css`,
which this plugin publishes as the standard for the other two DCC plugins, had
declared the full pill all along. **The export and its source had diverged, and
the checkout was running on the wrong one.**

## What it asserts

For every control the owner taps, by the ids in his log:

- at least 44px tall — the smallest comfortable target;
- `font-size` at least 16px — **under 16px iOS Safari zooms the whole page when
  the field takes focus**, which moves everything under the finger;
- `box-sizing: border-box`;
- no dead strip wider than 1px between the control and its wrapper's content
  box, on either side.

Then the symptom itself, in the owner's own coordinates: `elementFromPoint` at
x 339 / 361 / 373 on the Apartment row must return the input.

Run against the v0.12.0 stylesheet these fail 33 ways, including all three
coordinate checks. That is the point — they were written to fail against the
release he was using.

## What it cannot prove

That nothing else on the live page also targets these fields. The fixture
reproduces the Elementor kit's input reset at its measured specificity, so the
cascade is real, but only a real checkout can answer that.
