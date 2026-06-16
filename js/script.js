// Modal controls - Define globally for onclick handlers
let currentBasePrice = 21999;
let currentPackage = 'standard';

// ── Dynamic Package Loading ──────────────────────────────────
const INCL_ICONS = {
    'Hotels': 'fa-bed', 'Deluxe Hotels': 'fa-bed', '5* Resorts': 'fa-bed',
    'Ferries': 'fa-ship', 'Premium Ferries': 'fa-ship', 'VIP Ferries': 'fa-ship',
    'Breakfast': 'fa-utensils', 'Snorkeling': 'fa-swimmer', 'Scuba Dive': 'fa-fish',
    'Romantic Setup': 'fa-heart', 'Photoshoot': 'fa-camera', 'Dinner': 'fa-wine-glass',
    'Live Payment': 'fa-check-circle', 'Instant': 'fa-bolt'
};

function getInclIcon(inc) {
    return INCL_ICONS[inc] || 'fa-check';
}

// ── Meal-plan resolver — single source of truth for the homepage cards ──
// Mirrors the tier mapping in js/checkout.js so the meal plan shown on
// the package card is identical to the one locked in at /checkout.
//
//   Economy / Budget / Standard  ->  Breakfast, Lunch & Dinner
//   Deluxe / Premium / Royal /
//   Luxury                       ->  Breakfast & Dinner (lunch excluded)
//   Honeymoon / customised /
//   anything else                ->  Breakfast only
function pkgMealPlan(pkg) {
    var key = String(pkg && pkg.id || '').toLowerCase();
    var nm  = String(pkg && pkg.name || '').toLowerCase();
    var cat = String(pkg && pkg.category || '').toLowerCase();

    var ID_ALL3 = ['budget','economy','standard',
                   '5a','5b','6a','6b',
                   '5n6d-5a','5n6d-5b','6n7d-6a','6n7d-6b'];
    if (ID_ALL3.indexOf(key) >= 0
        || /\b(budget|economy|standard)\b/.test(nm)
        || /\b(budget|economy|standard)\b/.test(cat)) {
        return 'Breakfast, Lunch & Dinner';
    }

    var ID_BD = ['deluxe','premium','royal','luxury',
                 '5c','5d','6c','6d','4b',
                 '5n6d-5c','5n6d-5d','6n7d-6c','6n7d-6d',
                 'royal-4b-2026'];
    if (ID_BD.indexOf(key) >= 0
        || /^(deluxe|premium|royal|luxury)/.test(key)
        || /(^|-)(5c|5d|6c|6d|4b)(-|$)/.test(key)
        || /\b(deluxe|premium|royal|luxury)\b/.test(nm)
        || /\b(deluxe|premium|royal|luxury)\b/.test(cat)) {
        return 'Breakfast & Dinner';
    }

    return 'Breakfast only';
}

// Build the inclusion list shown on the card. Always prepends the
// resolved hotel tier (e.g. "3/4-star Hotels") and the meal plan so
// the customer instantly sees both the room category and the meal plan
// at a glance — even when the admin's inclusions[] doesn't include
// either entry. We then dedupe so existing hotel/meal-style entries
// don't appear twice.
//
// NOTE: pkgCardInclusions() is called BEFORE pkgHotelTierLabel /
// pkgMealPlan are defined? No — function declarations hoist, so order
// is fine. Just keep this comment so future edits don't reorder them.
function pkgCardInclusions(pkg) {
    var hotel = pkgHotelTierLabel(pkg);
    var meal  = pkgMealPlan(pkg);
    var src   = Array.isArray(pkg && pkg.inclusions) ? pkg.inclusions.slice() : [];
    // Strip any pre-existing hotel-tier or meal-style entries so we
    // control the wording. The first regex catches "3 star hotel",
    // "3-star hotels", "Deluxe Hotels", "5* Resorts", etc. The second
    // catches breakfast/lunch/dinner/"all meals" lines.
    var filtered = src.filter(function (i) {
        var s = String(i || '');
        if (/(\bhotels?\b|\bresorts?\b|\bstar\b|\d\s*\*)/i.test(s)) return false;
        if (/breakfast|lunch|dinner|all meals/i.test(s)) return false;
        return true;
    });
    return [hotel, meal].concat(filtered);
}

// Hard-coded defaults — used only if both jsonbin.io AND the repo file fail
const DEFAULT_PACKAGES = [
    { id:'budget',    name:'Budget Andaman Escape',    desc:'4N/5D | Port Blair + Havelock | Basic Hotels + Ferries', price:15999, rating:4.2, image:'images/beach1.jpg', inclusions:['Hotels','Ferries','Breakfast'], visible:true },
    { id:'standard',  name:'Standard Andaman Bliss',   desc:'6N/7D | Port Blair + Havelock + Neil | Deluxe + Activities', price:21999, rating:4.6, image:'images/beach2.jpg', inclusions:['Deluxe Hotels','Premium Ferries','Snorkeling'], visible:true },
    { id:'luxury',    name:'Luxury Andaman Retreat',   desc:'6N/7D | All Islands | 5* Resorts + Scuba + Private Transfers', price:28999, rating:4.8, image:'images/beach3.jpg', inclusions:['5* Resorts','VIP Ferries','Scuba Dive'], visible:true },
    { id:'honeymoon', name:'Honeymoon Paradise',       desc:'5N/6D | Romantic Stays + Candlelight Dinner + Photos', price:24999, rating:4.9, image:'images/beach4.jpg', inclusions:['Romantic Setup','Photoshoot','Dinner'], visible:true },
    { id:'test',      name:'🧪 Payment Test Package',  desc:'Test the live payment gateway for ₹1 only', price:1, rating:5.0, image:'images/beach1.jpg', inclusions:['Live Payment','Instant'], visible:true }
];

async function loadAndRenderSitePackages() {
    if (window.PackagesStore) {
        // Stale-while-revalidate: render cached instantly, then refresh from
        // jsonbin / repo file and re-render once fresh data arrives.
        await window.PackagesStore.loadWithStaleWhileRevalidate(function (data) {
            window._packages = data;
            renderSitePackages();
        });
        if (window._packages && window._packages.length) return;
    }
    // PackagesStore script missing or both remote sources empty — use defaults
    window._packages = DEFAULT_PACKAGES;
    renderSitePackages();
}

// ── MMT-style listing helpers ───────────────────────────────────
// Active filter / tab / sort state (module-scoped)
const mmtState = { cat: 'all', sort: 'price-asc', dur: [], budget: [], hotel: [], theme: [] };

// Derived helpers from a package
function pkgDuration(pkg) {
    // Try parse leading number from `duration` (e.g. "6 Nights / 7 Days") or fallback by id heuristics
    const d = pkg.duration || pkg.desc || '';
    const m = String(d).match(/(\d+)\s*N/i) || String(d).match(/(\d+)\s*Night/i);
    if (m) return parseInt(m[1], 10);
    return ({ budget: 4, standard: 6, luxury: 6, honeymoon: 5 }[pkg.id] || 5);
}
// Validate-and-sanitize a route. Per actual Bharat Transport & Tourism
// brochures, Havelock and Neil get exactly 1 overnight each — the rest
// park at Port Blair. Honeymoon allows up to 2N Havelock. ANY route
// that violates this is rebuilt from the durations in-place so the
// homepage card NEVER shows a wrong stay distribution.
function sanitizeAndamanRoute(route, pkg) {
    if (!Array.isArray(route) || !route.length) return route;
    var isHoneymoon = String(pkg && pkg.category || '').toLowerCase() === 'honeymoon'
                   || /honeymoon/i.test((pkg && pkg.id) || '')
                   || /honeymoon/i.test((pkg && pkg.name) || '');
    var maxHav = isHoneymoon ? 2 : 1;
    var bad = route.some(function (c) {
        var m = String(c).match(/^(\d+)\s*N\s*(.+)$/i);
        if (!m) return false;
        var n = parseInt(m[1], 10);
        var place = m[2].trim().toLowerCase();
        if (/havelock/.test(place) && n > maxHav) return true;
        if (/neil/.test(place)     && n > 1)      return true;
        return false;
    });
    if (!bad) return route;
    // Recompute from the package — totally ignore the broken cities[].
    return inferAndamanRoute(pkg);
}

function pkgRoute(pkg) {
    if (Array.isArray(pkg.cities) && pkg.cities.length) {
        return sanitizeAndamanRoute(pkg.cities, pkg);
    }
    // Legacy fallbacks for the original demo IDs. Per actual Bharat
    // Transport & Tourism brochures Havelock and Neil get 1 overnight
    // each — the rest park at Port Blair (the only airport + road hub).
    // Honeymoon is the one exception (Havelock-focused — 2N Havelock).
    var legacy = ({
        budget:    ['1N Port Blair', '1N Havelock', '1N Neil Island', '1N Port Blair'],
        standard:  ['1N Port Blair', '1N Havelock', '1N Neil Island', '3N Port Blair'],
        luxury:    ['1N Port Blair', '1N Havelock', '1N Neil Island', '3N Port Blair'],
        honeymoon: ['1N Port Blair', '2N Havelock', '1N Port Blair'],
        test:      ['Test Package']
    })[pkg.id];
    if (legacy) return sanitizeAndamanRoute(legacy, pkg);
    // Try to infer a per-night route from the package's `desc` / `name`,
    // splitting the total nights across the islands mentioned. Most
    // Andaman trips start AND end in Port Blair (it's the only airport),
    // with the bulk of nights at Havelock + Neil. We mirror that pattern
    // here so cards without an admin-set `cities` array still show a
    // realistic per-night breakdown like:
    //   "1N Port Blair · 1N Havelock · 1N Neil Island · 1N Port Blair"
    return sanitizeAndamanRoute(inferAndamanRoute(pkg), pkg);
}

