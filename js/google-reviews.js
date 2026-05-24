/* ─────────────────────────────────────────────────────────────────────────
   js/google-reviews.js — Live Google Reviews via Maps JavaScript API.

   Why the Maps JS API and not the REST Places API directly?
   Google's Places REST endpoint does NOT send CORS headers, so a plain
   `fetch()` from the browser is blocked. Google's officially-supported
   in-browser path is the Maps JavaScript API (`places` library), which
   exposes `google.maps.places.PlacesService`. Same API key works for both.

   What this module does
   ─────────────────────
   1. Lazy-loads the Maps JS API only when a `[data-google-reviews]` host
      is in the DOM.
   2. Calls `getDetails({ placeId, fields: ['name','rating','user_ratings_total','reviews','url'] })`.
   3. Renders an aggregate-rating header + up to 5 review cards into the host.
   4. Caches the result in localStorage for 24 h.
   5. Falls back gracefully (keeps any pre-rendered fallback markup) if the
      API key is missing, the request fails, or the place has no reviews.

   Public config (window.GOOGLE_REVIEWS, set in firebase-config.js):
   {
     apiKey:       'AIza...',                       // Maps JS API key
     placeId:      'ChIJYVLws7yViDARQMew5EIX0Dk',   // Your Place ID
     cacheHours:   24,                               // Optional
     mapsLanguage: 'en'                              // Optional
   }

   HTML host: <div data-google-reviews></div>

   Security: lock the API key to your domain in Cloud Console
   (APIs & Services → Credentials → Application restrictions → HTTP referrers).
   ───────────────────────────────────────────────────────────────────────── */
