// ── Phase 2 — MMT-style trip blocks (per-day typed timeline) ──
// Loaded from dashboard.html. Exposes:
//   window.IteBlocks.wire(rootEl, dayObj, onChange)
//     rootEl must contain .ite-blocks-toolbar / .ite-blocks-list /
//     .ite-blocks-count. Reads/writes dayObj.blocks directly.
//   window.IteBlocks.BLOCK_TYPES, .BLOCK_FIELDS  (read-only, also
//     consumed by the public renderer in package.html)
//
// Additive to the legacy day.activities[] list — public renderer in
// package.html falls back to activities[] when blocks[] is empty, so
// every existing package keeps working unchanged.
(function () {
  'use strict';

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  var BLOCK_TYPES = [
    { type: 'activity',       icon: 'fa-person-walking',     label: 'Activity' },
    { type: 'transfer',       icon: 'fa-bus',                label: 'Transfer' },
    { type: 'hotel',          icon: 'fa-hotel',              label: 'Hotel' },
    { type: 'sightseeing',    icon: 'fa-camera',             label: 'Sightseeing' },
    { type: 'meal',           icon: 'fa-utensils',           label: 'Meal' },
    { type: 'flight',         icon: 'fa-plane-departure',    label: 'Flight' },
    { type: 'hotel-checkout', icon: 'fa-right-from-bracket', label: 'Hotel Checkout' }
  ];

  // Field schemas. Keep in sync with the public renderer in package.html.
  //   t: 'text' | 'textarea' | 'number' | 'select'
  //   o: select options (only when t === 'select')
  var TIME_OPTS = ['', 'Morning', 'Afternoon', 'Evening', 'Anytime'];
  var BLOCK_FIELDS = {
    activity: [
      { k: 'title',       t: 'text',     l: 'Title',       p: 'e.g. Bella Bay Luxury Dinner Cruise' },
      { k: 'duration',    t: 'text',     l: 'Duration',    p: 'e.g. 2 Hours' },
      { k: 'timeOfDay',   t: 'select',   l: 'Time of day', o: TIME_OPTS },
      { k: 'place',       t: 'text',     l: 'Place',       p: 'e.g. Port Blair' },
      { k: 'description', t: 'textarea', l: 'Description', p: 'Short description shown on the public page' },
      { k: 'imageUrl',    t: 'text',     l: 'Image URL',   p: 'https://... (any image URL)' }
    ],
    transfer: [
      { k: 'title',       t: 'text',     l: 'Title',       p: 'e.g. Ferry Port Blair to Havelock' },
      { k: 'vehicle',     t: 'text',     l: 'Vehicle',     p: 'e.g. Shared Ferry / Private Cab' },
      { k: 'duration',    t: 'text',     l: 'Duration',    p: 'e.g. 1 Hour' },
      { k: 'timeOfDay',   t: 'select',   l: 'Time of day', o: TIME_OPTS },
      { k: 'description', t: 'textarea', l: 'Description', p: 'Optional short description' },
      { k: 'imageUrl',    t: 'text',     l: 'Image URL',   p: 'https://...' }
    ],
    hotel: [
      { k: 'title',         t: 'text',   l: 'Hotel name',     p: 'e.g. TSG Blue Resort and Spa' },
      { k: 'starRating',    t: 'number', l: 'Star rating',    p: '3' },
      { k: 'address',       t: 'text',   l: 'Address',        p: 'e.g. Radhanagar Beach' },
      { k: 'checkIn',       t: 'text',   l: 'Check-in',       p: 'e.g. 20th Jun, 12 PM' },
      { k: 'checkOut',      t: 'text',   l: 'Check-out',      p: 'e.g. 22nd Jun, 8 AM' },
      { k: 'nights',        t: 'number', l: 'Nights',         p: '2' },
      { k: 'roomType',      t: 'text',   l: 'Room type',      p: 'e.g. Aqua Pool-View Room' },
      { k: 'mealsIncluded', t: 'text',   l: 'Meals included', p: 'e.g. Breakfast (comma-separated)' },
      { k: 'imageUrl',      t: 'text',   l: 'Image URL',      p: 'https://...' }
    ],
    sightseeing: [
      { k: 'title',       t: 'text',     l: 'Title',       p: 'e.g. Cellular Jail National Memorial' },
      { k: 'duration',    t: 'text',     l: 'Duration',    p: 'e.g. 2 Hours' },
      { k: 'timeOfDay',   t: 'select',   l: 'Time of day', o: TIME_OPTS },
      { k: 'place',       t: 'text',     l: 'Place',       p: 'e.g. Port Blair' },
      { k: 'description', t: 'textarea', l: 'Description', p: 'Optional short description' },
      { k: 'imageUrl',    t: 'text',     l: 'Image URL',   p: 'https://...' }
    ],
    meal: [
      { k: 'label', t: 'select', l: 'Meal',  o: ['', 'Breakfast', 'Lunch', 'Dinner'] },
      { k: 'place', t: 'text',   l: 'Place', p: 'e.g. In Port Blair / At Resort' }
    ],
    flight: [
      { k: 'title',       t: 'text',     l: 'Flight',  p: 'e.g. 6E-385 BLR to IXZ' },
      { k: 'departTime',  t: 'text',     l: 'Departs', p: 'e.g. 6:00 AM, 19 Jun' },
      { k: 'arriveTime',  t: 'text',     l: 'Arrives', p: 'e.g. 8:30 AM, 19 Jun' },
      { k: 'description', t: 'textarea', l: 'Notes',   p: 'Optional cabin/baggage notes' }
    ],
    'hotel-checkout': [
      { k: 'place', t: 'text', l: 'Place', p: 'e.g. In Havelock' }
    ]
  };

  function meta(t) {
    for (var i = 0; i < BLOCK_TYPES.length; i++) {
      if (BLOCK_TYPES[i].type === t) return BLOCK_TYPES[i];
    }
    return { type: t || 'unknown', icon: 'fa-circle', label: t || 'Unknown' };
  }

  function buildField(block, f, onChange) {
    var wrap = document.createElement('label');
    wrap.className = 'ite-block-field';
    var lbl = document.createElement('span');
    lbl.className = 'ite-block-field-label';
    lbl.textContent = f.l;
    wrap.appendChild(lbl);

    var inp;
    if (f.t === 'textarea') {
      inp = document.createElement('textarea');
      inp.rows = 3;
    } else if (f.t === 'select') {
      inp = document.createElement('select');
      (f.o || []).forEach(function (opt) {
        var o = document.createElement('option');
        o.value = opt;
        o.textContent = opt || '— choose —';
        inp.appendChild(o);
      });
    } else {
      inp = document.createElement('input');
      inp.type = f.t === 'number' ? 'number' : 'text';
    }
    inp.className = 'ite-block-field-input';
    if (f.p) inp.placeholder = f.p;
    var v = block[f.k];
    if (v != null) inp.value = String(v);

    function commit() {
      if (f.t === 'number') {
        var n = Number(inp.value);
        block[f.k] = isFinite(n) ? n : null;
      } else {
        block[f.k] = inp.value;
      }
      if (typeof onChange === 'function') onChange();
    }
    inp.addEventListener('input', commit);
    inp.addEventListener('change', commit);
    wrap.appendChild(inp);
    return wrap;
  }

  function makeAction(iconClass, title, disabled, fn) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-block-act';
    btn.title = title;
    btn.innerHTML = '<i class="fas ' + iconClass + '"></i>';
    if (disabled) btn.disabled = true;
    btn.addEventListener('click', fn);
    return btn;
  }

  function buildCard(blocks, idx, refresh, onChange) {
    var b = blocks[idx];
    var m = meta(b.type);
    var card = document.createElement('div');
    card.className = 'ite-block-card ite-block-' + b.type;

    // Header — type pill + actions
    var head = document.createElement('div');
    head.className = 'ite-block-head';

    var typeSpan = document.createElement('span');
    typeSpan.className = 'ite-block-type';
    typeSpan.innerHTML = '<i class="fas ' + m.icon + '"></i> ' + escHtml(m.label);
    head.appendChild(typeSpan);

    var actions = document.createElement('div');
    actions.className = 'ite-block-actions';
    actions.appendChild(makeAction('fa-chevron-up', 'Move up', idx === 0, function () {
      if (idx === 0) return;
      var t = blocks[idx - 1]; blocks[idx - 1] = blocks[idx]; blocks[idx] = t;
      if (typeof onChange === 'function') onChange();
      refresh();
    }));
    actions.appendChild(makeAction('fa-chevron-down', 'Move down', idx >= blocks.length - 1, function () {
      if (idx >= blocks.length - 1) return;
      var t = blocks[idx + 1]; blocks[idx + 1] = blocks[idx]; blocks[idx] = t;
      if (typeof onChange === 'function') onChange();
      refresh();
    }));
    actions.appendChild(makeAction('fa-trash', 'Delete this block', false, function () {
      if (!confirm('Delete this ' + m.label + ' block?')) return;
      blocks.splice(idx, 1);
      if (typeof onChange === 'function') onChange();
      refresh();
    }));
    head.appendChild(actions);
    card.appendChild(head);

    // Body — typed mini-form, one input per field
    var body = document.createElement('div');
    body.className = 'ite-block-body';
    var fields = BLOCK_FIELDS[b.type] || [];
    fields.forEach(function (f) {
      body.appendChild(buildField(b, f, onChange));
    });
    card.appendChild(body);
    return card;
  }

  // Wire one .ite-blocks-section root: builds toolbar + list and
  // attaches add/move/delete handlers. Re-renders the list any time
  // the array mutates.
  function wire(rootEl, dayObj, onChange) {
    if (!rootEl || !dayObj) return;
    if (!Array.isArray(dayObj.blocks)) dayObj.blocks = [];
    var blocks = dayObj.blocks;

    var toolbar = rootEl.querySelector('.ite-blocks-toolbar');
    var listEl  = rootEl.querySelector('.ite-blocks-list');
    var countEl = rootEl.querySelector('.ite-blocks-count');
    if (!toolbar || !listEl) return;

    // Toolbar: one + button per block type
    toolbar.innerHTML = '';
    BLOCK_TYPES.forEach(function (bt) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-block-add';
      btn.title = 'Add ' + bt.label;
      btn.innerHTML = '<i class="fas ' + bt.icon + '"></i> ' + bt.label;
      btn.addEventListener('click', function () {
        var blank = { type: bt.type };
        if (bt.type === 'meal') blank.label = 'Breakfast';
        blocks.push(blank);
        if (typeof onChange === 'function') onChange();
        refresh();
      });
      toolbar.appendChild(btn);
    });

    function refresh() {
      if (countEl) countEl.textContent = String(blocks.length);
      listEl.innerHTML = '';
      if (!blocks.length) {
        var empty = document.createElement('p');
        empty.className = 'ite-blocks-empty';
        empty.textContent = 'No trip blocks yet — add Activity / Transfer / Hotel etc. above to build the MMT-style timeline. Leave empty to keep the plain Activities list above.';
        listEl.appendChild(empty);
        return;
      }
      blocks.forEach(function (_b, i) {
        listEl.appendChild(buildCard(blocks, i, refresh, onChange));
      });
    }

    refresh();
  }

  // Pure helper for the public renderer (package.html). Counts blocks
  // by type across all days. Returns {transfers, hotels, activities, meals, flights}.
  function countBlocks(days) {
    var c = { transfers: 0, hotels: 0, activities: 0, meals: 0, flights: 0, sightseeing: 0 };
    (days || []).forEach(function (d) {
      (d.blocks || []).forEach(function (b) {
        if (b.type === 'transfer')      c.transfers++;
        else if (b.type === 'hotel')    c.hotels++;
        else if (b.type === 'activity') c.activities++;
        else if (b.type === 'meal')     c.meals++;
        else if (b.type === 'flight')   c.flights++;
        else if (b.type === 'sightseeing') c.sightseeing++;
      });
    });
    return c;
  }

  // Whether any day has blocks — drives the public renderer's
  // "MMT timeline vs legacy activities list" decision.
  function hasAnyBlocks(days) {
    return (days || []).some(function (d) {
      return Array.isArray(d.blocks) && d.blocks.length > 0;
    });
  }

  window.IteBlocks = {
    wire: wire,
    BLOCK_TYPES: BLOCK_TYPES,
    BLOCK_FIELDS: BLOCK_FIELDS,
    escHtml: escHtml,
    countBlocks: countBlocks,
    hasAnyBlocks: hasAnyBlocks,
    blockMeta: meta
  };
})();
