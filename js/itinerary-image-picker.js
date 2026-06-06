/* ──────────────────────────────────────────────────────────────
 *  itinerary-image-picker.js
 *  ──────────────────────────
 *  When the public package detail page renders an activity that
 *  doesn't have a `imageUrl` yet, we still want to show a relevant
 *  picture so the day plan looks rich and easy to scan. This helper
 *  matches the activity title against a keyword → local-image map
 *  (the same Unsplash photos already downloaded into /images/<place>/)
 *  and returns a stable URL.
 *
 *  Public API:
 *      window.ItineraryImagePicker.forActivity(title)   →  string|''
 *
 *  Stable: the same title always returns the same image so the page
 *  doesn't "shuffle" between renders.
 * ────────────────────────────────────────────────────────────── */
(function () {
    'use strict';

    // ── Keyword → image-folder map ───────────────────────────
    // The first matching keyword wins. Order matters: more specific
    // first ("cellular jail" before "jail"), generic last.
    var MAP = [
        // Specific landmarks / activities
        { kw: ['cellular jail', 'kala pani', 'sound show', 'light show', 'national memorial'],     folder: 'port-blair',     count: 14 },
        { kw: ['ross island', 'ross & smith'],                                                     folder: 'ross-island',    count: 8  },
        { kw: ['smith island', 'natural sandbar'],                                                 folder: 'smith-island',   count: 6  },
        { kw: ['neil', 'laxmanpur', 'bharatpur', 'natural bridge', 'howrah bridge'],               folder: 'neil',           count: 11 },
        { kw: ['havelock', 'radhanagar', 'elephant beach', 'kalapathar', 'beach no'],              folder: 'havelock',       count: 18 },
        { kw: ['baratang', 'mangrove', 'mud volcano'],                                             folder: 'baratang',       count: 18 },
        { kw: ['limestone', 'cave'],                                                               folder: 'limestone-cave', count: 5  },
        { kw: ['diglipur', 'saddle peak', 'ross & smith'],                                         folder: 'diglipur',       count: 8  },
        { kw: ['little andaman', 'white surf', 'butler bay'],                                      folder: 'little-andaman', count: 7  },
        { kw: ['jarawa'],                                                                          folder: 'jarawa',         count: 5  },
        { kw: ['port blair', 'aberdeen', 'corbyn', 'chidiya tapu', 'wandoor', 'chatham', 'haddo'], folder: 'port-blair',     count: 14 },
    ];

    // ── Theme map for keywords that should pick a beach/sea-themed
    //    fallback when no specific destination is mentioned.
    var THEME = [
        { kw: ['scuba',   'snorkel', 'coral', 'reef', 'underwater', 'sea walk', 'glass bottom'], file: 'images/beach2.jpg' },
        { kw: ['sunset',  'sunrise', 'sun down', 'cocktail'],                                    file: 'images/beach4.jpg' },
        { kw: ['ferry',   'boat',    'cruise',  'yacht',  'speedboat',   'jet ski'],             file: 'images/neil1.jpg' },
        { kw: ['hotel',   'resort',  'check-in','check in','room',       'suite', 'villa'],      file: 'images/beach3.jpg' },
        { kw: ['airport', 'transfer','pickup',  'drop',    'arrival',    'departure'],           file: 'images/beach1.jpg' },
        { kw: ['breakfast','dinner', 'lunch',   'meal',    'bbq',        'barbecue'],            file: 'images/beach3.jpg' },
        { kw: ['spa',     'massage', 'wellness','yoga'],                                          file: 'images/neil6.jpg' },
        { kw: ['photo',   'shoot',   'camera'],                                                  file: 'images/beach2.jpg' },
        { kw: ['romantic','candle',  'honeymoon','flower','rose'],                               file: 'images/beach4.jpg' },
        { kw: ['fishing', 'parasail','adventure'],                                                file: 'images/neil2.jpg' },
        { kw: ['shopping','market',  'bazaar',  'emporium'],                                     file: 'images/port-blair/port-blair-1.jpg' },
        { kw: ['bonfire', 'star',    'night'],                                                    file: 'images/beach4.jpg' },
        { kw: ['departure','farewell','memory'],                                                  file: 'images/beach1.jpg' },
    ];

    // Default fallback — generic Andaman beach
    var DEFAULT_IMG = 'images/beach1.jpg';

    /**
     * Hash a string deterministically to a positive 32-bit integer.
     * Used to pick a stable image index for a given title so the
     * page doesn't reshuffle between renders.
     */
    function hash(str) {
        str = String(str || '');
        var h = 0;
        for (var i = 0; i < str.length; i++) {
            h = (h << 5) - h + str.charCodeAt(i);
            h |= 0; // 32-bit
        }
        return Math.abs(h);
    }

    /**
     * Pick a local image URL for the given activity title.
     * Returns '' when no match (caller should hide the image slot).
     */
    function forActivity(title) {
        var t = String(title || '').toLowerCase().trim();
        if (!t) return '';

        // Step 1: destination match
        for (var i = 0; i < MAP.length; i++) {
            var entry = MAP[i];
            for (var j = 0; j < entry.kw.length; j++) {
                if (t.indexOf(entry.kw[j]) !== -1) {
                    // Pick a stable image number 1..count for this title
                    var num = (hash(t) % entry.count) + 1;
                    return 'images/' + entry.folder + '/' + entry.folder + '-' + num + '.jpg';
                }
            }
        }

        // Step 2: theme match (scuba / sunset / hotel / meal / etc.)
        for (var k = 0; k < THEME.length; k++) {
            var th = THEME[k];
            for (var m = 0; m < th.kw.length; m++) {
                if (t.indexOf(th.kw[m]) !== -1) return th.file;
            }
        }

        // Step 3: deterministic fallback among the generic beach photos
        var beaches = ['images/beach1.jpg', 'images/beach2.jpg', 'images/beach3.jpg', 'images/beach4.jpg'];
        return beaches[hash(t) % beaches.length] || DEFAULT_IMG;
    }

    /**
     * Pick a hero image for a whole DAY based on its title. We
     * concatenate every activity title for that day so the picker
     * sees the full context (eg. "Ferry to Havelock + Radhanagar
     * Beach + Sunset" → Havelock).
     */
    function forDay(day) {
        if (!day) return '';
        var parts = [day.title || ''];
        if (Array.isArray(day.activities)) {
            day.activities.forEach(function (a) {
                if (typeof a === 'string') parts.push(a);
                else if (a && a.title) parts.push(a.title);
            });
        }
        return forActivity(parts.join(' '));
    }

    window.ItineraryImagePicker = {
        forActivity: forActivity,
        forDay: forDay
    };
})();