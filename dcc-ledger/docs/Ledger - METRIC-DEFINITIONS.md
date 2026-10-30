# DCC Ledger — Metric Definitions For Your Check

For the Website Director, 2026-10-29. Nothing below is built yet. These are
the definitions I propose to build to in 0.2.0, written so you can disagree
with a specific sentence rather than with a screen.

Where USALI gives an answer I have followed it and said so. Where our data
cannot support a textbook definition I have said that too, and proposed the
honest substitute rather than a number that looks right.

**Three questions you asked me to settle, answered first:**

| Question | My answer | Short reason |
| --- | --- | --- |
| What counts as an available night? | 8 cottages × every night in the range, always | Capacity is what we own, not what we chose to sell. A night Rob closed is occupancy lost, not capacity lost. |
| Are dock blocks and move copies excluded? | Yes, from both nights and money | A dock block is nobody staying; a move copy is one stay counted once, on the platform reservation it duplicates. |
| Gross or net in ADR and RevPAR? | **Both, side by side, never one unlabeled** | Gross is the price achieved; net is what reached the bank. One without the other misleads, and the gap between them is the commission story. |

---

## 1. The Base Quantities

Everything below is built from four numbers. Each traces to a source
document; none is estimated.

**Available Nights** = 8 × the number of nights in the date range.

The eight cottages are 22, 23, 31, 32, 33, 34, 35 and 36. Crofty Bear is not
one of them and never enters any figure. A range of 1–31 January is 31
nights, so 248 available nights.

A cottage out of service does not reduce this. USALI allows rooms taken out
of order for a *long* renovation to leave the available count; nothing here
has been out that long, and the moment we start deducting nights Rob chose
not to sell, occupancy stops measuring anything. **If a cottage is ever out
for a season, tell me and we will add a dated exclusion with a reason — as a
recorded entry, not a silent one.**

**Occupied Nights** = nights actually slept, counted once.

Included: every confirmed platform stay, and every confirmed direct booking.
Excluded, in each case because counting it would be wrong rather than
because it is inconvenient:

- **Dock blocks.** A cancelled booking used to close dates. Nobody stayed.
- **Hand-typed copies and confirmed move copies.** The same stay typed into
  MotoPress as well as arriving from the platform. Its nights belong to the
  platform reservation; counting both would book the same bed twice.
- **Cancelled platform reservations.** Nobody stayed, whatever money is
  attached.
- **Bookings in Crofty Bear, and anything from Hipcamp.**

A stay crossing the edge of the range contributes only the nights inside it.
Check-in day counts, check-out day does not — `Dates::nights()`, which is
check-out minus check-in.

**Room Revenue (Gross)** = what the guest paid for the room, before the
platform's cut and before any tax.

From it are removed: tax the platform remitted, tax collected inside a
payout, and — for a direct booking — the room tax inside its MotoPress
total. Not removed: the platform's commission or service fee — that is what
makes it gross.

What the guest was billed is counted **once** per stay. A Booking.com
reservation row states its Final amount; its payout file states the same
money again as a guest total. The stay's guest total is used where it has
one, and the reservation's Final amount where it does not — never the sum,
and never the guest total alone, which reported $0 for every Booking.com
stay whose payout had not arrived.

A direct booking's total **includes room tax on this site** — established
by reading live on 2026-10-30, not assumed. Room revenue is therefore the
booking's price breakdown total less its taxes. Where the breakdown cannot
be read and proved, the tax is **unknown, not zero**: the booking's money
is reported, and the booking is in neither room revenue nor any rate. The
screen says how many bookings, nights and dollars that is.

**Room Revenue (Net)** = gross less the platform's commission and service
fees. For a platform stay this is the payout, netted of refunds, resolutions
and adjustments. For a direct booking, gross and net are the same figure:
there is no commission.

---

## 2. The Metrics

Each is shown on screen with its definition and its date range beside it.

### Occupancy

    Occupancy % = Occupied Nights ÷ Available Nights × 100

Reported to one decimal place.

### ADR — Average Daily Rate

    ADR (Gross) = Room Revenue (Gross) ÷ Occupied Nights
    ADR (Net)   = Room Revenue (Net)   ÷ Occupied Nights

USALI defines ADR on room revenue over rooms sold, taxes excluded. The split
into gross and net is ours, and it is the one that matters to Rob: gross is
what the cottage commands, net is what the cottage earns. A single ADR would
hide a commission difference of 15–18% between channels.

Nights with no revenue attached — an unlinked stay, a payout whose
reservation row has not arrived — are excluded from **both** sides of the
division, not just the top. A night in the denominator with nothing above it
would drag the rate down and look like a discount.

### RevPAR — Revenue Per Available Room-Night

    RevPAR (Gross) = Room Revenue (Gross) ÷ Available Nights
    RevPAR (Net)   = Room Revenue (Net)   ÷ Available Nights

Equivalently ADR × Occupancy. Both forms will be shown to tie to the cent;
if they ever disagree, that is a defect and the screen will say so rather
than pick one.

