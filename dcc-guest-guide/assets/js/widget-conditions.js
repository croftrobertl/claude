/**
 * DCC Guest Guide — the live conditions card (v0.25.0).
 *
 * Weather, lake level and the shore tips. Open-Meteo and USGS are fetched
 * from here, so a guide without a conditions card never asks for any of it.
 *
 * Loaded by core at init, and ONLY when the page actually contains the element
 * this covers — see CHUNKS in widget.js. Never loaded on a tap or a touch:
 * fetching a script at the moment a finger lands is how v0.9.7 produced the
 * three-tap bug, where the first taps did nothing because the handler had not
 * arrived yet. Everything here is wired before the guest can reach it.
 *
 * Core injects this file, so window.DCCGG_CORE is always present by the time
 * it runs — no boot dance, unlike widget-guest.js, which the page itself may
 * load in either order.
 */
(function () {
    'use strict';

    const CORE = window.DCCGG_CORE;
    if (!CORE) { return; }
    const { dccggFetchGet } = CORE;

    // -- Conditions side-card weather (v0.7, extended v0.9.7.12) ----------
    // v0.9.7.12 adds (when config.conditionsExtras): NWS alert banner,
    // pressure trend, wind + leeward-shore tip, UV, heat-index, and
    // (via a USGS proxy) lake water level + surface temp. Every new row
    // hides itself if its data source returns nothing.
    //
    // v0.9.7.13: ?dccgg-debug-conditions=1 in the URL surfaces each
    // upstream payload to the console and (via wireConditionsDebug) into
    // a <pre> beneath the card so the host can paste the raw shapes back
    // for targeted follow-ups.
    function wireConditions(root, config) {
        const cards = root.querySelectorAll('.dccgg-conditions');
        if (!cards.length) return;
        // v0.9.7.14: stash the translated strings dict on each card so the
        // per-row renderers can read takeaways / band labels / shore tips
        // without threading the config through every call.
        const condStrings = config.conditionsStrings || {};
        cards.forEach(c => { c.__dccggCondStrings = condStrings; });
        const lat = config.cottageLat;
        const lng = config.cottageLng;
        if (!lat || !lng || !config.ajaxUrl) return;
        const extras = !!config.conditionsExtras;
        const debug = /[?&]dccgg-debug-conditions=1/.test(window.location.search);
        const logIfDebug = (label, payload) => {
            if (debug) console.log('[DCCGG conditions] ' + label, payload);
        };
        const surfaceDebug = (label, payload) => {
            if (!debug) return;
            cards.forEach(card => attachDebugBlock(card, label, payload));
        };
        const wxParams = { lat: String(lat), lng: String(lng) };
        if (debug) wxParams.debug = '1';
        dccggFetchGet(config, 'dccgg_weather', wxParams)
            .then(r => {
                if (!r.ok) console.warn('[DCCGG conditions] weather HTTP ' + r.status);
                return r.json();
            })
            .then(json => {
                logIfDebug('weather', json);
                surfaceDebug('weather', json);
                if (!json.success) return;
                const d = json.data;
                if (!d || !d.current || !d.daily) return;
                const code = d.current.weather_code;
                const emoji = weatherEmoji(code, d.current.is_day);
                const temp  = Math.round(d.current.temperature_2m);
                cards.forEach(card => {
                    const wxRow = card.querySelector('.dccgg-cond-weather');
                    if (wxRow) {
                        wxRow.querySelector('.dccgg-cond-ico').textContent = emoji;
                        wxRow.querySelector('.dccgg-cond-v').textContent  = temp + '°F · ' + weatherText(code, card.__dccggCondStrings);
                    }
                    const fcRow = card.querySelector('.dccgg-cond-forecast');
                    if (fcRow && d.daily.temperature_2m_max && d.daily.temperature_2m_max.length > 1) {
                        const hi   = Math.round(d.daily.temperature_2m_max[1]);
                        const lo   = Math.round(d.daily.temperature_2m_min[1]);
                        const pop  = d.daily.precipitation_probability_max ? d.daily.precipitation_probability_max[1] : 0;
                        const fcc  = d.daily.weather_code ? d.daily.weather_code[1] : 0;
                        fcRow.hidden = false;
                        fcRow.querySelector('.dccgg-cond-ico').textContent = weatherEmoji(fcc, 1);
                        fcRow.querySelector('.dccgg-cond-v').textContent  = hi + '° / ' + lo + '° · ' + pop + '% rain';
                    }
                    if (extras) {
                        renderPressureRow(card, d);
                        renderWindRow(card, d);
                        renderUvRow(card, d);
                        renderHeatRow(card, d);
                    }
                });
            })
            .catch((err) => { console.warn('[DCCGG conditions] weather fetch failed', err); });

        if (extras) {
            // Card 1: NWS alert banner — uses the existing alerts endpoint.
            const alertParams = { lat: String(lat), lng: String(lng) };
            if (/[?&]dccgg-fake-alert=1/.test(window.location.search)) alertParams.fake = '1';
            if (debug) alertParams.debug = '1';
            dccggFetchGet(config, 'dccgg_noaa_alerts', alertParams)
                .then(r => {
                    if (!r.ok) console.warn('[DCCGG conditions] noaa HTTP ' + r.status);
                    return r.json();
                })
                .then(json => {
                    logIfDebug('noaa', json);
                    surfaceDebug('noaa', json);
                    if (!json || !json.success) return;
                    const alerts = (json.data && json.data.alerts) || [];
                    if (!alerts.length) return;
                    const top = alerts[0];
                    cards.forEach(card => {
                        const banner = card.querySelector('.dccgg-cond-alert');
                        if (!banner) return;
                        const text = banner.querySelector('.dccgg-cond-alert-text');
                        const link = banner.querySelector('.dccgg-cond-alert-link');
                        if (text) text.textContent = top.headline || top.event || '';
                        if (link && top.url) { link.href = top.url; link.hidden = false; }
                        banner.hidden = false;
                    });
                })
                .catch((err) => { console.warn('[DCCGG conditions] noaa fetch failed', err); });

            // Card 2: USGS lake water level + surface temp.
            const usgsParams = { lat: String(lat), lng: String(lng) };
            if (debug) usgsParams.debug = '1';
            dccggFetchGet(config, 'dccgg_usgs', usgsParams)
                .then(r => {
                    if (!r.ok) console.warn('[DCCGG conditions] usgs HTTP ' + r.status);
                    return r.json();
                })
                .then(json => {
                    logIfDebug('usgs', json);
                    surfaceDebug('usgs', json);
                    if (!json || !json.success || !json.data || !json.data.available) return;
                    cards.forEach(card => renderLakeRow(card, json.data));
                })
                .catch((err) => { console.warn('[DCCGG conditions] usgs fetch failed', err); });
        }
    }

    function attachDebugBlock(card, label, payload) {
        let pre = card.querySelector('.dccgg-debug-conditions');
        if (!pre) {
            pre = document.createElement('pre');
            pre.className = 'dccgg-debug-conditions';
            pre.textContent = '';
            card.appendChild(pre);
        }
        pre.textContent += '--- ' + label + ' ---\n' + JSON.stringify(payload, null, 2) + '\n\n';
    }

    // Card 3: barometric pressure + 3-hour trend. Open-Meteo returns
    // surface_pressure in hPa (v0.9.7.13: we dropped `pressure_unit=inhg`
    // because Open-Meteo doesn't support it as a unit) so we convert to
    // inHg client-side: 1 hPa = 0.02953 inHg.
    const HPA_TO_INHG = 0.02953;
    function renderPressureRow(card, d) {
        const row = card.querySelector('.dccgg-cond-pressure');
        if (!row) return;
        const curHpa = d.current && typeof d.current.surface_pressure === 'number' ? d.current.surface_pressure : null;
        if (curHpa == null) return;
        const cur = curHpa * HPA_TO_INHG;
        // Hourly surface_pressure comes from past_days=1, so the array spans
        // ~yesterday + today's forecast. Pick the entry nearest (now - 3h).
        let past = null;
        if (d.current && d.current.time && d.hourly && Array.isArray(d.hourly.surface_pressure) && Array.isArray(d.hourly.time)) {
            const target = Date.parse(d.current.time) - 3 * 3600 * 1000;
            let bestIdx = -1;
            let bestDelta = Infinity;
            for (let i = 0; i < d.hourly.time.length; i++) {
                const dt = Math.abs(Date.parse(d.hourly.time[i]) - target);
                if (dt < bestDelta) { bestDelta = dt; bestIdx = i; }
            }
            if (bestIdx >= 0 && typeof d.hourly.surface_pressure[bestIdx] === 'number') {
                past = d.hourly.surface_pressure[bestIdx] * HPA_TO_INHG;
            }
        }
        // When hourly history is missing entirely, fall back to "steady"
        // instead of computing against zero (which v0.9.7.12 mis-tagged as
        // "rising — bass more active" for everyone).
        const CS = (card.__dccggCondStrings || {});
        const PS = CS.pressure || {};
        let arrow = '→', takeaway = PS.steady || 'steady pressure — bite predictable';
        if (past != null) {
            const delta = cur - past;
            if (delta >= 0.04)       { arrow = '↑'; takeaway = PS.rising  || 'bass more active'; }
            else if (delta <= -0.04) { arrow = '↓'; takeaway = PS.falling || 'bite often slow, then picks up before storms'; }
        }
        row.querySelector('.dccgg-cond-v').textContent = cur.toFixed(2) + ' in ' + arrow;
        row.querySelector('.dccgg-cond-takeaway').textContent = takeaway;
        row.hidden = false;
    }

    // Card 4: wind + leeward-shore tip on Lake Dora.
    function renderWindRow(card, d) {
        const row = card.querySelector('.dccgg-cond-wind');
        if (!row) return;
        const spd  = d.current && typeof d.current.wind_speed_10m  === 'number' ? d.current.wind_speed_10m  : null;
        const dirN = d.current && typeof d.current.wind_direction_10m === 'number' ? d.current.wind_direction_10m : null;
        const gst  = d.current && typeof d.current.wind_gusts_10m === 'number' ? d.current.wind_gusts_10m : null;
        if (spd == null || dirN == null) return;
        const dirLabel = compassFromDegrees(dirN);
        const W = ((card.__dccggCondStrings || {}).wind) || {};
        let display = (W.label || 'Wind') + ' ' + dirLabel + ' ' + Math.round(spd) + ' mph';
        if (gst != null && gst > spd + 5) display += ', ' + (W.gusts || 'gusts') + ' ' + Math.round(gst);
        row.querySelector('.dccgg-cond-v').textContent = display;
        row.querySelector('.dccgg-cond-takeaway').textContent = leewardTipForLakeDora(dirLabel, spd, W);
        row.hidden = false;
    }
    function compassFromDegrees(deg) {
        const names = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
        return names[Math.round(((deg % 360) / 22.5)) % 16];
    }
    function leewardTipForLakeDora(dir, spd, W) {
        W = W || {};
        if (spd < 5) return W.flat || 'flat on the Dora Canal — pick any shore';
        const south = W.south_shore || 'south shore of Lake Dora will be the calm side';
        const sw    = W.sw_shore    || 'southwest shore of Lake Dora — try the cove off Lake Dora Pkwy';
        const west  = W.west_shore  || 'west shore of Lake Dora — try the cove off Lake Dora Pkwy';
        const nw    = W.nw_shore    || 'northwest shore of Lake Dora — sheltered along the Tavares side';
        const north = W.north_shore || 'north shore of Lake Dora — try the lily-pad line off Wooton Park';
        const ne    = W.ne_shore    || 'northeast shore of Lake Dora near the canal mouth';
        const east  = W.east_shore  || 'east shore of Lake Dora — Dora Canal entrance is sheltered';
        const se    = W.se_shore    || 'southeast shore of Lake Dora will be the calm side';
        const tips = {
            N: south, NNE: south, NNW: south,
            NE: sw,
            ENE: west, E: west,
            ESE: nw, SE: nw,
            SSE: north, S: north, SSW: north,
            SW: ne,
            WSW: east, W: east, WNW: east,
            NW: se,
        };
        return tips[dir] || '';
    }

    // Card 5: UV index + reapply window.
    function renderUvRow(card, d) {
        const row = card.querySelector('.dccgg-cond-uv');
        if (!row) return;
        const uv = d.daily && Array.isArray(d.daily.uv_index_max) && typeof d.daily.uv_index_max[0] === 'number'
            ? d.daily.uv_index_max[0] : null;
        if (uv == null) return;
        const isDay = d.current && d.current.is_day;
        if (!isDay) return;
        const U = ((card.__dccggCondStrings || {}).uv) || {};
        let band = '';
        if      (uv >= 11) band = U.extreme   || 'extreme';
        else if (uv >= 8)  band = U.very_high || 'very high';
        else if (uv >= 6)  band = U.high      || 'high';
        else if (uv >= 3)  band = U.moderate  || 'moderate';
        else               band = U.low       || 'low';
        row.querySelector('.dccgg-cond-v').textContent = 'UV ' + Math.round(uv) + ' · ' + band;
        let takeaway = '';
        if (uv >= 6) {
            const reapply = new Date(Date.now() + 2 * 3600 * 1000);
            const tpl = U.reapply_by || 'reapply sunscreen by %s';
            takeaway = tpl.replace('%s', formatClock(reapply));
        } else if (uv >= 3) {
            takeaway = U.sunscreen || 'sunscreen recommended';
        }
        row.querySelector('.dccgg-cond-takeaway').textContent = takeaway;
        row.hidden = false;
    }
    function formatClock(d) {
        let h = d.getHours();
        const m = d.getMinutes().toString().padStart(2, '0');
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12; if (h === 0) h = 12;
        return h + ':' + m + ' ' + ampm;
    }

    // Card 6: heat-index / feels-like + hydration nudge.
    function renderHeatRow(card, d) {
        const row = card.querySelector('.dccgg-cond-heat');
        if (!row) return;
        const feels = d.current && typeof d.current.apparent_temperature === 'number' ? d.current.apparent_temperature : null;
        if (feels == null || feels < 90) return;
        row.classList.remove('dccgg-cond-heat--red');
        if (feels >= 103) row.classList.add('dccgg-cond-heat--red');
        const H = ((card.__dccggCondStrings || {}).heat) || {};
        row.querySelector('.dccgg-cond-v').textContent = Math.round(feels) + '°F';
        row.querySelector('.dccgg-cond-takeaway').textContent = feels >= 103
            ? (H.danger || 'dangerous heat — limit time outdoors, drink water every 20 min')
            : (H.warn   || 'drink water every 30 min');
        row.hidden = false;
    }

    // Card 2: lake water level + surface temp from USGS.
    function renderLakeRow(card, info) {
        const row = card.querySelector('.dccgg-cond-lake');
        if (!row) return;
        const L = ((card.__dccggCondStrings || {}).lake) || {};
        const lake = info.lake_name || L.fallback_name || 'Lake';
        const parts = [];
        if (typeof info.gauge_ft === 'number')  parts.push(info.gauge_ft.toFixed(1) + '′');
        if (typeof info.surface_f === 'number') parts.push((L.surface || 'surface') + ' ' + info.surface_f + '°F');
        if (!parts.length) return;
        row.querySelector('.dccgg-cond-v').textContent = lake + ' · ' + parts.join(' · ');
        let takeaway = '';
        const temp = info.surface_f;
        if (typeof temp === 'number') {
            if (temp < 60)       takeaway = L.cold  || 'cold water — bass deep and slow';
            else if (temp < 70)  takeaway = L.cool  || 'cool water — bass moving up to feed';
            else if (temp < 80)  takeaway = L.prime || 'prime water temp — bass active shallow';
            else if (temp < 87)  takeaway = L.warm  || 'warm water — bass early and late, shaded mid-day';
            else                 takeaway = L.hot   || 'hot water — bass deep, focus on dawn and dusk';
        }
        row.querySelector('.dccgg-cond-takeaway').textContent = takeaway;
        row.hidden = false;
    }
    function weatherEmoji(code, isDay) {
        if (code === 0)            return isDay ? '☀️' : '🌙';
        if (code <= 2)             return isDay ? '⛅' : '☁️';
        if (code === 3)            return '☁️';
        if (code >= 45 && code <= 48) return '🌫️';
        if (code >= 51 && code <= 67) return '🌦️';
        if (code >= 71 && code <= 77) return '❄️';
        if (code >= 80 && code <= 82) return '🌧️';
        if (code >= 95)            return '⛈️';
        return '☁️';
    }
    function weatherText(code, condStrings) {
        const W = (condStrings && condStrings.weather) || {};
        const map = {
            0:  W.clear            || 'Clear',
            1:  W.mostly_clear     || 'Mostly clear',
            2:  W.partly_cloudy    || 'Partly cloudy',
            3:  W.overcast         || 'Overcast',
            45: W.fog              || 'Fog',
            48: W.fog              || 'Fog',
            51: W.light_drizzle    || 'Light drizzle',
            53: W.drizzle          || 'Drizzle',
            55: W.heavy_drizzle    || 'Heavy drizzle',
            61: W.light_rain       || 'Light rain',
            63: W.rain             || 'Rain',
            65: W.heavy_rain       || 'Heavy rain',
            71: W.light_snow       || 'Light snow',
            73: W.snow             || 'Snow',
            75: W.heavy_snow       || 'Heavy snow',
            80: W.showers          || 'Showers',
            81: W.heavy_showers    || 'Heavy showers',
            82: W.violent_showers  || 'Violent showers',
            95: W.thunderstorm     || 'Thunderstorm',
            96: W.thunderstorm_hail|| 'Thunderstorm + hail',
            99: W.severe_thunder   || 'Severe thunderstorm',
        };
        return map[code] || W.mixed || 'Mixed';
    }

    (window.DCCGG_CHUNK = window.DCCGG_CHUNK || {})['conditions'] = function (root, config) {
        wireConditions(root, config);
    };

})();
