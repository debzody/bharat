/* ── One-off package creator: 7N/8D packages — 2026 ────────────────────
 * Adds all four 7-night/8-day variants extracted from the brochures:
 *   7A Economy   — package/7N8D ECONOMY PACKAGE (7A).pdf
 *   7B Standard  — package/7N8D STANDARD PACKAGE (7B).pdf
 *   7C Deluxe    — package/7N8D DELUXE PACKAGE 7(C).pdf
 *   7D Premium   — package/7N8D PRIMIUM PACKAGE (7D).pdf
 *
 * USAGE
 *   1. Open https://andamanvoyages.in/dashboard while signed in as admin.
 *   2. Open DevTools Console (F12 → Console tab).
 *   3. Paste the WHOLE block below (everything inside the IIFE), Enter.
 *   4. Wait for the green "✓ Packages created" toast.
 *
 * Safety
 *   - Uses PackagesStore.publish() with admin auth from the page,
 *     so Firestore rules apply (admin-only writes).
 *   - APPENDS / UPSERTS — existing packages with the same id are
 *     replaced (with confirmation), the rest are untouched.
 * ─────────────────────────────────────────────────────────────────── */

(async function () {
    if (!window.PackagesStore || typeof window.PackagesStore.publish !== 'function') {
        alert('PackagesStore not available. Make sure you are on /dashboard and signed in as admin.');
        return;
    }

    const sharedItinerary = [
        { day: 1, title: 'Arrival in Port Blair — Cellular Jail, Light & Sound Show & Marina Park', stay: 'Port Blair', meals: [], details: 'Arrival at Port Blair, transfer to hotel. After lunch the tour will start with a visit to the historic CELLULAR JAIL, where the heroic saga of the Indian freedom struggle is brought alive. Then visit the LIGHT AND SOUND SHOW at Cellular Jail. Afterwards proceed to MARINA PARK and then back to the respective hotel. Overnight stay at Port Blair.' },
        { day: 2, title: 'Ross Island & North Bay Island', stay: 'Port Blair', meals: ['Breakfast'], details: 'After breakfast proceed to ROSS ISLAND — the former residential and administrative island of the British during their rule of South-East Asia, nicknamed the "Paris of the East". Afternoon visit to NORTH BAY ISLAND, popularly known for its coral reefs. Overnight stay at Port Blair.' },
        { day: 3, title: 'Port Blair → Havelock Island — Radhanagar Beach', stay: 'Havelock Island', meals: ['Breakfast'], details: 'In the morning, departure by inter-island cruise to HAVELOCK ISLAND — a major tourist destination owing to its rich marine life, white sand beaches and dense evergreen forests, at a distance of about 57 km north-east of Port Blair. Visit RADHANAGAR BEACH (No. 7), recipient of an "A" rating from the World Tourism Organization (WTO). Night stay at Havelock Island.' },
        { day: 4, title: 'Havelock → Neil Island — Bharatpur, Laxmanpur & Sunset Point', stay: 'Neil Island', meals: ['Breakfast'], details: 'After breakfast, departure to NEIL ISLAND — about 30 km to the north-eastern part of Port Blair. Neil Island is famous for its marine life and popularly known as the "vegetable bowl of Andaman". After arrival, visit BHARATPUR BEACH, then LAXMANPUR BEACH (live coral and natural rock formation), and afternoon visit to the SUNSET POINT. Night stay near SITAPUR BEACH at Neil Island.' },
        { day: 5, title: 'Neil → Port Blair — Corbyn\u2019s Cove Beach & 1943 Netaji Flag Point', stay: 'Port Blair', meals: ['Breakfast'], details: 'After breakfast, departure to PORT BLAIR. After lunch, visit CORBYN\u2019S COVE BEACH (just 10 km from the city centre). Then visit the 1943 NETAJI FLAG POINT (where Netaji Subhash Chandra Bose hoisted the Tricolor for the first time on free Indian soil on 30 December 1943). Overnight stay at Port Blair.' },
        { day: 6, title: 'Baratang Island — Jarawa Reserve Forest & Limestone Caves', stay: 'Port Blair', meals: ['Breakfast'], details: 'Early morning proceed to BARATANG ISLAND through JARAWA RESERVE FOREST. Massive island, Jarawa forest and mangrove creeks, situated at a distance of 100 km from Port Blair and known for its geological and natural wonders. Return to Port Blair. Overnight stay at Port Blair.' },
        { day: 7, title: 'Port Blair Sightseeing — Museums & Aquarium', stay: 'Port Blair', meals: ['Breakfast'], details: 'After breakfast, full day "PORT BLAIR SIGHTSEEING" covering CHATHAM SAW MILL, ANTHROPOLOGICAL MUSEUM, FISHERIES AQUARIUM, and SAMUDRIKA NAVAL MUSEUM. Overnight stay at Port Blair.' },
        { day: 8, title: 'Departure — Airport Drop', stay: null, meals: ['Breakfast'], details: 'After breakfast, check-out from the hotel and transfer to Port Blair Airport for your onward flight. Tour ends with sweet memories of Andaman.' }
    ];

    const sharedPlaces = [
        'Port Blair', 'Cellular Jail', 'Light & Sound Show (Cellular Jail)', 'Marina Park',
        'Ross Island', 'North Bay Island', 'Havelock Island', 'Radhanagar Beach (No. 7)',
        'Neil Island', 'Bharatpur Beach', 'Laxmanpur Beach', 'Sitapur Beach', 'Sunset Point (Neil)',
        'Corbyn\u2019s Cove Beach', '1943 Netaji Flag Point', 'Baratang Island',
        'Jarawa Reserve Forest', 'Chatham Saw Mill', 'Anthropological Museum',
        'Fisheries Aquarium', 'Samudrika Naval Museum'
    ];

    // 7A & 7B include LUNCH; 7C & 7D do NOT include lunch
    const exclusionsWithLunch = [
        'Entry Fees', 'Light & Sound Show Ticket',
        'Personal Activities (Scuba, Snorkelling, Sea Walk, Speed Boat, Glass Boat, Water Scooter, Jet Ski, Baratang Safari, Limestone Cave)',
        'Mineral Water, Cool Drinks, Ice Cream & Beverages', '5% GST',
        'Up & Down Flight Fare', 'Anything which is not mentioned in this package'
    ];
    const exclusionsNoLunch = [
        'Entry Fees', 'Lunch', 'Light & Sound Show Ticket',
        'Personal Activities (Scuba, Snorkelling, Sea Walk, Speed Boat, Glass Boat, Water Scooter, Jet Ski, Baratang Safari, Limestone Cave)',
        'Mineral Water, Cool Drinks, Ice Cream & Beverages', '5% GST',
        'Up & Down Flight Fare', 'Anything which is not mentioned in this package'
    ];

    const sharedBookingPolicy = {
        advancePerHead: 5000,
        currency: 'INR',
        note: 'Bookings are normally reserved on payment of \u20B95,000/- per head as an advance of total package amount.',
        payee: 'BHARAT TRANSPORT & TOURISM',
        paymentModes: ['Cheque', 'Draft', 'Online']
    };
    const sharedCancellationPolicy = [
        { window: '01-07 days before', charge: 'No refund of any amount' },
        { window: '08-29 days before', charge: '\u20B94,000 per head' },
        { window: '30 days or above',  charge: 'Minimum \u20B93,000 per head' }
    ];
    const sharedChildPolicy = [
        'Child below 3 years: FREE',
        'Child below 5 years: 25% of total package cost',
        'Child below 7 years: 50% of total package cost',
        'Child below 9 years: 75% of total package cost',
        '9 years & above: 100% of total package cost'
    ];
    const sharedTerms = [
        'Tour schedule may change under circumstances such as bad weather & specific problems.',
        'Full payment must be paid on Day 1 after check-in to the hotel.',
        'Hotel check-in and check-out time: 8:00 AM.',
        'After confirmation of tour itinerary, no addition or alteration is allowed.',
        'Rates based on a minimum of 10 persons.',
        'Resorts will be \u20B91,500/- higher than hotels on package cost.',
        'Extra cost for Personal Car, A.C. Car, A.C. Room, & Additional Tour.',
        'Package cost is from Port Blair to Port Blair.',
        'Management will not undertake any kind of loss, liability, claim or damage to life, accident, theft/robbery or any other situation that happens during travel.',
        'If a single person occupies a Double Bed Room, extra cost will be borne by the guest.',
        '5% GST will be applicable.',
        'Covering places as per itinerary only.'
    ];

    // Per actual brochure itinerary (Day 1 PB → Day 2 PB → Day 3 Hav →
    // Day 4 Neil → Day 5-7 PB → Day 8 depart) = 2N PB + 1N Hav + 1N Neil
    // + 3N PB. Same across 7A/7B/7C/7D — only hotel tier differs.
    var citiesRoute = ['2N Port Blair', '1N Havelock', '1N Neil Island', '3N Port Blair'];

    const baseCommon = {
        duration: '7 Nights / 8 Days',
        visible: true,
        createdAt: new Date().toISOString(),
        createdVia: 'manual-from-brochure',
        minPersons: 10,
        gstPercent: 5,
        places: sharedPlaces,
        cities: citiesRoute,
        itinerary: sharedItinerary,
        bookingPolicy: sharedBookingPolicy,
        cancellationPolicy: sharedCancellationPolicy,
        childPolicy: sharedChildPolicy,
        terms: sharedTerms
    };

    const pkg7A = Object.assign({}, baseCommon, {
        id: '7A',
        name: 'Economy Package (7A) — 2026',
        desc: '7N/8D | Port Blair + Havelock + Neil + Baratang | Non-AC Room, Car & Cruise | Breakfast, Lunch & Dinner',
        price: 19500,
        category: 'Economy',
        code: '7-A',
        rating: 4.3,
        image: 'images/beach1.jpg',
        order: 10,
        sourceFile: 'package/7N8D ECONOMY PACKAGE (7A).pdf',
        pricePerHead: 19500,
        inclusions: [
            'Accommodation (Non-AC)',
            'Food (Breakfast, Lunch & Dinner)',
            'Transportation (Non-AC)',
            'Toll Tax',
            'Boat for Ross & North Bay Island',
            'Forest Permit',
            'Jarawa Permit',
            'Parking',
            'Airport Pickup & Drop',
            'Non-A.C. Cruise Ship (Havelock & Neil)'        ],
        exclusions: exclusionsWithLunch
    });

    const pkg7B = Object.assign({}, baseCommon, {
        id: '7B',
        name: 'Standard Package (7B) — 2026',
        desc: '7N/8D | Port Blair + Havelock + Neil + Baratang | AC Room, Car & Cruise | Breakfast, Lunch & Dinner',
        price: 22500,
        category: 'Standard',
        code: '7-B',
        rating: 4.5,
        image: 'images/beach2.jpg',
        order: 11,
        sourceFile: 'package/7N8D STANDARD PACKAGE (7B).pdf',
        pricePerHead: 22500,
        inclusions: [
            'Accommodation (AC)',
            'Food (Breakfast, Lunch & Dinner)',
            'Transportation (AC)',
            'Toll Tax',
            'Boat for Ross & North Bay Island',
            'Forest Permit',
            'Jarawa Permit',
            'Parking',
            'Airport Pickup & Drop',
            'A.C. Cruise Ship (Havelock & Neil)'
        ],
        exclusions: exclusionsWithLunch
    });

    const pkg7C = Object.assign({}, baseCommon, {
        id: '7C',
        name: 'Deluxe Package (7C) — 2026',
        desc: '7N/8D | Port Blair + Havelock + Neil + Baratang | Beach Property at Havelock | AC Room, Car & Cruise | Breakfast & Dinner',
        price: 24500,
        category: 'Deluxe',
        code: '7-C',
        rating: 4.6,
        image: 'images/beach3.jpg',
        order: 12,
        sourceFile: 'package/7N8D DELUXE PACKAGE 7(C).pdf',
        pricePerHead: 24500,
        inclusions: [
            'Accommodation (AC)',
            'Beach Property in Havelock',
            'Food (Breakfast & Dinner)',
            'Transportation (AC)',
            'Toll Tax',
            'Boat for Ross & North Bay Island',
            'Forest Permit',
            'Jarawa Permit',
            'Parking',
            'Airport Pickup & Drop',
            'A.C. Cruise Ship (Havelock & Neil)'
        ],
        exclusions: exclusionsNoLunch
    });

    const pkg7D = Object.assign({}, baseCommon, {
        id: '7D',
        name: 'Premium Package (7D) — 2026',
        desc: '7N/8D | Port Blair + Havelock + Neil + Baratang | Deluxe Hotel PB + Beach Property Havelock & Neil | AC Room, Car & Cruise | Breakfast & Dinner',
        price: 26500,
        category: 'Premium',
        code: '7-D',
        rating: 4.7,
        image: 'images/beach3.jpg',
        order: 13,
        sourceFile: 'package/7N8D PRIMIUM PACKAGE (7D).pdf',
        pricePerHead: 26500,
        inclusions: [
            'Accommodation (Deluxe Hotel in Port Blair)',
            'Beach Property in Havelock & Neil',
            'Food (Breakfast & Dinner)',
            'Transportation (AC)',
            'Toll Tax',
            'Boat for Ross & North Bay Island',
            'Forest Permit',
            'Jarawa Permit',
            'Parking',
            'Airport Pickup & Drop',
            'A.C. Cruise Ship (Havelock & Neil)'
        ],
        exclusions: exclusionsNoLunch
    });

    const newPackages = [pkg7A, pkg7B, pkg7C, pkg7D];

    try {
        const current = await window.PackagesStore.load();
        const list = (current && Array.isArray(current.data)) ? current.data.slice() : [];

        let added = 0, replaced = 0, skipped = 0;
        for (const pkg of newPackages) {
            const idx = list.findIndex(p => p.id === pkg.id);
            if (idx >= 0) {
                if (!confirm('Package "' + pkg.id + '" already exists. Replace it?')) { skipped++; continue; }
                list[idx] = pkg;
                replaced++;
            } else {
                list.push(pkg);
                added++;
            }
        }

        await window.PackagesStore.publish(list);
        const summary = '\u2713 7N/8D packages saved — added: ' + added + ', replaced: ' + replaced + ', skipped: ' + skipped;
        console.log('%c' + summary, 'color:#27ae60;font-weight:bold;font-size:1.1rem');
        if (window.Toast && window.Toast.success) window.Toast.success(summary);
        else alert(summary + '. Refresh the dashboard to see them.');
    } catch (err) {
        console.error('[create-7n8d-packages] failed:', err);
        alert('\u274C Failed: ' + (err && err.message || err));
    }
})();