// Heuristic Andaman route builder. Reads `pkg.desc` / `pkg.name` to find
// which islands the package visits, then splits the total nights across
// them in a sensible order (Port Blair → Havelock → Neil → Baratang →
// Port Blair return). Falls back to a Port Blair + Havelock split if no
// island keywords are detected.
function inferAndamanRoute(pkg) {
    var nights = pkgDuration(pkg);
    if (!nights || nights < 1) {
        return [(nights || 1) + 'N Andaman'];
    }
    var blob = String((pkg && pkg.desc) || '') + ' ' +
               String((pkg && pkg.name) || '');
    var b = blob.toLowerCase();
    var hasPB   = /port\s*blair|portblair|\bpb\b/.test(b);
    var hasHav  = /havelock|swaraj/.test(b);
    var hasNeil = /\bneil\b|shaheed/.test(b);
    var hasBar  = /baratang/.test(b);
    var hasDig  = /diglipur/.test(b);

    // Default to PB + Havelock + Neil if nothing matches — that's the
    // most common Andaman itinerary by a wide margin.
    if (!hasPB && !hasHav && !hasNeil && !hasBar && !hasDig) {
        hasPB = true; hasHav = true; hasNeil = true;
    }

    // Per actual Bharat Transport & Tourism brochures (Economy/Standard/
    // Deluxe/Premium 5N–7N packages), Havelock and Neil get exactly 1
    // overnight each (max), with everything else parked at Port Blair.
    // Baratang/Diglipur are day-trips from Port Blair — no overnight.
    // This matches the real Andaman trip pattern (PB is the only airport
    // and also the road hub for Baratang/Diglipur).
    var havN  = hasHav  ? 1 : 0;
    var neilN = hasNeil ? 1 : 0;
    var pbN   = nights - havN - neilN;
    if (pbN < 0) {
        // Shouldn't happen for Andaman trips ≥ 2N, but be safe.
        pbN = 0;
        if (havN + neilN > nights) {
            // Drop Neil first to fit (Havelock is the bigger draw).
            if (neilN && havN + neilN > nights) neilN = Math.max(0, nights - havN);
            if (havN + neilN > nights) havN = Math.max(0, nights - neilN);
        }
    }

    var parts = [];
    // Bookend with PB on arrival when there's at least 1 PB night.
    if (pbN > 0 && hasPB) {
        var pbStart = 1;
        var pbEnd   = pbN - pbStart;
        parts.push(pbStart + 'N Port Blair');
        if (havN)  parts.push(havN  + 'N Havelock');
        if (neilN) parts.push(neilN + 'N Neil Island');
        if (pbEnd > 0) parts.push(pbEnd + 'N Port Blair');
    } else {
        // No PB nights (rare — e.g. Havelock-only honeymoon variant).
        if (havN)  parts.push(havN  + 'N Havelock');
        if (neilN) parts.push(neilN + 'N Neil Island');
        if (pbN)   parts.push(pbN   + 'N Port Blair');
    }
    return parts.length ? parts : [nights + 'N Andaman'];
}
// Map a package to its filter-tab category (lower-case slug).
//
// Phase 1 of the package redesign added an explicit `pkg.category` field
// in the dashboard editor — values: Budget / Standard / Deluxe / Luxury /
// Royal / Honeymoon. The MMT-style tab strip on the homepage uses six
// matching slugs (all-packages / budget / standard / deluxe / luxury /
// royal / honeymoon).
//
// Order of resolution:
//   1) explicit pkg.category (new field, admin-set)
//   2) name-based heuristic (catches existing un-tagged packages so the
//      filter pills still group them sensibly without a backfill)
//   3) legacy hard-coded id mapping (back-compat with the original
//      budget / standard / luxury / honeymoon ids)
//   4) fall back to "standard"
function pkgCategory(pkg) {
    if (!pkg) return 'standard';
    // 1. Explicit category from the dashboard editor
    var cat = String(pkg.category || '').trim().toLowerCase();
    if (cat) {
        if (cat === 'budget' || cat === 'economy') return 'budget';
        if (cat === 'standard')  return 'standard';
        if (cat === 'deluxe')    return 'deluxe';
        if (cat === 'premium')   return 'premium';
        if (cat === 'luxury')    return 'luxury';
        if (cat === 'royal')     return 'royal';
        if (cat === 'honeymoon') return 'honeymoon';
    }
    // 2. Name-based heuristic for un-tagged packages
    // Order matters: more-specific keywords first so "Premium" doesn't
    // get swallowed by the generic luxury/5-star branch.
    var name = String(pkg.name || '').toLowerCase();
    if (/honeymoon/.test(name))                  return 'honeymoon';
    if (/royal/.test(name))                      return 'royal';
    if (/premium/.test(name))                    return 'premium';
    if (/deluxe/.test(name))                     return 'deluxe';
    if (/luxury|5[\s-]?star/.test(name))         return 'luxury';
    if (/budget|backpack|saver|economy/.test(name)) return 'budget';
    // 3. Legacy id mapping
    if (pkg.id === 'test')      return 'budget';
    if (pkg.id === 'budget')    return 'budget';
    if (pkg.id === 'honeymoon') return 'honeymoon';
    if (pkg.id === 'luxury')    return 'luxury';
    if (pkg.id === 'standard')  return 'standard';
    // 4. Fallback
    return 'standard';
}

// Display label + colour for the category pill on each public card.
// Pure helpers — kept in script.js so the renderer below can reach them
// without a separate util file.
function pkgCategoryLabel(slug) {
    return ({
        budget:    'Budget',
        standard:  'Standard',
        deluxe:    'Deluxe',
        premium:   'Premium',
        luxury:    'Luxury',
        royal:     'Royal',
        honeymoon: 'Honeymoon'
    }[slug] || 'Standard');
}
function pkgCategoryColor(slug) {
    return ({
        budget:    '#3498db',
        standard:  '#0d7a8a',
        deluxe:    '#16a085',
        premium:   '#8e44ad',
        luxury:    '#9b59b6',
        royal:     '#d4ac0d',
        honeymoon: '#e74c3c'
    }[slug] || '#0d7a8a');
}
// Numeric "max star" used by the filter pills in the sidebar.
//   Budget / Economy / Standard  -> 3
//   Deluxe / Premium             -> 4 (so the "4-star" filter catches them)
//   Royal / Honeymoon / Luxury   -> 5
function pkgHotelCategory(pkg) {
    if (!pkg) return 3;
    var slug = pkgCategory(pkg);
    var byCat = { budget: 3, standard: 3, deluxe: 4, premium: 4, royal: 5, honeymoon: 5, luxury: 5 };
    if (byCat[slug] != null) return byCat[slug];
    // Legacy id fallback
    return ({ budget: 3, standard: 3, luxury: 5, honeymoon: 5, test: 3 }[pkg.id] || 3);
}

// Human-friendly hotel-tier label shown on the homepage card. We use a
// range ("3-star Hotels", "3/4-star Hotels") rather than a single number
// so the customer sees realistic expectations — the actual hotel a
// booking lands in depends on availability for the dates chosen.
//
//   Budget / Economy / Standard  -> "3-star Hotels"
//   Deluxe / Premium             -> "3/4-star Hotels"
//   Royal / Honeymoon            -> "4/5-star Hotels"
//   Luxury (legacy)              -> "5-star Hotels"
function pkgHotelTierLabel(pkg) {
    if (!pkg) return '3-star Hotels';
    var slug = pkgCategory(pkg);
    if (slug === 'budget' || slug === 'standard')         return '3-star Hotels';
    if (slug === 'deluxe' || slug === 'premium')          return '3/4-star Hotels';
    if (slug === 'royal'  || slug === 'honeymoon')        return '4/5-star Hotels';
    if (slug === 'luxury')                                return '5-star Hotels';
    return '3-star Hotels';
}
function pkgPerks(pkg) {
    return ({
        budget:    ['Daily Breakfast', 'Cellular Jail Visit'],
        standard:  ['Snorkeling at Elephant Beach', 'Visit to Radhanagar Beach'],
        luxury:    ['Scuba Diving Included', 'Private Beach Access', 'Spa Treatments'],
        honeymoon: ['Candlelight Dinner', 'Couple Photoshoot', 'Sunset Cruise'],
        test:      ['Live Razorpay Test']
    }[pkg.id] || []);
}

