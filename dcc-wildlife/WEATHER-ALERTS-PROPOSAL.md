# Proposal: a Lake County weather-alert banner

Not built. Rob decides. Written 2026-09-12 against `dcc_wx_alerts()` as
described in the audit — **`dcc-weather.php` is not in this repo**, so nothing
below assumes anything about its internals beyond "it returns NWS alerts for
the canal". Every number here is a design decision, not a measurement.

## 0. Where this should live — read this first

A hurricane warning is not a wildlife feature. The banner belongs in the
weather plugin that already owns `dcc_wx_alerts()`, or in the theme, and it
should be placed **site-wide**, not inside the field guide: a guest checking
the booking page in September needs it more than one reading about herons.

DCC Wildlife is the wrong home for it, but it is the right *reference*: the
source-gating, the cache doctrine and the token roles below are this plugin's,
and whoever builds it should follow them. If Rob wants it here anyway, it
works — it just reaches fewer guests.

## 1. Where it renders

Top of the page, above everything, full width, in normal flow (not fixed —
a fixed bar on a phone eats the viewport and fights the sticky header the
level bar already has to dodge).

- Site-wide: hooked to `wp_body_open`, immediately under the site header.
- If confined to this plugin: first child of `.dccwl-canal`, above the
  countdown, outside `--dccwl-sticky-offset`.

One banner at a time. If several alerts are live, show the most severe and
append "+2 more" linking to the county page on weather.gov. Never stack.

## 2. What qualifies

An **allow-list on the NWS `event` string**, not on `severity` — severity
alone lets in heat advisories and rip-current statements, which is how a
banner becomes wallpaper.

| Event (NWS `properties.event`) | Treatment |
|---|---|
| Tornado Warning | warning |
| Hurricane Warning | warning |
| Tropical Storm Warning | warning |
| Flood Warning | warning |
| Hurricane Watch | watch |
| Tropical Storm Watch | watch |

Deliberately out, and why:

- **Tornado Watch** — Rob's list says warning only, and he is right: central
  Florida sits under tornado watches for whole afternoons every summer. A
  banner that cries wolf gets ignored on the day it matters.
- **Storm Surge Warning** — Tavares is inland. It cannot apply here.
- Heat, rip current, dense fog, special weather statement — noise.

**One I would add, for Rob to accept or reject: Flash Flood Warning.** It is
a distinct NWS event from Flood Warning, it is the one that closes roads in
Lake County, and it is more urgent than the Flood Warning already on the list.

Each alert must also still be in force: `properties.ends` (or `expires`) in
the future, and `status` = `Actual`. Test alerts and `Exercise` never render.

## 3. How it dismisses

A 44px × close button on the right. Dismissal is keyed on the NWS alert `id`
(unique per issuance) in `localStorage`:

- Dismissing a flood warning cannot hide the tornado warning issued an hour
  later — that is a different id, so the banner comes back.
- An alert re-issued or upgraded gets a new id, so it comes back too.
- Keys older than 7 days are pruned on read, so the store cannot grow.

Open question for Rob: **should a Tornado Warning be dismissible at all?** My
recommendation is yes — a guest who has read it should be able to put it away,
and the next distinct alert still gets through. Making it undismissible buys
very little and annoys people for the whole 30–60 minutes the warning runs.

## 4. How it stays silent the other 360 days

This is the part that matters, and the site's page cache is what makes it
hard. Three layers:

1. **Nothing time-sensitive is server-rendered.** Same doctrine as the month
   and the countdown: SpeedyCache would otherwise bake a hurricane warning
   into a page served for hours after it expired, or serve a pre-storm page
   with no warning at all. So PHP emits, at most, an empty hidden shell, and
   the browser fills it.
2. **Piggyback, don't add a request.** On `/explore/` the water module already
   calls `/dcc-wildlife/v1/conditions`. Add an `alerts` key to that payload
   and the banner costs **zero extra requests** on the page it matters most.
   Site-wide placement needs its own route — one tiny endpoint,
   `Cache-Control: public, max-age=60`, returning `{"alerts":[]}` (about 15
   bytes) on the 360 quiet days.
3. **Nothing renders and nothing loads when there is no alert.** No wrapper,
   no CSS, no JS beyond the few lines that read the payload. The styles ride
   in `app.css`, which is already on the page; they cost nothing until a
   banner exists to use them.

Server-side, `dcc_wx_alerts()` goes behind a transient — 5 minutes, because
alerts change fast and a tornado warning 15 minutes stale is useless — with
the existing stampede lock and the 5-minute failure back-off.

**If NWS is unreachable, render nothing and say nothing.** Never "no current
alerts": absence of data is not absence of danger, and the same Fact gate
that governs the water module applies here.

## 5. What it looks like

Reuses what exists rather than inventing:

- The `danger` flag mark from `Sprites::marks()` for a warning; `nuisance`
  is wrong, so a watch gets the same mark on the amber fill.
- Warning: `--dccwl-flag-danger` fill, white text. Watch:
  `--dccwl-warn` fill, white text. Both are fill-only tokens — text uses
  `--dccwl-*-text` twins, never the fill — and both pairings must be measured
  AA **on the composited surface** before shipping, like every other colour
  in this plugin.
- Content: the NWS `event` as the headline, one line of `properties.headline`,
  "until 4:15 PM" from `ends` in canal time, and a link to the alert on
  weather.gov.
- `role="alert"` for warnings (it interrupts a screen reader, which is
  correct for a tornado); `role="status"` for watches.

## 6. What I would want before building

1. Where it goes — site-wide, or this plugin only.
2. Flash Flood Warning in or out.
3. Tornado Warning dismissible or not.
4. Read access to `dcc-weather.php`: I cannot see `dcc_wx_alerts()`'s return
   shape, its caching, or whether it already filters by event.

Rough size: about half a release, most of it fixtures and the contrast pass —
one fixture per event type, a test that an empty alert list renders zero
bytes, and a test that an expired alert never renders.
