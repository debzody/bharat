/* ── gallery-page.js ─────────────────────────────────────────────
   Public gallery page logic:
   - Loads items via window.GalleryStore.loadGalleryItems()
   - Category chip filter
   - Group by (none | year | month | place | package | category)
   - Sort by (date / title / place / order)
   - Lightbox with prev/next
   ─────────────────────────────────────────────────────────────── */

(function () {
    'use strict';

    const grid       = document.getElementById('galleryGrid');
    const filtersEl  = document.getElementById('galleryFilters');
    const statusEl   = document.getElementById('galleryStatus');
    const groupByEl  = document.getElementById('groupBy');
    const sortByEl   = document.getElementById('sortBy');
    const lightbox   = document.getElementById('galleryLightbox');
    const lbImage    = document.getElementById('lbImage');
    const lbCaption  = document.getElementById('lbCaption');
    const lbClose    = document.getElementById('lbClose');
    const lbPrev     = document.getElementById('lbPrev');
    const lbNext     = document.getElementById('lbNext');

    if (!grid) return; // not on the gallery page

    const MONTHS = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];

    let allItems = [];          // raw items from the store
    let filteredItems = [];     // after the category chip filter
    let lbList = [];            // flat list reflecting current display order
    let lbIndex = 0;
    let activeCat = 'all';

    // Read deep-link params:
    //   ?category=<exact-category-name> → pre-select that filter chip
    //   ?place=<exact-place-name>       → pre-select chip whose
    //                                     category matches the place
    // Both are case-insensitive. Used by the "Where do you want to wake
    // up?" section on the homepage to deep-link straight into a filtered
    // gallery view (e.g. /gallery?category=Havelock+Island).
    let initialFilterRequest = '';
    try {
        const params = new URLSearchParams(location.search);
        initialFilterRequest =
            (params.get('category') || params.get('place') || '').trim();
    } catch (e) {}

    // Restore user preferences
    try {
        const savedGroup = localStorage.getItem('galleryGroupBy');
        const savedSort  = localStorage.getItem('gallerySortBy');
        if (savedGroup && groupByEl) groupByEl.value = savedGroup;
        if (savedSort  && sortByEl)  sortByEl.value  = savedSort;
    } catch (e) {}

    // ── helpers ────────────────────────────────────────────────
    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[c]));
    }

    function getItemDate(item) {
        if (item.date) {
            const d = new Date(item.date);
            if (!isNaN(d.getTime())) return d;
        }
        if (item.createdAt && typeof item.createdAt.toDate === 'function') {
            try { return item.createdAt.toDate(); } catch (_) {}
        }
        if (item.createdAt && typeof item.createdAt.toMillis === 'function') {
            return new Date(item.createdAt.toMillis());
        }
        return null;
    }

    function compareItems(a, b, sortKey) {
        const da = getItemDate(a);
        const db = getItemDate(b);
        const ta = da ? da.getTime() : 0;
        const tb = db ? db.getTime() : 0;
        switch (sortKey) {
            case 'date_asc':   return ta - tb;
            case 'date_desc':  return tb - ta;
            case 'title_asc':  return (a.title || '').localeCompare(b.title || '');
            case 'title_desc': return (b.title || '').localeCompare(a.title || '');
            case 'place_asc':  return (a.place || '').localeCompare(b.place || '');
            case 'order_asc':  return (a.order || 0) - (b.order || 0);
            default:           return tb - ta;
        }
    }

    function getGroupKey(item, groupBy) {
        const d = getItemDate(item);
        switch (groupBy) {
            case 'year':
                return d ? String(d.getFullYear()) : 'Undated';
            case 'month':
                if (!d) return 'Undated';
                return MONTHS[d.getMonth()] + ' ' + d.getFullYear();
            case 'place':
                return (item.place || '').trim() || 'Other';
            case 'package':
                return (item.packageRef || '').trim() || 'Other';
            case 'category':
                return (item.category || '').trim() || 'Other';
            default:
                return '';
        }
    }

    // Sort group headings sensibly
    function compareGroupKeys(a, b, groupBy) {
        // Move "Undated" / "Other" to the end
        const tail = ['Undated', 'Other'];
        const aTail = tail.indexOf(a) >= 0;
        const bTail = tail.indexOf(b) >= 0;
        if (aTail && !bTail) return  1;
        if (bTail && !aTail) return -1;
        if (aTail && bTail)  return a.localeCompare(b);

        if (groupBy === 'year') {
            return parseInt(b, 10) - parseInt(a, 10); // newest year first
        }
        if (groupBy === 'month') {
            // Parse "Month YYYY" → newest first
            const parse = (s) => {
                const parts = s.split(' ');
                const m = MONTHS.indexOf(parts[0]);
                const y = parseInt(parts[1], 10);
                return (isNaN(y) ? 0 : y) * 100 + (m < 0 ? 0 : m);
            };
            return parse(b) - parse(a);
        }
        return a.localeCompare(b);
    }

    // ── filter chips ───────────────────────────────────────────
    function renderFilters(cats) {
        filtersEl.innerHTML = '';

        // If the URL asked for a specific category/place, look for a
        // matching chip (case-insensitive) so we can mark it active
        // instead of "All".
        const want = (initialFilterRequest || '').toLowerCase();
        let matched = '';
        if (want) {
            for (const c of cats) {
                if (String(c).toLowerCase() === want) { matched = c; break; }
            }
        }

        const allChip = document.createElement('button');
        allChip.className = 'gallery-chip' + (matched ? '' : ' active');
        allChip.dataset.cat = 'all';
        allChip.textContent = 'All';
        filtersEl.appendChild(allChip);
        cats.forEach(cat => {
            const chip = document.createElement('button');
            chip.className = 'gallery-chip' + (matched === cat ? ' active' : '');
            chip.dataset.cat = cat;
            chip.textContent = cat;
            filtersEl.appendChild(chip);
        });

        // Sync the activeCat module-state so the first applyFiltersAndRender()
        // call uses the URL-requested filter.
        activeCat = matched || 'all';

        // If matched, scroll the chip into view (helps on mobile where
        // the chip strip might overflow horizontally).
        if (matched) {
            try {
                const activeEl = filtersEl.querySelector('.gallery-chip.active');
                if (activeEl && activeEl.scrollIntoView) {
                    activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                }
            } catch (e) {}
        }
    }

    // Material-style ripple effect on chip click
    function spawnRipple(chip, e) {
        try {
            const r = chip.getBoundingClientRect();
            const size = Math.max(r.width, r.height);
            const ripple = document.createElement('span');
            ripple.className = 'gal-ripple';
            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = (e.clientX - r.left - size / 2) + 'px';
            ripple.style.top  = (e.clientY - r.top  - size / 2) + 'px';
            chip.appendChild(ripple);
            setTimeout(() => { try { ripple.remove(); } catch (_) {} }, 700);
        } catch (_) {}
    }

    if (filtersEl) {
        filtersEl.addEventListener('click', (e) => {
            const chip = e.target.closest('.gallery-chip');
            if (!chip) return;
            spawnRipple(chip, e);
            filtersEl.querySelectorAll('.gallery-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            activeCat = chip.dataset.cat;
            applyFiltersAndRender();
        });
    }

    // ── motion preferences (respect reduced-motion users) ─────
    const prefersReducedMotion =
        window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isTouchDevice =
        ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    // ── scroll-triggered reveal observer (staggered fade-in-up)
    const tileObserver = ('IntersectionObserver' in window) ? new IntersectionObserver((entries) => {
        entries.forEach((entry, i) => {
            if (entry.isIntersecting) {
                const el = entry.target;
                // Slight stagger based on element's position in its row group
                const idx = parseInt(el.dataset.galIdx || '0', 10);
                const delay = Math.min(idx % 12, 11) * 60; // cap stagger
                el.style.animationDelay = delay + 'ms';
                el.classList.add('gal-in');
                tileObserver.unobserve(el);
            }
        });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }) : null;

    // ── tile builder ───────────────────────────────────────────
    function buildTile(item, lbIdx) {
        const tile = document.createElement('div');
        tile.className = 'gallery-tile';
        tile.dataset.galIdx = String(lbIdx);
        const altText = (item.title || 'Andaman photo').replace(/"/g, '&quot;');
        const titleHtml = item.title
            ? '<div class="gallery-tile-caption">' + escapeHtml(item.title) + '</div>'
            : '';
        tile.innerHTML =
            '<img loading="lazy" src="' + escapeHtml(item.thumbUrl || item.url) + '" alt="' + escapeHtml(altText) + '">' +
            '<div class="gallery-tile-overlay" aria-hidden="true"></div>' +
            '<span class="gallery-tile-view"><i class="fas fa-arrow-right"></i> View</span>' +
            titleHtml;
        tile.addEventListener('click', () => openLightbox(lbIdx));

        // 3D mouse-follow tilt — desktop & motion-OK only
        if (!prefersReducedMotion && !isTouchDevice) {
            tile.addEventListener('mousemove', (e) => {
                const r = tile.getBoundingClientRect();
                const px = (e.clientX - r.left) / r.width;
                const py = (e.clientY - r.top) / r.height;
                const ry = (px - 0.5) *  8;   // rotateY
                const rx = (0.5 - py) *  8;   // rotateX
                tile.style.setProperty('--tilt-x', rx.toFixed(2) + 'deg');
                tile.style.setProperty('--tilt-y', ry.toFixed(2) + 'deg');
            });
            tile.addEventListener('mouseleave', () => {
                tile.style.setProperty('--tilt-x', '0deg');
                tile.style.setProperty('--tilt-y', '0deg');
            });
        }

        // Observe for scroll-triggered entrance
        if (tileObserver) {
            tileObserver.observe(tile);
        } else {
            // Fallback: just show it
            tile.classList.add('gal-in');
        }

        return tile;
    }

    // ── main render ────────────────────────────────────────────
    function renderGrid() {
        grid.innerHTML = '';
        lbList = [];

        if (!filteredItems.length) {
            grid.innerHTML =
                '<div class="gallery-empty" style="grid-column:1/-1;">' +
                '<i class="fas fa-image"></i>' +
                '<h3>No photos yet</h3>' +
                '<p>Check back soon — we’re adding new shots from recent tours.</p>' +
                '</div>';
            return;
        }

        const sortKey = sortByEl ? sortByEl.value : 'date_desc';
        const groupBy = groupByEl ? groupByEl.value : 'none';

        // Sort first (within groups too)
        const sorted = filteredItems.slice().sort((a, b) => compareItems(a, b, sortKey));

        if (groupBy === 'none') {
            sorted.forEach((item) => {
                const idx = lbList.length;
                lbList.push(item);
                grid.appendChild(buildTile(item, idx));
            });
            return;
        }

        // Group items
        const groups = {};
        sorted.forEach(item => {
            const key = getGroupKey(item, groupBy);
            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
        });

        const keys = Object.keys(groups).sort((a, b) => compareGroupKeys(a, b, groupBy));

        keys.forEach(key => {
            const items = groups[key];

            // Group heading row
            const header = document.createElement('div');
            header.className = 'gallery-group-header';
            header.innerHTML =
                '<h2><span class="ggh-key">' + escapeHtml(key) + '</span> ' +
                '<span class="ggh-count">' + items.length + ' photo' + (items.length === 1 ? '' : 's') + '</span></h2>';
            grid.appendChild(header);

            // Group tile container
            const groupGrid = document.createElement('div');
            groupGrid.className = 'gallery-group-grid';
            items.forEach(item => {
                const idx = lbList.length;
                lbList.push(item);
                groupGrid.appendChild(buildTile(item, idx));
            });
            grid.appendChild(groupGrid);
        });
    }

    function applyFiltersAndRender() {
        filteredItems = (activeCat === 'all')
            ? allItems.slice()
            : allItems.filter(it => (it.category || '').toLowerCase() === activeCat.toLowerCase());
        renderGrid();
    }

    // ── group / sort change ────────────────────────────────────
    if (groupByEl) {
        groupByEl.addEventListener('change', () => {
            try { localStorage.setItem('galleryGroupBy', groupByEl.value); } catch (e) {}
            renderGrid();
        });
    }
    if (sortByEl) {
        sortByEl.addEventListener('change', () => {
            try { localStorage.setItem('gallerySortBy', sortByEl.value); } catch (e) {}
            renderGrid();
        });
    }

    // ── lightbox ───────────────────────────────────────────────
    function openLightbox(idx) {
        if (!lbList.length) return;
        lbIndex = idx;
        showLightboxImage();
        lightbox.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
    function closeLightbox() {
        lightbox.classList.remove('open');
        document.body.style.overflow = '';
    }
    function showLightboxImage() {
        const item = lbList[lbIndex];
        if (!item) return;
        lbImage.src = item.url;
        lbImage.alt = item.title || 'Andaman photo';

        // Build a rich caption that includes any tagged metadata
        const captionBits = [];
        if (item.title)      captionBits.push('<strong>' + escapeHtml(item.title) + '</strong>');
        if (item.caption)    captionBits.push(escapeHtml(item.caption));
        const meta = [];
        if (item.place)      meta.push('📍 ' + escapeHtml(item.place));
        if (item.date)       meta.push('📅 ' + escapeHtml(item.date));
        if (item.packageRef) meta.push('🎫 ' + escapeHtml(item.packageRef));
        if (meta.length)     captionBits.push('<span class="lb-meta">' + meta.join(' &nbsp;·&nbsp; ') + '</span>');

        if (captionBits.length) {
            lbCaption.innerHTML = captionBits.join(' — ');
            lbCaption.style.display = '';
        } else {
            lbCaption.innerHTML = '';
            lbCaption.style.display = 'none';
        }
    }
    function nextImg() { if (!lbList.length) return; lbIndex = (lbIndex + 1) % lbList.length; showLightboxImage(); }
    function prevImg() { if (!lbList.length) return; lbIndex = (lbIndex - 1 + lbList.length) % lbList.length; showLightboxImage(); }

    if (lbClose) lbClose.addEventListener('click', closeLightbox);
    if (lbNext)  lbNext.addEventListener('click', nextImg);
    if (lbPrev)  lbPrev.addEventListener('click', prevImg);
    if (lightbox) lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
    document.addEventListener('keydown', (e) => {
        if (!lightbox || !lightbox.classList.contains('open')) return;
        if (e.key === 'Escape')      closeLightbox();
        if (e.key === 'ArrowRight')  nextImg();
        if (e.key === 'ArrowLeft')   prevImg();
    });

    // ── init ───────────────────────────────────────────────────
    async function init() {
        if (statusEl) statusEl.style.display = '';
        try {
            allItems = await window.GalleryStore.loadGalleryItems();
            // Drop photos the admin has hidden from the public gallery
            // (hidden flag is toggled from the dashboard's gallery cards).
            // Cloudinary still holds the asset; we just don't render it here.
            allItems = allItems.filter(i => i && i.hidden !== true);
            const cats = Array.from(new Set(
                allItems.map(i => (i.category || '').trim()).filter(Boolean)
            )).sort();
            renderFilters(cats);
            applyFiltersAndRender();
        } catch (err) {
            console.error('Gallery load failed:', err);
            grid.innerHTML =
                '<div class="gallery-empty" style="grid-column:1/-1;">' +
                '<i class="fas fa-exclamation-triangle"></i>' +
                '<h3>Couldn’t load gallery</h3>' +
                '<p>' + escapeHtml(err.message || 'Please try again later.') + '</p>' +
                '</div>';
        } finally {
            if (statusEl) statusEl.style.display = 'none';
        }
    }
    init();
})();