function applyFilters(packages) {
    return packages.filter(pkg => {
        if (pkg.visible === false) return false;
        // Category tab
        if (mmtState.cat !== 'all' && pkgCategory(pkg) !== mmtState.cat) return false;
        // Duration filter
        if (mmtState.dur.length) {
            const d = pkgDuration(pkg);
            const ok = mmtState.dur.some(range => {
                if (range === '1-3') return d >= 1 && d <= 3;
                if (range === '4-5') return d >= 4 && d <= 5;
                if (range === '6-7') return d >= 6 && d <= 7;
                if (range === '8+')  return d >= 8;
                return true;
            });
            if (!ok) return false;
        }
        // Budget filter
        if (mmtState.budget.length) {
            const p = Number(pkg.price);
            const ok = mmtState.budget.some(range => {
                if (range === '0-15000')      return p < 15000;
                if (range === '15000-22000')  return p >= 15000 && p <= 22000;
                if (range === '22000-30000')  return p > 22000 && p <= 30000;
                if (range === '30000+')       return p > 30000;
                return true;
            });
            if (!ok) return false;
        }
        // Hotel category filter
        if (mmtState.hotel.length) {
            const h = pkgHotelCategory(pkg);
            if (!mmtState.hotel.map(Number).includes(h)) return false;
        }
        return true;
    });
}

function sortPackages(arr) {
    const a = arr.slice();
    switch (mmtState.sort) {
        case 'price-asc':  a.sort((x, y) => x.price - y.price); break;
        case 'price-desc': a.sort((x, y) => y.price - x.price); break;
        case 'rating':     a.sort((x, y) => (y.rating || 0) - (x.rating || 0)); break;
        case 'duration':   a.sort((x, y) => pkgDuration(x) - pkgDuration(y)); break;
        default: /* popular = leave order */ break;
    }
    return a;
}

function updateTabCounts(packages) {
    // Phase 1.4 — counts for the six new category pills (plus the
    // legacy 'premium' alias kept for back-compat with any cached
    // index.html that still uses it).
    const counts = {
        all: 0,
        budget: 0,
        standard: 0,
        deluxe: 0,
        luxury: 0,
        royal: 0,
        honeymoon: 0,
        premium: 0      // legacy alias = sum of luxury + royal
    };
    packages.filter(p => p.visible !== false).forEach(p => {
        counts.all += 1;
        const c = pkgCategory(p);
        if (counts[c] != null) counts[c] += 1;
        if (c === 'luxury' || c === 'royal') counts.premium += 1;
    });
    Object.keys(counts).forEach(k => {
        const el = document.querySelector(`[data-count="${k}"]`);
        if (el) el.textContent = `(${counts[k]})`;
    });
}

function renderSitePackages() {
    const grid = document.getElementById('packagesGrid');
    if (!grid || !window._packages) return;

    updateTabCounts(window._packages);

    const filtered = sortPackages(applyFilters(window._packages));

    if (!filtered.length) {
        grid.innerHTML = `
            <div class="mmt-empty">
                <i class="fas fa-search"></i>
                <h3>No packages match your filters</h3>
                <p>Try widening your filters or switching tabs.</p>
            </div>`;
        return;
    }

    grid.innerHTML = filtered.map(pkg => {
        const isTest = pkg.id === 'test' || pkg.price <= 1;
        const isSoldOut = pkg.soldOut === true;
        const dur = pkgDuration(pkg);
        const days = dur + 1;
        const route = pkgRoute(pkg);
        const perks = pkgPerks(pkg);
        const incl = pkgCardInclusions(pkg).slice(0, 6);
        const totalPrice = isTest ? pkg.price : pkg.price * 2;
        const emi = Math.round(pkg.price / 12);

        // Phase 1.3 — category pill on every card
        const catSlug  = pkgCategory(pkg);
        const catLabel = pkgCategoryLabel(catSlug);
        const catColor = pkgCategoryColor(catSlug);

        // Title clean-up
        const cleanTitle = pkg.name
            .replace(/\s*\(\s*[0-9]+\s*[a-zA-Z]\s*\)\s*/g, ' ')
            .replace(/\s+—/g, ' —')
            .replace(/\s+/g, ' ')
            .trim();

        // ── Mockup-driven derived fields ───────────────────────
        // Rating — use pkg.rating; fall back to 4.5 so cards never look broken.
        const rating = (typeof pkg.rating === 'number' && pkg.rating > 0)
            ? pkg.rating.toFixed(1) : '4.5';
        // Was-price = +18% (rounded to nearest 100). Save = was - now.
        const wasPrice = Math.round((pkg.price * 1.18) / 100) * 100;
        const savings  = Math.max(0, wasPrice - pkg.price);
        const pctOff   = wasPrice > pkg.price
            ? Math.round((savings / wasPrice) * 100) : 0;
        // Slot urgency — deterministic per package id so it stays stable
        // across reloads but varies between cards. Range 2–6.
        const idHash = String(pkg.id).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        const slotsLeft = 2 + (idHash % 5);
        // Insight callout — pick a one-liner per category.
        const insightByCat = {
            budget:    'Best for travellers who want to explore all 3 islands comfortably within a budget.',
            standard:  'Ideal for first-time Andaman travellers looking for maximum sightseeing.',
            deluxe:    'Step up to better hotels and curated experiences across every island.',
            luxury:    'Stay at premium beachfront resorts with private cabs and concierge support.',
            royal:     'Top-tier suites, private yachts and a dedicated trip manager throughout.',
            honeymoon: 'Romantic stays, candlelight dinners and couple experiences across the islands.'
        };
        const insightLine = insightByCat[catSlug] || 'A handpicked Andaman itinerary with hotels, ferries and transfers included.';
        // Day timeline — 4 milestone columns. Build from the route + days.
        const stops = (route && route.length) ? route : ['Port Blair'];
        const timeline = (function () {
            // Always 4 stops: Day 1 / mid1 / mid2 / final (Departure).
            const segs = [];
            const first = stops[0] || 'Port Blair';
            const last = stops[stops.length - 1] || 'Port Blair';
            segs.push({ label: 'Day 1', loc: first });
            if (days >= 4) {
                segs.push({ label: 'Day 2-' + Math.ceil(days / 2), loc: stops[1] || stops[0] });
                segs.push({ label: 'Day ' + Math.ceil(days / 2 + 1) + '-' + (days - 1), loc: stops[2] || stops[1] || stops[0] });
            } else {
                segs.push({ label: 'Day 2', loc: stops[1] || stops[0] });
                segs.push({ label: 'Day 3', loc: stops[2] || stops[1] || stops[0] });
            }
            segs.push({ label: 'Day ' + days, loc: 'Departure' });
            return segs;
        })();
        // Inclusion chips for the card — use first three meaningful inclusions.
        const inclChips = incl.slice(0, 4);
        const inclMore  = Math.max(0, incl.length - inclChips.length);

        return `
        <div class="mmt-card v2-card${isSoldOut ? ' mmt-card-soldout' : ''}" data-pkgid="${pkg.id}" data-name="${pkg.id}" data-category="${catSlug}">
            <div class="v2-card-img" data-nav="${pkg.id}" style="background-image:url('${pkg.image}');">
                <span class="v2-cat-pill" style="background:${catColor};">${catLabel.toUpperCase()}</span>
                <span class="v2-rating-pill"><i class="fas fa-star"></i> ${rating}</span>
                <button type="button" class="v2-heart-btn" aria-label="Save to wishlist" onclick="event.stopPropagation();this.classList.toggle('is-on');"><i class="fa-regular fa-heart"></i></button>
                ${savings > 0 && !isTest ? `<span class="v2-save-pill">SAVE ₹${savings.toLocaleString()}</span>` : ''}
                ${isSoldOut ? `<span class="v2-soldout-stamp">Sold Out</span>` : ''}
            </div>
            <div class="v2-card-body">
                <h3 class="v2-card-title" data-nav="${pkg.id}">${cleanTitle}</h3>
                <div class="v2-card-meta">
                    <span class="v2-meta-strong">${days} Days · ${dur} Nights</span>
                    <span class="v2-meta-route">${stops.join(' → ')}</span>
                </div>
                <div class="v2-insight">
                    <i class="fa-solid fa-binoculars"></i>
                    <span>${insightLine}</span>
                </div>
                ${inclChips.length ? `
                <div class="v2-incl-chips">
                    ${inclChips.map(i => `<span class="v2-incl-chip">${i}</span>`).join('')}
                    ${inclMore ? `<span class="v2-incl-chip v2-incl-chip--more">+${inclMore} more</span>` : ''}
                </div>` : ''}
                <ol class="v2-timeline">
                    ${timeline.map((t, i) => `
                        <li class="v2-tl-step${i === 0 ? ' v2-tl-step--first' : ''}${i === timeline.length - 1 ? ' v2-tl-step--last' : ''}">
                            <span class="v2-tl-dot"></span>
                            <span class="v2-tl-label">${t.label}</span>
                            <span class="v2-tl-loc">${t.loc}</span>
                        </li>`).join('')}
                </ol>
            </div>
            <div class="v2-card-foot">
                <div class="v2-foot-price">
                    <div class="v2-foot-from">Starting from</div>
                    <div class="v2-foot-now-row">
                        <span class="v2-foot-now">₹${Number(pkg.price).toLocaleString()}</span>
                        <span class="v2-foot-per">/person</span>
                        ${!isTest && wasPrice > pkg.price ? `<span class="v2-foot-was">₹${wasPrice.toLocaleString()}</span>` : ''}
                        ${pctOff > 0 && !isTest ? `<span class="v2-foot-pct">${pctOff}% OFF</span>` : ''}
                    </div>
                    ${pkg.price >= 12000 && !isTest ? `<div class="v2-foot-emi">EMI from <strong>₹${emi.toLocaleString()}</strong>/month <i class="fa-solid fa-circle-info" title="No-cost EMI on cards"></i></div>` : ''}
                </div>
                ${!isSoldOut && !isTest ? `
                <div class="v2-foot-urgency">
                    <i class="fa-solid fa-fire"></i> Only ${slotsLeft} slots left this week!
                </div>` : ''}
                <div class="v2-foot-actions">
                    <label class="v2-compare">
                        <input type="checkbox" class="v2-compare-cb" data-pkgid="${pkg.id}" data-pkgname="${cleanTitle.replace(/"/g, '&quot;')}">
                        <span>Compare</span>
                    </label>
                    <button type="button" class="v2-btn v2-btn-outline" data-action="details" data-pkg="${pkg.id}">View Details</button>
                    ${isSoldOut
                        ? `<button class="v2-btn v2-btn-outline v2-btn-soldout" data-action="enquire" data-pkg="${pkg.id}"><i class="fas fa-bell"></i> Notify Me</button>`
                        : `<button class="v2-btn v2-btn-primary" data-action="book" data-pkg="${pkg.id}">${isTest ? 'Pay ₹1 Now' : 'Book Now'}</button>`}
                </div>
            </div>
        </div>`;
    }).join('');

    // Update result count + reset compare-bar after each render
    const countEl = document.getElementById('mmtResultCount');
    if (countEl) countEl.textContent = 'Showing ' + filtered.length + ' Package' + (filtered.length === 1 ? '' : 's');
    if (typeof window._refreshCompareBar === 'function') window._refreshCompareBar();
}