(function () {
    'use strict';

    // ── Config ─────────────────────────────────────────────────────────
    const cfg       = window.GOOGLE_REVIEWS || {};
    const API_KEY   = (cfg.apiKey  || '').trim();
    const PLACE_ID  = (cfg.placeId || '').trim();
    const CACHE_HRS = Number(cfg.cacheHours) > 0 ? Number(cfg.cacheHours) : 24;
    const LANGUAGE  = cfg.mapsLanguage || 'en';
    const CACHE_KEY = 'googleReviewsCache_v1';

    // ── DOM hosts ─────────────────────────────────────────────────────
    const hosts = document.querySelectorAll('[data-google-reviews]');
    if (!hosts.length) return;

    if (!API_KEY || !PLACE_ID) {
        if (window.console) console.info('[google-reviews] disabled — no API key/Place ID set');
        return;
    }

    // ── Helpers ───────────────────────────────────────────────────────
    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(
            /[&<>"']/g,
            c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])
        );
    }

    function getInitials(name) {
        const parts = String(name || '').trim().split(/\s+/);
        if (!parts.length || !parts[0]) return '?';
        return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
    }

    function readCache() {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            const obj = JSON.parse(raw);
            if (!obj || obj.placeId !== PLACE_ID) return null;
            const age = Date.now() - (obj.savedAt || 0);
            if (age > CACHE_HRS * 3600 * 1000) return null;
            return obj.data || null;
        } catch (e) { return null; }
    }

    function writeCache(data) {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({
                placeId: PLACE_ID,
                savedAt: Date.now(),
                data:    data
            }));
        } catch (e) { /* quota / disabled — ignore */ }
    }

    // ── Maps JS API loader (idempotent) ───────────────────────────────
    let mapsLoaderPromise = null;
    function loadMapsJs() {
        if (mapsLoaderPromise) return mapsLoaderPromise;
        if (window.google && window.google.maps && window.google.maps.places) {
            mapsLoaderPromise = Promise.resolve();
            return mapsLoaderPromise;
        }
        mapsLoaderPromise = new Promise(function (resolve, reject) {
            const cbName = '_grMapsCb_' + Math.random().toString(36).slice(2);
            window[cbName] = function () {
                try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
                resolve();
            };
            const s = document.createElement('script');
            s.async = true;
            s.defer = true;
            s.src = 'https://maps.googleapis.com/maps/api/js?key=' +
                    encodeURIComponent(API_KEY) +
                    '&libraries=places&language=' + encodeURIComponent(LANGUAGE) +
                    '&callback=' + cbName +
                    '&loading=async';
            s.onerror = function () { reject(new Error('Failed to load Google Maps JS')); };
            document.head.appendChild(s);
        });
        return mapsLoaderPromise;
    }

    // ── Fetch place details ───────────────────────────────────────────
    function fetchPlaceDetails() {
        return loadMapsJs().then(function () {
            return new Promise(function (resolve, reject) {
                // PlacesService needs a host element (legacy API quirk).
                const offscreen = document.createElement('div');
                const svc = new google.maps.places.PlacesService(offscreen);
                svc.getDetails({
                    placeId: PLACE_ID,
                    fields: ['name', 'rating', 'user_ratings_total', 'reviews', 'url']
                }, function (place, status) {
                    if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
                        reject(new Error('Places API status: ' + status));
                        return;
                    }
                    resolve({
                        name:        place.name || '',
                        rating:      Number(place.rating || 0),
                        reviewCount: Number(place.user_ratings_total || 0),
                        placeUrl:    place.url || ('https://www.google.com/maps/place/?q=place_id:' + PLACE_ID),
                        reviews:     (place.reviews || []).slice(0, 5).map(function (r) {
                            return {
                                author:       r.author_name || 'Google user',
                                photo:        r.profile_photo_url || '',
                                rating:       Number(r.rating || 0),
                                relativeTime: r.relative_time_description || '',
                                text:         r.text || ''
                            };
                        })
                    });
                });
            });
        });
    }

    // ── Render ────────────────────────────────────────────────────────
    function starsHtml(rating) {
        const full   = Math.floor(rating);
        const half   = (rating - full) >= 0.25 && (rating - full) < 0.75;
        const fullN  = half ? full : Math.round(rating);
        const empty  = 5 - fullN - (half ? 1 : 0);
        let out = '';
        for (let i = 0; i < fullN; i++) out += '<i class="fas fa-star"></i>';
        if (half) out += '<i class="fas fa-star-half-alt"></i>';
        for (let i = 0; i < empty; i++) out += '<i class="far fa-star"></i>';
        return out;
    }

    function renderCard(r) {
        const truncated = r.text && r.text.length > 280;
        const shortText = truncated
            ? r.text.slice(0, 280).replace(/\s+\S*$/, '') + '…'
            : (r.text || '');

        const avatarHtml = r.photo
            ? '<img class="gr-avatar" src="' + escapeHtml(r.photo) + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
            : '<div class="gr-avatar gr-avatar-text">' + escapeHtml(getInitials(r.author)) + '</div>';

        const moreBtn = truncated
            ? '<button type="button" class="gr-more-btn" aria-expanded="false">Read more</button>'
            : '';

        return [
            '<article class="gr-card">',
                '<header class="gr-card-head">',
                    avatarHtml,
                    '<div class="gr-card-meta">',
                        '<div class="gr-card-name">', escapeHtml(r.author), '</div>',
                        '<div class="gr-card-time">',
                            '<i class="fab fa-google" aria-hidden="true"></i> ',
                            escapeHtml(r.relativeTime || 'Google review'),
                        '</div>',
                    '</div>',
                    '<div class="gr-card-stars" aria-label="', r.rating, ' out of 5 stars">',
                        starsHtml(r.rating),
                    '</div>',
                '</header>',
                '<p class="gr-card-text" data-full="', escapeHtml(r.text || ''), '" data-short="', escapeHtml(shortText), '">',
                    escapeHtml(shortText),
                '</p>',
                moreBtn,
            '</article>'
        ].join('');
    }

    function renderInto(host, data) {
        if (!data || !data.reviews || !data.reviews.length) return;

        const writeReviewUrl = 'https://search.google.com/local/writereview?placeid=' +
                               encodeURIComponent(PLACE_ID);

        const headerHtml = [
            '<div class="gr-header">',
                '<div class="gr-header-left">',
                    '<div class="gr-google-logo" aria-hidden="true">',
                        '<span style="color:#4285f4">G</span>',
                        '<span style="color:#ea4335">o</span>',
                        '<span style="color:#fbbc05">o</span>',
                        '<span style="color:#4285f4">g</span>',
                        '<span style="color:#34a853">l</span>',
                        '<span style="color:#ea4335">e</span>',
                    '</div>',
                    '<div class="gr-header-meta">',
                        '<div class="gr-header-rating">',
                            '<span class="gr-rating-num">', data.rating.toFixed(1), '</span>',
                            '<span class="gr-stars">', starsHtml(data.rating), '</span>',
                        '</div>',
                        '<div class="gr-rating-count">',
                            'Based on <strong>', data.reviewCount.toLocaleString('en-IN'), '</strong> ',
                            'Google review', data.reviewCount === 1 ? '' : 's',
                        '</div>',
                    '</div>',
                '</div>',
                '<div class="gr-header-actions">',
                    '<a class="gr-cta-write" href="', escapeHtml(writeReviewUrl),
                       '" target="_blank" rel="noopener">',
                        '<i class="fas fa-pen"></i> Write a review',
                    '</a>',
                    '<a class="gr-cta-all" href="', escapeHtml(data.placeUrl),
                       '" target="_blank" rel="noopener">',
                        'See all on Google →',
                    '</a>',
                '</div>',
            '</div>'
        ].join('');

        const cardsHtml = data.reviews.map(renderCard).join('');

        host.innerHTML = headerHtml +
            '<div class="gr-grid">' + cardsHtml + '</div>';

        // "Read more" toggles
        host.querySelectorAll('.gr-more-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const p = btn.previousElementSibling;
                if (!p) return;
                const expanded = btn.getAttribute('aria-expanded') === 'true';
                if (expanded) {
                    p.textContent = p.getAttribute('data-short');
                    btn.textContent = 'Read more';
                    btn.setAttribute('aria-expanded', 'false');
                } else {
                    p.textContent = p.getAttribute('data-full');
                    btn.textContent = 'Read less';
                    btn.setAttribute('aria-expanded', 'true');
                }
            });
        });

        host.classList.add('gr-loaded');
    }

    // ── Boot ──────────────────────────────────────────────────────────
    function renderAll(data) {
        hosts.forEach(function (host) { renderInto(host, data); });
    }

    // 1) Try cache → instant render, no network.
    const cached = readCache();
    if (cached) {
        renderAll(cached);
    }

    // 2) Always fetch fresh (silently) so the next visit has up-to-date data.
    //    On first visit (no cache), this also performs the initial render.
    fetchPlaceDetails()
        .then(function (data) {
            writeCache(data);
            // Only re-render if we didn't already (avoids flicker for cached path).
            if (!cached) renderAll(data);
        })
        .catch(function (err) {
            if (window.console) console.warn('[google-reviews] fetch failed:', err && err.message);
            // Leave fallback markup intact.
        });
})();
