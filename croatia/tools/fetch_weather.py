#!/usr/bin/env python3
"""Enrich each trip day's weather with richer historical fields from Open-Meteo
(free, no API key) and merge them into trip.json + data/weather.json.

Run this where outbound HTTPS is allowed (your machine, or any environment with
an open network policy) — the hosted Claude sandbox blocks external hosts:

    cd tour-data
    python3 tools/fetch_weather.py

It ADDS per day (keeping the existing tmax / icon / desc untouched):
    tmin     low temperature (°C)
    precip   precipitation total (mm)
    wind     max wind speed (km/h)
    winddir  dominant wind direction (degrees)

The app already knows how to display these when present. Idempotent — safe to
re-run. After running, commit trip.json (+ data/weather.json) and bump the
service-worker CACHE_VERSION so clients pick up the new data.
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                       # tour-data/
TRIP = os.path.join(ROOT, "trip.json")
WEATHER = os.path.join(ROOT, "data", "weather.json")

API = "https://archive-api.open-meteo.com/v1/archive"
DAILY = ("temperature_2m_max,temperature_2m_min,precipitation_sum,"
         "windspeed_10m_max,winddirection_10m_dominant,weathercode")

# The trip started with two travel days whose photo coordinates don't reflect
# where the weather actually was — pin those to the real city.
CITY_OVERRIDES = [
    (("orlando",), (28.4312, -81.3081)),
    (("london", "gatwick"), (51.1537, -0.1821)),
]


def coord_for(day):
    area = (day.get("area") or "").lower()
    for keys, c in CITY_OVERRIDES:
        if any(k in area for k in keys):
            return c
    for p in day.get("places", []):
        if p.get("lat") is not None:
            return (p["lat"], p["lng"])
    return None


def fetch(lat, lng, date):
    q = urllib.parse.urlencode({
        "latitude": lat, "longitude": lng,
        "start_date": date, "end_date": date,
        "daily": DAILY, "timezone": "auto",
    })
    req = urllib.request.Request(API + "?" + q, headers={"User-Agent": "crofts-in-croatia/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def first(seq):
    return seq[0] if seq else None


def main():
    with open(TRIP, encoding="utf-8") as f:
        trip = json.load(f)
    days = trip["days"]

    enriched = 0
    for d in days:
        c = coord_for(d)
        if not c:
            print(f"  {d['date']}: no coordinates — left unchanged")
            continue
        try:
            dd = fetch(c[0], c[1], d["date"]).get("daily", {})
        except Exception as e:            # noqa: BLE001 - report and continue
            print(f"  {d['date']}: ERROR {e}")
            continue

        w = dict(d.get("weather") or {})
        hi = first(dd.get("temperature_2m_max"))
        if w.get("tmax") is not None and hi is not None and abs(w["tmax"] - hi) > 6:
            print(f"  {d['date']}: NOTE fetched high {hi}° differs from existing "
                  f"{w['tmax']}° (coords {c}) — keeping existing high")

        lo = first(dd.get("temperature_2m_min"))
        pr = first(dd.get("precipitation_sum"))
        wd = first(dd.get("windspeed_10m_max"))
        wdir = first(dd.get("winddirection_10m_dominant"))
        if lo is not None:
            w["tmin"] = round(lo, 1)
        if pr is not None:
            w["precip"] = round(pr, 1)
        if wd is not None:
            w["wind"] = round(wd)
        if wdir is not None:
            w["winddir"] = round(wdir)
        d["weather"] = w
        enriched += 1
        print(f"  {d['date']}: +tmin {w.get('tmin')}  +precip {w.get('precip')}mm  "
              f"+wind {w.get('wind')}km/h @ {w.get('winddir')}°")
        time.sleep(0.4)                   # be gentle with the free API

    if not enriched:
        print("\nNothing enriched — check network access to archive-api.open-meteo.com.")
        sys.exit(1)

    # write trip.json compact (matches the committed format), unicode preserved
    with open(TRIP, "w", encoding="utf-8") as f:
        json.dump(trip, f, ensure_ascii=False, separators=(",", ":"))
    wmap = {d["date"]: d["weather"] for d in days if d.get("weather")}
    with open(WEATHER, "w", encoding="utf-8") as f:
        json.dump(wmap, f, ensure_ascii=False, indent=1)

    print(f"\nEnriched {enriched}/{len(days)} days.")
    print(f"Wrote {os.path.relpath(TRIP)} and {os.path.relpath(WEATHER)}.")
    print("Next: commit the changes and bump the service-worker CACHE_VERSION.")


if __name__ == "__main__":
    main()