function getPkgPrice(pkgId) {
    if (window._packages) {
        const p = window._packages.find(x => x.id === pkgId);
        if (p) return p.price;
    }
    return {budget:15999, standard:21999, luxury:28999, honeymoon:24999, test:1}[pkgId] || 0;
}

function updateTotal() {
    let total = window.currentBasePrice || currentBasePrice;
    const totalPriceEl = document.getElementById('totalPrice');
    if (!totalPriceEl) return;
    
    const checkboxes = document.querySelectorAll('#customForm input[type="checkbox"]');
    checkboxes.forEach(cb => {
        if (cb.checked) total += parseInt(cb.value);
    });
    totalPriceEl.textContent = `Total: ₹${total.toLocaleString()}`;
}

window.openCustomize = function(pkg) {
    const customizeModal = document.getElementById('customizeModal');
    if (!customizeModal) { console.error('customizeModal not found'); return; }
    customizeModal.style.display = 'block';
    document.getElementById('modalTitle').textContent = `Customize ${pkg.charAt(0).toUpperCase() + pkg.slice(1)} Package`;
    window.currentPackage = pkg;
    window.currentBasePrice = getPkgPrice(pkg);
    updateTotal();
};

window.closeCustomize = function() {
    document.getElementById('customizeModal').style.display = 'none';
};

window.proceedToPayment = function() {
    // 🔒 Require login before opening the payment modal
    if (typeof requireLoginOrPrompt === 'function' && !requireLoginOrPrompt('book ' + window.currentPackage)) {
        document.getElementById('customizeModal').style.display = 'none';
        return;
    }
    const totalStr = document.getElementById('totalPrice').textContent.match(/₹([\d,]+)/)[1].replace(/,/g, '');
    const total = parseFloat(totalStr);
    document.getElementById('finalAmount').textContent = `₹${total.toLocaleString()}`;
    document.getElementById('bookingDetails').textContent = `Package: ${window.currentPackage.charAt(0).toUpperCase() + window.currentPackage.slice(1)}, Duration: ${document.getElementById('duration').value}, Guests: ${document.getElementById('rooms').value}`;
    document.getElementById('customizeModal').style.display = 'none';
    document.getElementById('paymentModal').style.display = 'block';
};

window.closePayment = function() {
    document.getElementById('paymentModal').style.display = 'none';
};

window.confirmBooking = async function() {
    if (!arePaymentsEnabled()) {
        // Close any open payment modal and show the call-to-book alert.
        const pm = document.getElementById('paymentModal');
        if (pm) pm.style.display = 'none';
        showPaymentsDisabledAlert();
        return;
    }
    // 🔒 Final defence: even if the modal somehow opened without login, block payment.
    if (typeof requireLoginOrPrompt === 'function' && !requireLoginOrPrompt('pay for ' + window.currentPackage)) {
        const pm = document.getElementById('paymentModal');
        if (pm) pm.style.display = 'none';
        return;
    }
    const priceStr = document.getElementById('finalAmount').textContent.replace(/[^0-9]/g, '');
    const price = parseFloat(priceStr);
    const details = document.getElementById('bookingDetails').textContent;
    
    // Get user info (optional - can work without login for demo)
    const token = localStorage.getItem('token');
    const currentUser = localStorage.getItem('currentUser');
    
    // Initialize Razorpay payment
    const options = {
        key: 'rzp_live_SLfG8nnKN3tXPC', // Live key
        amount: price * 100, // Amount in paise
        currency: 'INR',
        name: 'Bharat Transport & Tourism',
        description: `${window.currentPackage} Package - Travel Booking`,
        image: 'https://andamanvoyages.in/images/logo.png',
        handler: async function(response) {
            // Payment successful
            const bookingData = {
                package_name: window.currentPackage,
                duration: document.getElementById('duration') ? document.getElementById('duration').value : 'Standard',
                price,
                guests: document.getElementById('rooms') ? document.getElementById('rooms').value : '2 Adults',
                details,
                payment_id: response.razorpay_payment_id,
                payment_method: 'razorpay',
                status: 'confirmed'
            };
            
            try {
                if (window.createBooking) {
                    await window.createBooking(bookingData);
                    alert('🎉 Booking confirmed! Payment successful.\n\nPayment ID: ' + response.razorpay_payment_id + '\n\nYour confirmation will be sent to your email.');
                } else {
                    alert('🎉 Payment successful!\n\nPayment ID: ' + response.razorpay_payment_id + '\n\nBooking details:\n' + JSON.stringify(bookingData, null, 2));
                }
                document.getElementById('paymentModal').style.display = 'none';
                if (window.openProfile) window.openProfile();
            } catch (err) {
                alert('Payment was successful!\n\nPayment ID: ' + response.razorpay_payment_id + '\n\nNote: Booking save encountered an issue. Please contact support with your Payment ID.');
                console.error('Booking save error:', err);
                document.getElementById('paymentModal').style.display = 'none';
            }
        },
        prefill: {
            name: currentUser ? JSON.parse(currentUser).username : 'Guest User',
            email: currentUser ? JSON.parse(currentUser).email : 'guest@example.com',
            contact: '8880195191'
        },
        notes: {
            package: window.currentPackage,
            duration: document.getElementById('duration') ? document.getElementById('duration').value : 'Standard'
        },
        theme: {
            color: '#0d7a8a' // Teal color to match our theme
        }
    };
    
    // Lazy-load Razorpay's checkout.js. The SDK self-loads dozens of
    // payment-method chunks so we deferred the <script src=...> tag
    // out of the public pages. window.RazorpayReady is defined inline
    // in index.html / package.html (and a no-op fallback for any page
    // that already has Razorpay loaded eagerly, eg checkout.html).
    function ensureRazorpay() {
        if (typeof Razorpay !== 'undefined') return Promise.resolve();
        if (typeof window.RazorpayReady === 'function') return window.RazorpayReady();
        // Last-ditch fallback — inject the script directly. Should never
        // be hit in practice because every page that calls this has
        // either the loader or the SDK already in <head>.
        return new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = 'https://checkout.razorpay.com/v1/checkout.js';
            s.onload  = function () { resolve(); };
            s.onerror = function () { reject(new Error('Razorpay failed to load')); };
            document.head.appendChild(s);
        });
    }

    ensureRazorpay().then(function () {
        const rzp1 = new Razorpay(options);

        rzp1.on('payment.failed', function (response) {
            alert('❌ Payment failed!\n\nError: ' + response.error.description + '\n\nPlease try again or contact support.');
            console.error('Payment error:', response);
        });

        rzp1.open();
    }).catch(function (err) {
        alert('❌ Payment system not loaded. Please check your internet connection and try again.');
        console.error('Razorpay load error:', err);
    });
};

// ── Site-settings cache + payments-disabled helper ──────────
window._siteSettings = { paymentsEnabled: true, paymentsDisabledMessage: '' };

function arePaymentsEnabled() {
    return window._siteSettings && window._siteSettings.paymentsEnabled !== false;
}

function showPaymentsDisabledAlert() {
    const msg = (window._siteSettings && window._siteSettings.paymentsDisabledMessage)
        ? window._siteSettings.paymentsDisabledMessage
        : 'Online payments are temporarily unavailable.\n\nTo book this package, please call or WhatsApp us:\n\n📞 +91 88801 95191\n📞 +91 94341 25698\n\nOr email: booking@andamanvoyages.in\n\nWe\'ll confirm your booking and arrange a payment link / bank transfer.';
    alert('🛎️ ' + msg);
}

