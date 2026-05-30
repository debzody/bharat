/* ── One-off package creator ──────────────────────────────────
 * Creates the "Andaman Customized Package — Feb 2026" package
 * extracted from the 8-page brochure that the AI Import couldn't
 * fully read because of low-resolution OCR + watermark interference.
 *
 * USAGE
 *   1. Open https://andamanvoyages.in/dashboard while signed in as admin.
 *   2. Open DevTools Console (F12 → Console tab).
 *   3. Copy the WHOLE block below (everything inside the IIFE), paste,
 *      hit Enter.
 *   4. Wait for the green "✓ Package created" toast.
 *
 * Safety
 *   - Uses PackagesStore.publish() with the admin auth already in the
 *     page, so Firestore rules apply (admin-only writes).
 *   - APPENDS the new package — the existing 5 packages are untouched.
 *   - If you need to re-run, change the id below to avoid collision.
 * ───────────────────────────────────────────────────────────── */

(async function () {
    if (!window.PackagesStore || typeof window.PackagesStore.publish !== 'function') {
        alert('PackagesStore not available. Make sure you are on /dashboard and signed in as admin.');
        return;
    }

    const newPkg = {
        id: 'customized-feb-2026',
        name: 'Andaman Customized Package — Feb 2026',
        desc: '8N/9D | Port Blair + Havelock + Neil + Baratang | AC Hotels + AC Cruise + Ferries',
        price: 24500,
        duration: '8 Nights / 9 Days',
        category: 'Standard',
        rating: 4.7,
        image: 'images/beach2.jpg',  // replace later via the package edit UI
        visible: true,
        order: 5,
        createdAt: new Date().toISOString(),
        createdVia: 'manual-from-brochure',

        places: [
            'Port Blair', 'Cellular Jail', 'Marina Park',
            'Ross Island', 'North Bay Island',
            'Havelock Island', 'Radhanagar Beach',
            'Neil Island', 'Bharatpur Beach', 'Laxmanpur Beach', 'Sitapur Beach',
            'Corbyn\u2019s Cove Beach', '1943 Netaji Flag Point', 'Ramakrishna Mission',
            'Baratang Island', 'Jarawa Reserve Forest', 'Limestone Cave',
            'Chatham Saw Mill', 'Anthropological Museum', 'Fisheries Aquarium', 'Samudrika Naval Museum'
        ],

        inclusions: [
            'AC Accommodation (8 nights)',
            'All Meals (Breakfast, Lunch & Dinner)',
            'AC Transportation',
            'Boat to Ross & North Bay Island',
            'AC Cruise Ship (Havelock & Neil Island)',
            'Forest Permit',
            'Jarawa Permit',
            'Parking Charges',
            'Airport Pickup & Drop',
            'Tour Guide / Driver'
        ],

        exclusions: [
            'Entry Fees at monuments',
            'Light & Sound Show at Cellular Jail',
            'Personal activities (Scuba diving, Snorkeling, Sea-walk, Speedboat, Glass boat, Water scooter, Jet-ski, any rides)',
            'Baratang Safari & Limestone Cave boat cost',
            'Mineral water, cold drinks, ice cream and any beverages',
            '5% GST',
            'Up & Down Flight Fare',
            'Anything not mentioned in the itinerary'
        ],

        itinerary: [
            {
                day: 1,
                title: 'Arrival in Port Blair — Cellular Jail & Light & Sound Show',
                details: 'Arrival at Port Blair, transfer to hotel. After lunch, the tour starts with a visit to the historic Cellular Jail, where the heroic saga of the Indian freedom struggle is brought alive. Followed by the Light & Sound Show at the jail. Afterwards, proceed to Marina Park before returning to the hotel. Overnight stay at Port Blair.'
            },
            {
                day: 2,
                title: 'Ross Island & North Bay Island',
                details: 'After breakfast, proceed to Ross Island — the former residential and administrative island of the British during their rule of South-East Asia, nicknamed the \u201CParis of the East.\u201D Afternoon, visit North Bay Island, a popular destination known for its coral reefs, snorkelling and water activities. Overnight stay at Port Blair.'
            },
            {
                day: 3,
                title: 'Departure to Havelock Island — Radhanagar Beach',
                details: 'Morning departure by inter-island cruise to Havelock Island — a major tourist destination with rich marine life, white sand beaches and dense evergreen forests, about 57 km north-east of Port Blair. Visit Radhanagar Beach (No. 7), recipient of the World Tourism Organization\u2019s \u201CA\u201D rating. Night stay at Havelock Island.'
            },
            {
                day: 4,
                title: 'Havelock — Beaches & Optional Activities',
                details: 'Full day at Havelock Island. Explore the beaches, swim, optional scuba diving / snorkelling at additional cost, and enjoy the sunset. Overnight stay at Havelock Island.'
            },
            {
                day: 5,
                title: 'Departure to Neil Island — Bharatpur & Laxmanpur Beach',
                details: 'After breakfast, depart to Neil Island (about 30 km north-east of Port Blair). Neil Island is famous for its marine life and is popularly called the \u201Cvegetable bowl of Andaman.\u201D Visit Bharatpur Beach (famous for coral watching and swimming), then Laxmanpur Beach I & II, the live coral reef and the natural rock formation. Afternoon visit the sunset point. Night stay near Sitapur Beach at Neil Island.'
            },
            {
                day: 6,
                title: 'Back to Port Blair — Corbyn\u2019s Cove, Netaji Flag Point & Ramakrishna Mission',
                details: 'After breakfast, return to Port Blair. Afternoon visit Corbyn\u2019s Cove Beach (10 km from the city centre, beautiful blue water and coconut palms; water sports available). Then visit the 1943 Netaji Flag Point — where Netaji Subhash Chandra Bose hoisted the Tricolor on 30 December 1943, declaring Andaman a free territory from British rule. Continue to Ramakrishna Mission. Night stay at Port Blair.'
            },
            {
                day: 7,
                title: 'Baratang Island via Jarawa Reserve Forest — Limestone Caves & Mangroves',
                details: 'Early morning, proceed to Baratang Island through the Jarawa Reserve Forest. Explore the Limestone Cave (own cost), mangrove creeks, and natural wonders. About 100 km from Port Blair, Baratang is known for its geological and natural beauty. Evening, return to Port Blair. Night stay at Port Blair.'
            },
            {
                day: 8,
                title: 'Port Blair Sightseeing — Museums & Aquarium',
                details: 'After breakfast, full-day Port Blair sightseeing covering Chatham Saw Mill (one of the oldest and largest saw mills in Asia, currently closed for visitors but viewable from outside), the Anthropological Museum (illustrating the Negrito tribes of Andaman), Fisheries Aquarium (marine life endemic to the islands and the Indo-Pacific) and Samudrika Naval Museum (collection of shells, corals and species). Night stay at Port Blair.'
            },
            {
                day: 9,
                title: 'Departure — Airport Drop',
                details: 'After breakfast, transfer to Port Blair airport for your onward journey. Tour ends with sweet memories of Andaman.'
            }
        ],

        // ── Extra metadata captured from the brochure ──────────────────
        bookingPolicy: {
            advancePercent: 30,
            payee: 'TOURISM WORLD',
            payeeLocation: 'Kolkata',
            paymentModes: ['Cheque', 'Draft', 'Online']
        },
        cancellationPolicy: [
            { window: '01-07 days before', charge: '100% (no refund)' },
            { window: '08-10 days before', charge: '75% of total' },
            { window: '11-14 days before', charge: '50% of total' },
            { window: '15+ days before',  charge: 'Min ₹3,000' }
        ],
        terms: [
            'Tour schedule may change due to bad weather or specific problems.',
            'Full payment must be paid on Day 1 after hotel check-in.',
            'Hotel check-in & check-out time: 8:00 AM.',
            'Once itinerary is confirmed, no additions or alterations allowed.',
            'Rates based on minimum 12 persons.',
            'Resorts will be ₹1,500/- higher than hotels on package cost.',
            'Extra cost for personal car, AC car, AC room & additional tour.',
            'Package cost is from Port Blair to Port Blair.',
            'Management is not liable for loss, accident, theft/robbery during travel.',
            'Single occupancy of double room costs extra.',
            '5% GST applicable.',
            'Covers places as per itinerary only.'
        ]
    };

    try {
        const current = await window.PackagesStore.load();
        const list = (current && Array.isArray(current.data)) ? current.data.slice() : [];
        if (list.some(p => p.id === newPkg.id)) {
            if (!confirm('A package with id "' + newPkg.id + '" already exists. Replace it?')) return;
            const idx = list.findIndex(p => p.id === newPkg.id);
            list[idx] = newPkg;
        } else {
            list.push(newPkg);
        }
        await window.PackagesStore.publish(list);
        console.log('%c\u2713 Package created successfully', 'color:#27ae60;font-weight:bold;font-size:1.1rem');
        if (window.Toast && window.Toast.success) window.Toast.success('Customized Feb 2026 package added');
        else alert('\u2713 Package created. Refresh the dashboard to see it.');
    } catch (err) {
        console.error.error('[create-pkg] failed:', err);
        alert('\u274C Failed: ' + (err && err.message || err));
    }
})();
