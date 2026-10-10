# Button spec tests

Measures the checkout's Submit Booking button against the site button spec in
real Chromium, using **computed styles** — not declared ones.

```bash
cd tests/button
npm install
npm test
```

Uses the Chromium already on the machine (`/opt/pw-browsers/…`, or set
`DCC_CHROMIUM`) rather than downloading one.

## Why this exists

`/submit-booking/` only renders with a live reservation in the session, and
nobody should create a booking on a live booking site to read a font size.
`button.html` renders the button in isolation with the two stylesheets that
compete with the plugin's reproduced from their measured values, **loaded
before** the plugin's CSS so the cascade order matches the real page.

**What this proves:** the plugin's selectors out-specify Bravada (0,0,1) and
the Elementor kit (0,1,1), and the resting, hover, focus and 375px appearances
are what the spec asks for.

**What it cannot prove:** that no *other* rule on the live page also targets
this button. Only a real checkout answers that.

## The hover trap

A hover rule that loses to its own resting rule fails silently and still reads
correctly in the file. The hover selectors here are the resting ones with
`:hover` appended — (0,4,2) against (0,3,2) — and the test hovers and asserts
the result rather than trusting the file.

It also waits out the `.15s` transition before reading. Without that wait the
first read catches the animation at t=0 and reports the *resting* colour; the
first run of this harness did exactly that and reported a false failure.