// ── Login-required helper ─────────────────────────────────
// Cache the live Firebase auth instance once it's ready, so
// isUserLoggedIn() can do a synchronous check on every click.
window.__authInstance = null;
window.__firebaseAuthReady = false;
if (window.__firebaseReady && typeof window.__firebaseReady.then === 'function') {
    window.__firebaseReady.then(({ auth, firebaseAuth }) => {
        window.__authInstance = auth;
        // Wait for the FIRST auth-state event (definitive answer about login state).
        // Until this fires, Firebase may still be restoring a persisted session.
        if (firebaseAuth && typeof firebaseAuth.onAuthStateChanged === 'function') {
            const stop = firebaseAuth.onAuthStateChanged(auth, (u) => {
                window.__firebaseAuthReady = true;
                // If Firebase says no user, scrub stale local cache too.
                if (!u) {
                    try { localStorage.removeItem('currentUser'); } catch (e) {}
                    try { localStorage.removeItem('token'); } catch (e) {}
                }
            });
        } else {
            window.__firebaseAuthReady = true;
        }
    }).catch(() => { window.__firebaseAuthReady = true; });
}

function isUserLoggedIn() {
    // 1) Primary source of truth: live Firebase Auth instance (modular SDK v9+)
    if (window.__authInstance) {
        const u = window.__authInstance.currentUser;
        const ok = !!(u && u.uid);
        // Debug aid: leave a breadcrumb in console so we can verify the check.
        try { console.debug('[auth] isUserLoggedIn (Firebase)=', ok, u && u.email); } catch (e) {}
        return ok;
    }
    // 2) Firebase not yet ready → require BOTH localStorage entries (token + uid)
    //    so any orphan value gets rejected.
    try {
        const cu = JSON.parse(localStorage.getItem('currentUser') || 'null');
        const tok = localStorage.getItem('token');
        const ok = !!(cu && (cu.uid || cu.id) && tok);
        try { console.debug('[auth] isUserLoggedIn (localStorage)=', ok); } catch (e) {}
        return ok;
    } catch (e) { return false; }
}

function requireLoginOrPrompt(intentLabel) {
    if (isUserLoggedIn()) return true;
    // Remember what the user was trying to do, so we can resume after login.
    try {
        sessionStorage.setItem('postLoginIntent', JSON.stringify({
            type: 'book',
            pkg: window.currentPackage || null,
            label: intentLabel || 'continue booking',
            ts: Date.now()
        }));
    } catch (e) {}
    // No browser alert — just open the login modal silently.
    if (typeof window.openLogin === 'function') window.openLogin();
    return false;
}

window.bookPackage = function(pkg) {
    try {
        if (!arePaymentsEnabled()) { showPaymentsDisabledAlert(); return; }
        window.currentPackage = pkg;
        // Build a cart object and navigate to the dedicated checkout page.
        const pkgData = (window._packages || []).find(p => p.id === pkg) ||
                        { id: pkg, name: pkg, price: getPkgPrice(pkg), image: '', duration: '' };
        const sc = (function () {
            try { return JSON.parse(sessionStorage.getItem('searchContext') || 'null'); } catch (e) { return null; }
        })();
        const cart = {
            pkgId: pkgData.id,
            name: pkgData.name,
            price: pkgData.price,
            image: pkgData.image || 'images/beach1.jpg',
            duration: pkgData.duration || '',
            adults: (sc && sc.adults) || 2,
            children: (sc && sc.children) || 0,
            travelDate: (sc && sc.date) || '',
            addons: [],
            duration_pref: '',
            meals: ''
        };
        try { sessionStorage.setItem('checkoutCart', JSON.stringify(cart)); } catch (e) {}
        window.location.href = '/checkout';
    } catch (e) {
        console.error('Error in bookPackage:', e);
        if (window.Toast) window.Toast.error('Could not start booking: ' + e.message);
    }
};

// Additional global functions
window.quickSearch = function() {
    document.querySelector('#packages').scrollIntoView({ behavior: 'smooth' });
    alert('Searching best Andaman packages for your dates!');
};

window.searchPackages = function() {
    alert('Redirecting to Andaman packages...');
    document.querySelector('#packages').scrollIntoView({ behavior: 'smooth' });
};

window.openRegister = function() {
    document.getElementById('registerModal').style.display = 'block';
};

window.closeRegister = function() {
    document.getElementById('registerModal').style.display = 'none';
};

window.openLogin = function() {
    document.getElementById('loginModal').style.display = 'block';
};

window.closeLogin = function() {
    document.getElementById('loginModal').style.display = 'none';
};

window.openProfile = function() {
    document.getElementById('profileModal').style.display = 'block';
};

window.closeProfile = function() {
    document.getElementById('profileModal').style.display = 'none';
};

