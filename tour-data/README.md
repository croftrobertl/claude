# tour-data — Croatia 2025

This folder is the **actual tour app**. It's a static-only HTML/CSS/JS bundle that:

- Renders an interactive Leaflet map of the trip with one pin per stop.
- Reads its data from `stops.json` (itinerary, geo, narrative) and
  `media-manifest.json` (photo/video URLs per stop).
- Works as a Progressive Web App: open the URL on iOS Safari or Chrome on
  Android → Add to Home Screen → installs as an offline-capable app icon.
- Has zero server-side dependencies. No PHP, no MotoPress, no auth.

## How it gets surfaced

Two surfaces, same bundle:

1. **Standalone:** published via GitHub Pages at the repo's Pages URL
   (e.g. `https://croftrobertl.github.io/claude/tour-data/`).
   Share that URL directly.
2. **Inside doracanalcourt.com:** the sibling `dcc-croatia-tour/` plugin
   renders an Elementor widget that pulls this bundle in via a thin loader
   script. The WordPress install holds the loader only — no photos, no JSON.

## Files

| File                    | Purpose                                                         |
| ----------------------- | --------------------------------------------------------------- |
| `index.html`            | Mount + script tags. Loads Leaflet from CDN + this bundle.      |
| `bundle.js`             | Vanilla JS app. Fetches data, draws map + side panel.           |
| `bundle.css`            | Theme (`#0f6dbf` / `#f08080`), responsive grid layout.          |
| `stops.json`            | Itinerary: trip metadata + ordered stops with geo + summaries.  |
| `media-manifest.json`   | Photo URLs and video entries (YouTube ID or self-hosted MP4).   |
| `manifest.webmanifest`  | PWA manifest: name, icons, theme color.                         |
| `service-worker.js`     | Caches the shell + JSON for offline use.                        |
| `media/`                | Mirrored / web-optimized photos and short clips, by stop_id.    |
| `icons/`                | PWA icons (192/512, plus maskable).                             |
| `source/`               | Original source artifacts (calendar exports, etc.) for audit.   |

## Updating the tour

- **Add a stop:** edit `stops.json` (append to `stops` array) and the empty
  array under that stop_id in `media-manifest.json`.
- **Add photos to an existing stop:** drop files in `media/{stop_id}/`, then
  add filenames to `media-manifest.json` `by_stop.{stop_id}` array.
- **Add a YouTube video:** add `{"type":"youtube", "id":"VIDEO_ID"}` to the
  stop's media array.

Service worker cache busts itself when `bundle.js`/`bundle.css` change because
their text content is what the cache stores. For data-only changes (`stops.json`),
the network-first fetch strategy delivers the new file immediately when online.