### Net Revenue Per Channel After Commission

Per channel, for the range: gross, commission and fees, tax inside the
payout, refunds and clawbacks, then net. Five rows and a total, so the
subtraction is visible rather than asserted.

Direct bookings are a channel here, with commission of zero. Their "net" is
what MotoPress recorded as paid, plus whatever labelled assumption stands
against the booking — and the assumed part is shown on its own line, never
folded into recorded money.

### Channel Mix

Share of occupied nights, and separately share of net revenue, per channel.
Two different pictures: a channel can be a third of the nights and a quarter
of the money.

### Booking Pace

    Pace = room nights on the books for a stay month,
           as at N days before that month begins

Plotted at 180, 150, 120, 90, 60, 30 and 0 days out, per stay month, with
the same month a year earlier beside it where we have one.

**The honest limit.** We have no daily snapshots of what was on the books at
the time. This is reconstructed from each reservation's booking date, which
means it reflects what *survived* to today, not what stood on the day. A
reservation made in March and cancelled in April shows in neither. That
understates pace in a month with heavy cancellation. The screen will say so
in one line beside the chart. **If you would rather have no pace chart than
a reconstructed one, say so and I will leave it out** — a missing figure is
acceptable; a figure that quietly means something else is not.

Pace begins with the exports, 2025-01-01. Before that there is no booking
date to work from.

### Lead Time

    Lead Time = check-in date − booking date, in days

Median and mean, over stays checking in inside the range. Zero means a
same-day booking; a booking made after check-in would be negative and is
reported as a data question, not clamped to zero.

**The honest limit, and it is a real one.** For platform stays the booking
date comes from the export and is the guest's actual booking date. For
direct bookings it comes from the MotoPress post date — which is when Rob
*typed the booking in*, not necessarily when the guest booked. For a
walk-in those are the same day; for a booking Rob entered a week later they
are not. So direct lead time is a floor, not a fact.

I propose to report platform and direct lead time **separately** and label
the direct figure "from the date the booking was entered". Blending them
would produce one number that is wrong for both. Tell me if you would rather
see platform-only.

### Length Of Stay

    Length Of Stay = nights per stay

Mean and median, over stays whose check-in falls inside the range — a stay
is counted whole, in the month it begins, rather than split, because half a
stay has no length. This is the one metric that does not use the pro-rata
split, and the screen will say so.

---

## 3. The Rules Behind The Rules

### Money, And Rounding

Every amount is held and added as an integer number of cents. Nothing is
computed in floating point.

A stay crossing a period boundary has its money split by nights:

    cents in period = round(stay cents × nights in period ÷ total nights)

with the remainder — whatever the parts leave over — assigned to the period
containing the **last** night. So the parts always sum to the whole, to the
cent, and the leftover lands in one named place rather than wherever the
rounding happened to fall.

Rates (ADR, RevPAR) are computed in cents and rounded half-up to the cent
for display only. Percentages are rounded half-up to one decimal place.
Nothing downstream ever reads a rounded figure.

### Dates And The Clock

Everything is America/New_York. The cottages are in Tavares; a payout at
23:40 on 31 January is January's, and a correction entered at 00:10 on
1 February is February's, whatever the server's clock thinks. Stay date,
booking date and payout date stay three separate fields and are never
substituted for one another.

### Cash Or Accrual

Every screen carries a basis control, and every figure on it is labelled.

- **Stay basis (accrual):** revenue belongs to the nights it was earned on.
- **Payout basis (cash):** money belongs to the date it moved.

Occupancy, ADR, RevPAR, length of stay and pace are accrual measures and are
shown on the stay basis only. Asking for RevPAR on a cash basis is asking
for a number with no meaning; the control will be disabled with a note
rather than silently ignored.

### What Is Shown As Unknown

A metric whose inputs are incomplete shows as **unknown**, with what is
missing named. It is never zero and never estimated. Specifically:

- A range reaching past 2026-09-30 is beyond what has been reconciled. The
  screen says so already and will continue to.
- A range starting before 2025-01-01 has no platform exports behind it, so
  every platform metric is unknown there — the only money is Rob's named
  pre-export assumptions.
- Vrbo reports no tax at all. That is "not reported", never "$0".

---

## 4. One Thing I Cannot Resolve Alone

**A cancelled platform stay that somebody linked a hand-typed booking to as
a copy contributes no nights at all.** The cancelled stay contributes none
because nobody stayed; the copy contributes none because it is a copy. If
such a stay really happened, occupancy is short by its nights and ADR is
correspondingly overstated.

Nothing on live reaches this today — the cleanup list raises it rather than
absorbing it — but with occupancy on the screens it stops being a curiosity
and becomes a figure that can be wrong. The fix is a way to record that a
cancelled reservation was really stayed, which is a decision about the data,
not about the code. **Does Rob want that, and if so what evidence should it
require?**

---

## What I Will Build Once You Have Answered

The three questions at the top, plus the two marked **tell me**: pace
reconstructed or omitted, and lead time split or platform-only. Everything
else I will build as written here.