document.addEventListener('DOMContentLoaded', function() {
    // ── Load packages from API ─────────────────────────────────
    loadAndRenderSitePackages();

    // 🔑 Open the login modal automatically when navigating to #login
    // (e.g. from package.html when user tries to book without being logged in)
    function showLoginRequiredNotice() {
        const modal = document.getElementById('loginModal');
        if (!modal) return;
        const content = modal.querySelector('.modal-content');
        if (!content || content.querySelector('#loginRequiredNotice')) return;
        const notice = document.createElement('div');
        notice.id = 'loginRequiredNotice';
        notice.style.cssText = 'background:#fff8e7;color:#8a6d3b;padding:.7rem .9rem;border-radius:6px;border-left:3px solid #f39c12;margin:0 0 1rem;font-size:.92rem;line-height:1.45;';
        notice.innerHTML = '<i class="fas fa-info-circle"></i> Please log in to continue with your booking. Your package selection has been saved &mdash; payment will resume automatically after sign-in.';
        const h2 = content.querySelector('h2');
        if (h2 && h2.nextSibling) h2.parentNode.insertBefore(notice, h2.nextSibling);
        else content.insertBefore(notice, content.firstChild);
    }
    const _hasPendingIntent = (function () {
        try { return !!sessionStorage.getItem('postLoginIntent'); } catch (e) { return false; }
    })();
    if ((window.location.hash === '#login' || _hasPendingIntent) && !isUserLoggedIn()) {
        // Small delay so DOM is fully ready
        setTimeout(() => {
            showLoginRequiredNotice();
            if (typeof window.openLogin === 'function') window.openLogin();
        }, 100);
    }

    // ── Load site settings from Firestore (payments toggle, heroSlides, etc.) ──
    if (window.SettingsStore && typeof window.SettingsStore.load === 'function') {
        // Use cached value first (instant), then fetch fresh and re-apply
        const cached = window.SettingsStore.cached && window.SettingsStore.cached();
        if (cached) {
            window._siteSettings = cached;
            applyPaymentsState();
            applyHeroSlides(cached);
        }
        window.SettingsStore.load().then(s => {
            window._siteSettings = s || window._siteSettings;
            applyPaymentsState();
            applyHeroSlides(s);
        }).catch(err => console.warn('Settings load failed:', err));
    }

    // ── Apply admin-managed hero slides from settings.heroSlides ──
    function applyHeroSlides(settings) {
        const slides = settings && Array.isArray(settings.heroSlides) && settings.heroSlides.length
            ? settings.heroSlides
            : null;
        if (!slides) return; // empty → keep static HTML slides

        const track = document.getElementById('carouselTrack');
        if (!track) return;

        track.innerHTML = slides.map((s, i) => {
            const url = String(s.url || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
            const cap = String(s.caption || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `<div class="carousel-slide${i === 0 ? ' active' : ''}" style="background-image: url('${url}')">` +
                   (cap ? `<div class="slide-caption">${cap}</div>` : '') +
                   '</div>';
        }).join('');

        // Rebuild dots and reinit the carousel with the new slide count
        const dotsContainer = document.getElementById('carouselDots');
        if (dotsContainer) dotsContainer.innerHTML = '';
        // Trigger a fresh carousel init by dispatching a custom event
        document.dispatchEvent(new CustomEvent('heroSlidesUpdated'));
    }

    function applyPaymentsState() {
        const enabled = arePaymentsEnabled();
        // Re-render package cards so the CTA labels update
        if (typeof renderSitePackages === 'function') renderSitePackages();
        // Show/hide a banner above #packages
        let banner = document.getElementById('paymentsDisabledBanner');
        if (!enabled) {
            if (!banner) {
                banner = document.createElement('div');
                banner.id = 'paymentsDisabledBanner';
                banner.className = 'payments-disabled-banner';
                const target = document.getElementById('packages') || document.querySelector('main');
                if (target) target.parentNode.insertBefore(banner, target);
            }
            const customMsg = (window._siteSettings && window._siteSettings.paymentsDisabledMessage) || '';
            banner.innerHTML =
                '<i class="fas fa-info-circle"></i> ' +
                (customMsg ||
                'Online payments are temporarily unavailable. Please call <a href="tel:+918880195191">+91 88801 95191</a> or email <a href="mailto:booking@andamanvoyages.in">booking@andamanvoyages.in</a> to book.');
        } else if (banner) {
            banner.remove();
        }

        // Also tweak the modal "Pay Now" button label and the modal subtitle
        const cb = document.getElementById('confirmBookingBtn');
        if (cb) cb.innerHTML = enabled
            ? '<i class="fas fa-credit-card"></i> Pay Now with Razorpay'
            : '<i class="fas fa-phone-alt"></i> Call to Book — Payments Disabled';
    }

    // ── Hero Carousel ──────────────────────────────────────────
    let _carouselAutoTimer = null;
    function initCarousel() {
        // Stop any prior timer before reinitialising (called again after heroSlidesUpdated)
        if (_carouselAutoTimer) { clearInterval(_carouselAutoTimer); _carouselAutoTimer = null; }

        const slides = document.querySelectorAll('.carousel-slide');
        const dotsContainer = document.getElementById('carouselDots');
        const prevBtn = document.getElementById('carouselPrev');
        const nextBtn = document.getElementById('carouselNext');
        if (!slides.length || !dotsContainer || !prevBtn || !nextBtn) return;

        let current = 0;

        // Rebuild dots (may be called after heroSlidesUpdated cleared them)
        dotsContainer.innerHTML = '';
        slides.forEach((_, i) => {
            const dot = document.createElement('button');
            dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
            dot.setAttribute('aria-label', `Slide ${i + 1}`);
            dot.addEventListener('click', () => goTo(i));
            dotsContainer.appendChild(dot);
        });

        function goTo(index) {
            slides[current].classList.remove('active');
            dotsContainer.children[current].classList.remove('active');
            current = (index + slides.length) % slides.length;
            slides[current].classList.add('active');
            dotsContainer.children[current].classList.add('active');
        }

        function next() { goTo(current + 1); }
        function prev() { goTo(current - 1); }

        function startAuto() {
            if (_carouselAutoTimer) { clearInterval(_carouselAutoTimer); }
            _carouselAutoTimer = setInterval(next, 4500);
        }
        function stopAuto() {
            if (_carouselAutoTimer) { clearInterval(_carouselAutoTimer); _carouselAutoTimer = null; }
        }

        prevBtn.onclick = () => { prev(); startAuto(); };
        nextBtn.onclick = () => { next(); startAuto(); };

        // Pause on hover
        const carousel = document.querySelector('.hero-carousel');
        carousel.addEventListener('mouseenter', stopAuto);
        carousel.addEventListener('mouseleave', startAuto);

        // Touch / swipe support
        let touchStartX = 0;
        carousel.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
        carousel.addEventListener('touchend', e => {
            const diff = touchStartX - e.changedTouches[0].clientX;
            if (Math.abs(diff) > 50) { diff > 0 ? next() : prev(); startAuto(); }
        }, { passive: true });

        startAuto();
    }
    initCarousel();
    document.addEventListener('heroSlidesUpdated', initCarousel);

    // Mobile hamburger: slide-down topnav
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    if (hamburgerBtn) hamburgerBtn.addEventListener('click', () => {
        document.body.classList.toggle('nav-open');
    });

    // Topbar scroll state — adds .scrolled when the page is scrolled past 30px,
    // bumping the translucent header to a more opaque look so text stays legible.
    (function () {
        const tb = document.querySelector('.topbar');
        if (!tb) return;
        const apply = () => {
            if (window.scrollY > 30) tb.classList.add('scrolled');
            else                     tb.classList.remove('scrolled');
        };
        apply();
        window.addEventListener('scroll', apply, { passive: true });
    })();

    // Wrap every letter of the brand name in <span class="bl"> so we can
    // animate them one-by-one on hover (sequential wave + tilt + colour).
    (function wrapBrandLetters() {
        document.querySelectorAll('.brand-line1, .brand-line2').forEach(line => {
            const text = line.textContent;
            line.innerHTML = '';
            for (const ch of text) {
                if (ch === ' ') {
                    // Preserve normal spacing — empty span won't animate but keeps gap
                    const sp = document.createElement('span');
                    sp.className = 'bl';
                    sp.style.width = '.35em';
                    sp.innerHTML = '&nbsp;';
                    line.appendChild(sp);
                } else {
                    const sp = document.createElement('span');
                    sp.className = 'bl';
                    sp.textContent = ch;
                    line.appendChild(sp);
                }
            }
        });
    })();

    // ── Move .topbar-contact (phone+email) BELOW the search bar ─
    // On the home page we drop it just under the .mmt-searchbar in the
    // hero section. On every other page we drop it just below the topbar
    // so users can still see the numbers without crowding the header.
    (function relocateContactStrip() {
        const tc = document.querySelector('.topbar > .topbar-contact');
        if (!tc) return;
        const parent = tc.parentElement;
        // Pull it out of the topbar
        parent.removeChild(tc);
        tc.classList.add('contact-strip-floating');
        const searchBar = document.querySelector('.mmt-searchbar');
        if (searchBar && searchBar.parentElement) {
            // Place AFTER the search bar in the hero
            searchBar.parentElement.insertBefore(tc, searchBar.nextSibling);
        } else {
            // Fallback: pin it just under the topbar
            tc.style.position = 'fixed';
            tc.style.top      = 'calc(var(--tb-h) - 0.4rem)';
            tc.style.right    = '1rem';
            tc.style.zIndex   = '88';
            document.body.appendChild(tc);
        }
    })();

    // User menu is now built by js/user-menu.js (loaded from every page)
    document.addEventListener('click', (e) => {
        if (!document.body.classList.contains('nav-open')) return;
        const topnav = document.getElementById('topnav');
        if (topnav && topnav.contains(e.target)) {
            // Clicked a nav link → close menu
            if (e.target.closest('.topnav-item')) document.body.classList.remove('nav-open');
            return;
        }
        if (hamburgerBtn && !hamburgerBtn.contains(e.target)) {
            document.body.classList.remove('nav-open');
        }
    });

    // Top nav active-state highlight on click
    document.querySelectorAll('.topnav-item').forEach(a => {
        a.addEventListener('click', function () {
            // Don't toggle for CTAs (Login/Sign Up) or non-hash links
            if (this.classList.contains('topnav-cta')) return;
            const href = this.getAttribute('href');
            if (!href || !href.startsWith('#')) return;
            document.querySelectorAll('.topnav-item').forEach(x => x.classList.remove('active'));
            this.classList.add('active');
        });
    });

    // Bookings section: wire Login + Register buttons
    const bookingsLoginBtn = document.getElementById('bookingsLoginBtn');
    if (bookingsLoginBtn) bookingsLoginBtn.addEventListener('click', () => window.openLogin && window.openLogin());
    const bookingsRegisterBtn = document.getElementById('bookingsRegisterBtn');
    if (bookingsRegisterBtn) bookingsRegisterBtn.addEventListener('click', () => window.openRegister && window.openRegister());

    // Bookings tabs (All / Upcoming / Completed / Cancelled)
    document.querySelectorAll('.bk-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.bk-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            // Render filtered bookings if the data is available
            if (window.renderBookings) {
                window.renderBookings(tab.dataset.bkFilter || 'all');
            }
        });
    });

    // Toggle logged-out vs logged-in state in the Bookings section
    function refreshBookingsSection() {
        const loggedOut = document.getElementById('bookingsLoggedOut');
        const loggedIn  = document.getElementById('bookingsLoggedIn');
        const isLoggedIn = !!localStorage.getItem('token') || !!window.currentUser;
        if (loggedOut) loggedOut.style.display = isLoggedIn ? 'none' : '';
        if (loggedIn)  loggedIn.style.display  = isLoggedIn ? '' : 'none';
        if (isLoggedIn && window.loadAndRenderUserBookings) {
            window.loadAndRenderUserBookings();
        }
    }
    refreshBookingsSection();
    // Re-run when login/logout occurs
    window.addEventListener('storage', refreshBookingsSection);
    document.addEventListener('auth:changed', refreshBookingsSection);

    // 🔁 Auto-resume booking after successful login
    document.addEventListener('auth:changed', () => {
        try {
            const raw = sessionStorage.getItem('postLoginIntent');
            if (!raw) return;
            const intent = JSON.parse(raw);
            // Ignore stale intents (older than 30 minutes)
            if (!intent || (Date.now() - (intent.ts || 0)) > 30 * 60 * 1000) {
                sessionStorage.removeItem('postLoginIntent');
                return;
            }
            sessionStorage.removeItem('postLoginIntent');
            if (intent.type === 'checkout') {
                if (window.Toast) window.Toast.success('Welcome back! Redirecting to checkout…');
                setTimeout(() => { window.location.href = '/checkout'; }, 600);
                return;
            }
            if (intent.type === 'book' && intent.pkg && typeof window.bookPackage === 'function') {
                // Small delay so login modal has time to close cleanly
                setTimeout(() => window.bookPackage(intent.pkg), 250);
            }
        } catch (e) { console.warn('postLoginIntent resume failed:', e); }
    });

    // Sign Up nav link
    const signUpNavLink = document.getElementById('signUpNavLink');
    if (signUpNavLink) {
        signUpNavLink.addEventListener('click', (e) => { e.preventDefault(); window.openRegister(); });
    }

    // Add event listener for Login/Profile button
    const loginLink = document.getElementById('authLink');
    if (loginLink) {
        // Update listener based on login state
        const updateAuthLinkListener = () => {
            if (loginLink.onclick) loginLink.onclick = null;
            loginLink.addEventListener('click', (e) => {
                e.preventDefault();
                // Check for token or currentUser
                const hasToken = localStorage.getItem('token');
                if (hasToken || window.currentUser) {
                    window.openProfile();
                } else {
                    window.openLogin();
                }
            });
        };
        
        // Set up listener after a short delay to allow auth.js to load
        setTimeout(updateAuthLinkListener, 100);
        
        // Re-update listener when auth state changes
        const originalLogin = window.login;
        window.login = function(...args) {
            const result = originalLogin.apply(this, args);
            setTimeout(updateAuthLinkListener, 100);
            return result;
        };
        
        const originalLogout = window.logout;
        window.logout = function(...args) {
            originalLogout.apply(this, args);
            setTimeout(updateAuthLinkListener, 100);
        };
    }

    // Close buttons — handle both old .close class and new data-close attribute
    document.querySelectorAll('.close, [data-close]').forEach(btn => {
        btn.addEventListener('click', () => {
            const modalId = btn.dataset.close;
            if (modalId) {
                const m = document.getElementById(modalId);
                if (m) m.style.display = 'none';
            } else {
                const modal = btn.closest('.modal');
                if (modal) modal.style.display = 'none';
            }
        });
    });

    // In-form navigation links
    const goToRegister = document.getElementById('goToRegister');
    if (goToRegister) goToRegister.addEventListener('click', (e) => { e.preventDefault(); window.closeLogin && window.closeLogin(); window.openRegister(); });

    const goToLogin = document.getElementById('goToLogin');
    if (goToLogin) goToLogin.addEventListener('click', (e) => { e.preventDefault(); window.closeRegister && window.closeRegister(); window.openLogin(); });

    // Smooth scrolling
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            // Skip if href is just "#" or empty, or if link has onclick handler
            if ((href === '#' || !href) || this.getAttribute('onclick')) {
                e.preventDefault();
                return;
            }
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    // ── MMT-style listing event wiring ─────────────────────────
    // Tab clicks (All / Budget / Honeymoon / Premium / Standard)
    document.querySelectorAll('#mmtTabs .mmt-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('#mmtTabs .mmt-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            mmtState.cat = tab.dataset.cat || 'all';
            renderSitePackages();
        });
    });

    // Tab arrow scroll
    document.querySelectorAll('#mmtTabs [data-tab-scroll]').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabs = document.getElementById('mmtTabs');
            if (!tabs) return;
            tabs.scrollBy({ left: btn.dataset.tabScroll === 'right' ? 200 : -200, behavior: 'smooth' });
        });
    });

    // Filter group accordion + checkbox changes
    document.querySelectorAll('.mmt-filter-group').forEach(group => {
        const head = group.querySelector('.mmt-filter-head');
        if (head) {
            head.addEventListener('click', () => group.classList.toggle('open'));
        }
    });
    document.querySelectorAll('#mmtFilters input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
            const name = cb.name; // 'dur' | 'budget' | 'hotel' | 'theme'
            if (!Array.isArray(mmtState[name])) mmtState[name] = [];
            if (cb.checked) {
                if (!mmtState[name].includes(cb.value)) mmtState[name].push(cb.value);
            } else {
                mmtState[name] = mmtState[name].filter(v => v !== cb.value);
            }
            renderSitePackages();
        });
    });

    // ── Filters: 'Clear All' + sticky Compare bar wiring ─────────
    const clearBtn = document.getElementById('mmtFiltersClear');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            document.querySelectorAll('#mmtFilters input[type="checkbox"]').forEach(cb => {
                cb.checked = false;
            });
            mmtState.dur = []; mmtState.budget = []; mmtState.hotel = []; mmtState.theme = [];
            renderSitePackages();
        });
    }

    // Compare bar — collects checked packages and shows a sticky bar at
    // the bottom. The "Compare" button links to a basic comparison view
    // (alert with package names for now — full compare modal can come
    // later if asked for).
    window._compareIds = window._compareIds || new Set();
    window._refreshCompareBar = function () {
        const bar = document.getElementById('v2CompareBar');
        const count = document.getElementById('v2CompareCount');
        if (!bar || !count) return;
        // Sync our Set with what's currently checked in the DOM (cards
        // get re-rendered on filter/sort changes).
        document.querySelectorAll('.v2-compare-cb').forEach(cb => {
            cb.checked = window._compareIds.has(cb.dataset.pkgid);
        });
        const n = window._compareIds.size;
        count.textContent = n;
        if (n >= 2) bar.classList.add('is-on'); else bar.classList.remove('is-on');
    };
    document.addEventListener('change', (e) => {
        const cb = e.target.closest('.v2-compare-cb');
        if (!cb) return;
        const id = cb.dataset.pkgid;
        if (cb.checked) window._compareIds.add(id); else window._compareIds.delete(id);
        // Cap at 3 — un-check any older selection so we don't accumulate forever.
        if (window._compareIds.size > 3) {
            const first = window._compareIds.values().next().value;
            window._compareIds.delete(first);
        }
        window._refreshCompareBar();
    });
    const compareBtn = document.getElementById('v2CompareGo');
    if (compareBtn) {
        compareBtn.addEventListener('click', () => {
            const ids = Array.from(window._compareIds);
            const list = ids.map(id => {
                const pkg = (window._packages || []).find(p => p.id === id);
                return pkg ? `• ${pkg.name} — ₹${Number(pkg.price).toLocaleString()}/person` : id;
            }).join('\n');
            alert('Comparing ' + ids.length + ' packages:\n\n' + list +
                '\n\nUse the package detail pages to compare in depth — full side-by-side comparison view is coming soon.');
        });
    }
    // View toggle (Grid / List)
    (function () {
        const grid = document.getElementById('packagesGrid');
        if (!grid) return;
        const buttons = document.querySelectorAll('.mmt-view-toggle .view-btn');
        function applyView(view) {
            grid.classList.remove('view-grid', 'view-list');
            grid.classList.add(view === 'list' ? 'view-list' : 'view-grid');
            buttons.forEach(b => b.classList.toggle('active', b.dataset.view === view));
            try { localStorage.setItem('pkgView', view); } catch (e) {}
        }
        // Restore preference
        const saved = (function () { try { return localStorage.getItem('pkgView'); } catch (e) { return null; } })();
        if (saved === 'list' || saved === 'grid') applyView(saved);
        buttons.forEach(b => b.addEventListener('click', () => applyView(b.dataset.view)));
    })();

    // Sort dropdown
    const mmtSort = document.getElementById('mmtSort');
    if (mmtSort) {
        mmtSort.addEventListener('change', () => {
            mmtState.sort = mmtSort.value;
            renderSitePackages();
        });
    }

    // Search button (top navy bar) — captures search criteria
    // ── Phase 3 — MMT-style hero search ─────────────────────────
    // Default the travel date to today + 30 days so the field is never empty
    // when a visitor lands on the homepage. Pre-applies any existing query
    // string (?from=…&date=…&adults=…&children=…&category=…) so a search
    // result URL can be shared / bookmarked.
    (function initMmtSearchDefaults() {
        // The next 10 days are blocked at checkout (sold out). Mirror
        // that on the homepage search bar so the user can't pick an
        // unbookable date here either.
        const MIN_LEAD_DAYS = 10;
        function earliestISO() {
            const d = new Date();
            d.setHours(0, 0, 0, 0);
            d.setDate(d.getDate() + MIN_LEAD_DAYS);
            return d.getFullYear() + '-' +
                String(d.getMonth() + 1).padStart(2, '0') + '-' +
                String(d.getDate()).padStart(2, '0');
        }
        const dateEl = document.getElementById('mmtDate');
        if (dateEl && !dateEl.value) {
            // Default — day 11 from today (matches checkout default).
            dateEl.value = earliestISO();
        }
        if (dateEl) dateEl.min = earliestISO();

        // Read query params and hydrate fields. Honoured: from, date, adults,
        // children, category. Unknown values are quietly ignored.
        let params;
        try { params = new URLSearchParams(location.search); } catch (e) { return; }
        const setVal = (id, v) => {
            if (v == null || v === '') return;
            const el = document.getElementById(id);
            if (!el) return;
            // For <select>, only set if the option exists
            if (el.tagName === 'SELECT') {
                const has = Array.prototype.some.call(el.options, o => o.value === v);
                if (has) el.value = v;
            } else {
                el.value = v;
            }
        };
        setVal('mmtFrom',     params.get('from'));
        setVal('mmtDate',     params.get('date'));
        setVal('mmtAdults',   params.get('adults'));
        setVal('mmtChildren', params.get('children'));
        const cat = (params.get('category') || '').toLowerCase();
        if (cat) {
            setVal('mmtCategory', cat);
            // Apply to mmtState immediately so the first render filters
            const allowed = ['all', 'budget', 'standard', 'deluxe', 'luxury', 'royal', 'honeymoon'];
            if (allowed.indexOf(cat) >= 0) {
                mmtState.cat = cat;
                document.querySelectorAll('#mmtTabs .mmt-tab').forEach(t => {
                    t.classList.toggle('active', t.dataset.cat === cat);
                });
            }
        }
    })();

    // ── Combined Travellers picker (Adults 12y+ / Children <12) ──
    // Replaces the previous separate <select>s on the homepage hero.
    // Maintains the hidden #mmtAdults / #mmtChildren mirrors so the
    // SEARCH handler + URL prefill logic keeps working unchanged.
    (function wireTravellersPicker() {
        const field    = document.getElementById('mmtTravellersField');
        const trigger  = document.getElementById('mmtTravellersTrigger');
        const pop      = document.getElementById('mmtTravellersPop');
        const txt      = document.getElementById('mmtTravellersText');
        const adultsIn = document.getElementById('mmtAdults');
        const childrIn = document.getElementById('mmtChildren');
        const adultsNm = document.getElementById('mmtTrvAdultsNum');
        const childrNm = document.getElementById('mmtTrvChildrenNum');
        const doneBtn  = document.getElementById('mmtTrvDone');
        if (!field || !trigger || !pop || !adultsIn || !childrIn) return;

        const MAX_ADULTS   = 9;
        const MAX_CHILDREN = 6;

        function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n | 0)); }
        function getCounts() {
            return {
                adults:   clamp(parseInt(adultsIn.value, 10) || 0, 1, MAX_ADULTS),
                children: clamp(parseInt(childrIn.value, 10) || 0, 0, MAX_CHILDREN)
            };
        }
        function render() {
            const c = getCounts();
            adultsIn.value = c.adults;
            childrIn.value = c.children;
            if (adultsNm) adultsNm.textContent = c.adults;
            if (childrNm) childrNm.textContent = c.children;

            // Visible label — "2 Adults" or "2 Adults, 1 Child"
            let label = c.adults + ' Adult' + (c.adults === 1 ? '' : 's');
            if (c.children > 0) {
                label += ', ' + c.children + ' Child' + (c.children === 1 ? '' : 'ren');
            }
            if (txt) txt.textContent = label;

            // Disable +/- when at limits
            pop.querySelectorAll('.mmt-trv-btn').forEach(btn => {
                const target = btn.dataset.target;
                const act    = btn.dataset.act;
                const cur    = target === 'adults' ? c.adults : c.children;
                const lo     = target === 'adults' ? 1 : 0;
                const hi     = target === 'adults' ? MAX_ADULTS : MAX_CHILDREN;
                btn.disabled = (act === 'dec' && cur <= lo) || (act === 'inc' && cur >= hi);
            });
        }

        function open() {
            pop.hidden = false;
            field.classList.add('is-open');
            trigger.setAttribute('aria-expanded', 'true');
        }
        function close() {
            pop.hidden = true;
            field.classList.remove('is-open');
            trigger.setAttribute('aria-expanded', 'false');
        }
        function toggle() { pop.hidden ? open() : close(); }

        trigger.addEventListener('click', function (ev) {
            ev.stopPropagation();
            toggle();
        });
        pop.addEventListener('click', function (ev) { ev.stopPropagation(); });
        document.addEventListener('click', function (ev) {
            if (pop.hidden) return;
            if (!field.contains(ev.target)) close();
        });
        document.addEventListener('keydown', function (ev) {
            if (ev.key === 'Escape' && !pop.hidden) close();
        });

        pop.querySelectorAll('.mmt-trv-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                const target = btn.dataset.target;
                const act    = btn.dataset.act;
                const c      = getCounts();
                if (target === 'adults') {
                    c.adults = clamp(c.adults + (act === 'inc' ? 1 : -1), 1, MAX_ADULTS);
                    adultsIn.value = c.adults;
                } else if (target === 'children') {
                    c.children = clamp(c.children + (act === 'inc' ? 1 : -1), 0, MAX_CHILDREN);
                    childrIn.value = c.children;
                }
                render();
            });
        });

        if (doneBtn) doneBtn.addEventListener('click', close);

        render();
    })();

    const mmtSearchBtn = document.getElementById('mmtSearchBtn');
    if (mmtSearchBtn) {
        mmtSearchBtn.addEventListener('click', () => {
            const fromEl = document.getElementById('mmtFrom');
            const dateEl = document.getElementById('mmtDate');
            const adultsEl = document.getElementById('mmtAdults');
            const childrenEl = document.getElementById('mmtChildren');
            const categoryEl = document.getElementById('mmtCategory');

            const from = fromEl ? fromEl.value.trim() : '';
            const date = dateEl ? dateEl.value : '';
            const adults = adultsEl ? parseInt(adultsEl.value, 10) : 2;
            const children = childrenEl ? parseInt(childrenEl.value, 10) : 0;
            const category = categoryEl ? (categoryEl.value || 'all').toLowerCase() : 'all';

            if (!from) {
                alert('Please enter your travelling-from city.');
                if (fromEl) fromEl.focus();
                return;
            }
            if (!date) {
                alert('Please select a travel date.');
                if (dateEl) dateEl.focus();
                return;
            }

            // Persist search context for downstream use (booking/customize flow)
            window.searchContext = {
                from, to: 'Andaman', date, adults, children, category,
                totalPersons: adults + children
            };
            try { sessionStorage.setItem('searchContext', JSON.stringify(window.searchContext)); } catch (e) {}

            // GA4 — search event
            try {
                window.Analytics && window.Analytics.search(`${from} → Andaman | ${date} | ${adults}A${children}C | ${category}`);
            } catch (e) {}

            // Push the search params to the URL so the result is shareable
            // and survives reload. We use replaceState so the back button
            // still goes to wherever the visitor came from.
            try {
                const next = new URLSearchParams();
                if (from)     next.set('from', from);
                if (date)     next.set('date', date);
                if (adults)   next.set('adults', String(adults));
                if (children) next.set('children', String(children));
                if (category && category !== 'all') next.set('category', category);
                const qs = next.toString();
                history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + '#packages');
            } catch (e) {}

            // Apply category filter and refresh, then scroll into view
            mmtState.cat = category || 'all';
            document.querySelectorAll('#mmtTabs .mmt-tab').forEach(t => {
                t.classList.toggle('active', t.dataset.cat === mmtState.cat);
            });
            renderSitePackages();
            const grid = document.getElementById('packagesGrid');
            if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    // Card click delegation (Book / Customize / Enquire / View Details)
    const grid = document.getElementById('packagesGrid');
    if (grid) {
        grid.addEventListener('click', (e) => {
            const bookBtn = e.target.closest('[data-action="book"]');
            if (bookBtn) { e.stopPropagation(); window.bookPackage(bookBtn.dataset.pkg); return; }
            const enqBtn = e.target.closest('[data-action="enquire"]');
            if (enqBtn) {
                e.stopPropagation();
                const pkgId = enqBtn.dataset.pkg;
                const pkg = (window._packages || []).find(p => p.id === pkgId);
                const name = pkg ? pkg.name : pkgId;
                alert(
                    '⚠️ "' + name + '" is currently SOLD OUT.\n\n' +
                    'Drop us a line to be notified when this package is available again, ' +
                    'or to ask about similar packages with open dates:\n\n' +
                    '📞 +91 88801 95191 / +91 94341 25698\n' +
                    '📧 booking@andamanvoyages.in'
                );
                return;
            }
            const custBtn = e.target.closest('[data-action="customize"]');
            if (custBtn) { e.stopPropagation(); window.openCustomize(custBtn.dataset.pkg); return; }
            const detailsBtn = e.target.closest('[data-action="details"]');
            if (detailsBtn) { e.stopPropagation(); window.location.href = '/package?id=' + detailsBtn.dataset.pkg; return; }
            const navEl = e.target.closest('[data-nav]');
            if (navEl) { window.location.href = '/package?id=' + navEl.dataset.nav; return; }
        });
    }

    // Legacy compatibility (in case old #packageSearch / #sortSelect still exist)
    const packageSearch = document.getElementById('packageSearch');
    if (packageSearch) {
        packageSearch.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase();
            document.querySelectorAll('#packagesGrid .mmt-card, #packagesGrid .package-card').forEach(card => {
                const name = (card.getAttribute('data-name') || '').toLowerCase();
                card.style.display = name.includes(q) ? '' : 'none';
            });
        });
    }

    // Form handlers for auth
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            window.login(email, password).catch(err => alert(err.message || 'Login failed'));
        });
    }

    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const fullName = (document.getElementById('regFullName') || {}).value || '';
            const username = document.getElementById('regUsername').value;
            const email    = document.getElementById('regEmail').value;
            const phone    = (document.getElementById('regPhone') || {}).value || '';
            const password = document.getElementById('regPassword').value;
            window.register({ username, email, password, fullName, phone })
                .catch(err => alert(err.message || 'Registration failed'));
        });
    }

    // Customization form
    const checkboxes = document.querySelectorAll('#customForm input[type="checkbox"]');
    checkboxes.forEach(cb => cb.addEventListener('change', updateTotal));

    // Proceed to Payment button (in customize modal)
    const proceedPaymentBtn = document.getElementById('proceedPaymentBtn');
    if (proceedPaymentBtn) proceedPaymentBtn.addEventListener('click', window.proceedToPayment);

    // Confirm Booking / Pay Now button (in payment modal)
    const confirmBookingBtn = document.getElementById('confirmBookingBtn');
    if (confirmBookingBtn) confirmBookingBtn.addEventListener('click', window.confirmBooking);

    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', () => window.logout && window.logout());

    // Close modals on outside click
    window.onclick = function(event) {
        const customizeModal = document.getElementById('customizeModal');
        const paymentModal = document.getElementById('paymentModal');
        const loginModal = document.getElementById('loginModal');
        const registerModal = document.getElementById('registerModal');
        const profileModal = document.getElementById('profileModal');
        if (event.target == customizeModal) customizeModal.style.display = 'none';
        if (event.target == paymentModal) paymentModal.style.display = 'none';
        if (event.target == loginModal) loginModal.style.display = 'none';
        if (event.target == registerModal) registerModal.style.display = 'none';
        if (event.target == profileModal) profileModal.style.display = 'none';
    }
});
