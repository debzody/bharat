// ── Firebase-backed data store (Auth + Firestore) ────────────────
// Replaces the previous jsonbin.io implementation. All public pages and
// the admin dashboard go through this module.
//
// Public surface (set on `window`):
//   PackagesStore.load()                 → load all packages (with cache)
//   PackagesStore.loadWithStaleWhileRevalidate(cb)
//   PackagesStore.publish(packagesArray) → admin-only; writes all packages
//   UsersStore.login(identifier, pwd)    → identifier = email OR username
//   UsersStore.register({username,email,password,fullName?,phone?})
//   UsersStore.logout()
//   UsersStore.onAuthChange(cb)          → cb(profile|null)
//   UsersStore.getCurrentUser()          → cached profile or null
//   UsersStore.isAdmin()                 → bool
//   UsersStore.updateProfile({fullName?,phone?})
//
// Implementation note: the Firebase JS SDK is ES-modules-only on the
// CDN. We dynamically import it once at startup and stash the resolved
// promise on `window.__firebaseReady` so callers can `await` it.

(function () {
    const ADMIN_EMAILS = (Array.isArray(window.ADMIN_EMAILS) && window.ADMIN_EMAILS.length)
        ? window.ADMIN_EMAILS.map(e => String(e).toLowerCase())
        : [String(window.ADMIN_EMAIL || 'deb@andamanvoyages.in').toLowerCase()];
    const ADMIN_EMAIL  = ADMIN_EMAILS[0]; // legacy single
    const STAFF_EMAILS = (Array.isArray(window.STAFF_EMAILS) && window.STAFF_EMAILS.length)
        ? window.STAFF_EMAILS.map(e => String(e).toLowerCase())
        : [];
    function isAdminEmail(email) {
        return !!email && ADMIN_EMAILS.indexOf(String(email).toLowerCase()) >= 0;
    }
    function isStaffEmail(email) {
        return !!email && STAFF_EMAILS.indexOf(String(email).toLowerCase()) >= 0;
    }
    const SDK_VERSION  = '10.13.2';
    const APP_URL       = `https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`;
    const AUTH_URL      = `https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`;
    const FIRESTORE_URL = `https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-firestore.js`;

    const PACKAGES_CACHE_KEY = 'sitePackages';
    const USER_CACHE_KEY     = 'currentUser';

    // ── Bootstrap Firebase once ────────────────────────────────
    window.__firebaseReady = (async function init() {
        if (!window.FIREBASE_CONFIG) {
            throw new Error('Missing window.FIREBASE_CONFIG (load js/firebase-config.js first)');
        }
        const [
            { initializeApp },
            authMod,
            firestoreMod
        ] = await Promise.all([
            import(APP_URL),
            import(AUTH_URL),
            import(FIRESTORE_URL)
        ]);

        const app  = initializeApp(window.FIREBASE_CONFIG);
        const auth = authMod.getAuth(app);
        try { await authMod.setPersistence(auth, authMod.browserLocalPersistence); } catch (_) {}
        const db   = firestoreMod.getFirestore(app);

        // ── Firestore READ tracer + daily cap ─────────────────────────
        // Wraps the modular getDoc / getDocs exports so every read is:
        //   1. counted (per-caller, total, daily-rolling)
        //   2. optionally logged with a stack trace
        //   3. blocked once the daily count exceeds DAILY_READ_CAP
        //      (a defensive guardrail to prevent accidental overruns
        //      like the 761K-read incident on 24 May 2026).
        //
        // The daily counter is keyed by today's YYYY-MM-DD in localStorage
        // and shared across ALL pages of the same Firebase project, so
        // navigating dashboard → migrate → home all draws from the same
        // budget. When the cap is hit, every getDoc/getDocs throws a
        // friendly error — admin sees a Toast / console error instead of
        // silently burning the free tier.
        //
        // Inspect at any time:
        //     console.table(window.__fsReadStats.byCaller)
        //     window.__fsReadStats.totalToday
        //     window.__fsReadStats.summary()
        // Verbose mode prints every read to the console:
        //     localStorage.setItem('__fsTrace', '1'); location.reload();
        try {
            const DAILY_READ_CAP = 40000;     // Firestore free tier = 50K/day; cap at 40K so we leave 10K buffer.
            const todayKey = (function () {
                const d = new Date();
                return d.getFullYear() + '-' +
                    String(d.getMonth()+1).padStart(2, '0') + '-' +
                    String(d.getDate()).padStart(2, '0');
            })();
            // localStorage-backed counter per project per day
            const dailyKey  = '__fsReadDaily:' + (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.projectId || '?') + ':' + todayKey;
            function getDailyCount() {
                try { return parseInt(localStorage.getItem(dailyKey) || '0', 10) || 0; }
                catch (_) { return 0; }
            }
            function setDailyCount(n) {
                try { localStorage.setItem(dailyKey, String(n)); } catch (_) {}
            }
            const stats = window.__fsReadStats = window.__fsReadStats || {
                total: 0,
                totalToday: getDailyCount(),
                snapshots: 0,
                byCaller: {},
                cap: DAILY_READ_CAP,
                capHit: false,
                verbose: (function () {
                    try { return localStorage.getItem('__fsTrace') === '1'; } catch (_) { return false; }
                })(),
                reset: function () {
                    this.total = 0; this.snapshots = 0; this.byCaller = {}; this.capHit = false;
                },
                resetDaily: function () {
                    // Admin override — clear today's daily count to give
                    // yourself another budget if you've intentionally hit
                    // the cap (e.g. running a one-off mirror).
                    setDailyCount(0); this.totalToday = 0; this.capHit = false;
                },
                summary: function () {
                    return {
                        total: this.total,
                        totalToday: this.totalToday,
                        cap: this.cap,
                        remainingToday: Math.max(0, this.cap - this.totalToday),
                        snapshots: this.snapshots,
                        callers: Object.assign({}, this.byCaller)
                    };
                }
            };
            stats.totalToday = getDailyCount();
            stats.capHit     = stats.totalToday >= DAILY_READ_CAP;
            const projectId = (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.projectId) || '?';
            const origGetDoc  = firestoreMod.getDoc;
            const origGetDocs = firestoreMod.getDocs;

            // Try to extract a friendly description of the ref / query target.
            function describe(target) {
                try {
                    if (!target) return '?';
                    if (target.path) return target.path;                 // DocumentReference
                    if (target.type === 'collection' && target.path) return target.path;
                    if (target._query && target._query.path && target._query.path.canonicalString) {
                        return target._query.path.canonicalString();      // Query
                    }
                    if (target._key && target._key.path && target._key.path.canonicalString) {
                        return target._key.path.canonicalString();        // DocumentReference (older shape)
                    }
                } catch (_) {}
                return target.constructor && target.constructor.name || '?';
            }
            // Capture a 3-frame stack trace excluding the wrapper itself.
            // Use this to identify the call site responsible for the read.
            function caller() {
                try {
                    const lines = (new Error()).stack.split('\n');
                    // Skip 0=Error,1=caller,2=wrapper,3=…go a few past us.
                    const sliced = lines.slice(3, 6).map(s => s.trim()).join('\n  ');
                    return sliced || '?';
                } catch (_) { return '?'; }
            }
            function tally(label, docs) {
                stats.total      += docs;
                stats.totalToday += docs;
                setDailyCount(stats.totalToday);
                stats.byCaller[label] = (stats.byCaller[label] || 0) + docs;
                if (stats.totalToday >= DAILY_READ_CAP && !stats.capHit) {
                    stats.capHit = true;
                    console.error('%c[fs read] DAILY CAP HIT — additional reads will be blocked', 'color:#c0392b;font-weight:bold;font-size:12px');
                    console.error('  totalToday =', stats.totalToday, '  cap =', DAILY_READ_CAP);
                    console.error('  Override: window.__fsReadStats.resetDaily()');
                    if (window.Toast) {
                        try { window.Toast.error('Daily Firestore read budget exhausted (' + DAILY_READ_CAP + ' reads). Further reads are blocked until midnight to protect the free tier.', { duration: 9000 }); } catch (_) {}
                    }
                }
                if (stats.verbose) {
                    console.log('%c[fs read]%c ' + label + ' (' + docs + ' doc' + (docs === 1 ? '' : 's') +
                        ', today=' + stats.totalToday + '/' + DAILY_READ_CAP + ')',
                        'color:#0d7a8a;font-weight:bold', 'color:inherit');
                    console.log('  caller:\n  ' + caller());
                }
            }
            // Pre-flight check — refuses the call once cap is hit so we
            // never go ABOVE the cap, even on the read that would push
            // us over it. (We accept that the call that pushes us over
            // is allowed; everything after is blocked.)
            function ensureBelowCap(label) {
                if (stats.totalToday >= DAILY_READ_CAP) {
                    const err = new Error(
                        'Firestore daily read cap reached (' + DAILY_READ_CAP + '). ' +
                        'This read (' + label + ') was BLOCKED to protect the free tier. ' +
                        'Override: window.__fsReadStats.resetDaily()'
                    );
                    err.code = 'fs/daily-cap-exceeded';
                    throw err;
                }
            }

            firestoreMod.getDoc = async function (ref) {
                const label = 'getDoc:' + projectId + ':' + describe(ref);
                ensureBelowCap(label);
                const out = await origGetDoc.call(this, ref);
                tally(label, 1);
                return out;
            };
            firestoreMod.getDocs = async function (qOrRef) {
                const label = 'getDocs:' + projectId + ':' + describe(qOrRef);
                ensureBelowCap(label);
                const out = await origGetDocs.call(this, qOrRef);
                const n = (out && out.size) || 0;
                tally(label, n);
                return out;
            };
        } catch (traceErr) {
            console.warn('[fs read] tracer install failed:', traceErr);
        }

        // Wire auth-state listener so the cached profile stays in sync
        authMod.onAuthStateChanged(auth, async (authUser) => {
            if (!authUser) {
                cacheProfile(null);
                fireAuthListeners(null);
                return;
            }
            let extra = null;
            try { extra = await fetchUserDoc(authUser.uid); } catch (_) {}
            const profile = profileFromUser(authUser, extra);
            cacheProfile(profile);
            fireAuthListeners(profile);
        });

        return { app, auth, db, firebaseAuth: authMod, firestore: firestoreMod };
    })();

    // Surface init errors so callers can fail fast
    window.__firebaseReady.catch(err => console.error('Firebase init failed:', err));

    // ── Local cache helpers ─────────────────────────────────────
    function getCachedPackages() {
        try {
            const raw = localStorage.getItem(PACKAGES_CACHE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) && parsed.length ? parsed : null;
        } catch (_) { return null; }
    }
    function setCachedPackages(data) {
        try { localStorage.setItem(PACKAGES_CACHE_KEY, JSON.stringify(data)); } catch (_) {}
    }

    async function loadFromRepoFile() {
        try {
            const res = await fetch('data/packages.json?t=' + Date.now(), { cache: 'no-store' });
            if (!res.ok) return null;
            const data = await res.json();
            return Array.isArray(data) && data.length ? data : null;
        } catch (_) { return null; }
    }

    // ───────────────────────────────────────────────────────────
    // PackagesStore
    // ───────────────────────────────────────────────────────────
    async function loadFromFirestore() {
        const { db, firestore } = await window.__firebaseReady;
        const snap = await firestore.getDocs(firestore.collection(db, 'packages'));
        if (snap.empty) return null;

        const list = [];
        snap.forEach(d => {
            const data = d.data() || {};
            list.push({ id: d.id, ...data });
        });
        list.sort((a, b) => {
            const oa = (a.order != null) ? a.order : 999;
            const ob = (b.order != null) ? b.order : 999;
            return oa - ob;
        });
        return list;
    }

    async function loadPackages() {
        // 1. Authoritative: Firestore
        try {
            const data = await loadFromFirestore();
            if (data && data.length) {
                setCachedPackages(data);
                return { data, source: 'firestore' };
            }
        } catch (e) {
            console.warn('Firestore packages read failed; falling back', e);
        }
        // 2. Static fallback file in the repo
        const repoData = await loadFromRepoFile();
        if (repoData) {
            setCachedPackages(repoData);
            return { data: repoData, source: 'repo' };
        }
        // 3. Cached
        const cached = getCachedPackages();
        if (cached) return { data: cached, source: 'cache' };

        return { data: null, source: 'none' };
    }

    async function loadPackagesSWR(onUpdate) {
        const cached = getCachedPackages();
        if (cached && typeof onUpdate === 'function') {
            try { onUpdate(cached, 'cache'); } catch (_) {}
        }
        const fresh = await loadPackages();
        if (fresh.data && typeof onUpdate === 'function') {
            try { onUpdate(fresh.data, fresh.source); } catch (_) {}
        }
        return fresh;
    }

    async function publishPackages(packages) {
        if (!Array.isArray(packages)) throw new Error('packages must be an array');
        setCachedPackages(packages);

        const { db, auth, firestore } = await window.__firebaseReady;
        const user = auth.currentUser;
        if (!user) throw new Error('You must be signed in as the admin to publish.');

        // Permission model:
        //   • Admin → full publish: write/merge every package AND delete
        //     any package in Firestore that's missing from the new array.
        //   • Staff → "save" only: update existing packages they can see.
        //     Staff CANNOT create new packages (firestore.rules denies it)
        //     and CANNOT delete (rules deny it). The dashboard hides those
        //     buttons; this function additionally guards against accidental
        //     deletes when a staff user hits Save & Publish.
        const admin = isAdminEmail(user.email);
        const staff = isStaffEmail(user.email);
        if (!admin && !staff) {
            throw new Error('Only an admin or staff user can publish packages.');
        }

        const colRef = firestore.collection(db, 'packages');
        const existingSnap = await firestore.getDocs(colRef);
        const existingIds = new Set();
        existingSnap.forEach(d => existingIds.add(d.id));
        const newIds = new Set(packages.map(p => String(p.id)));
        const batch = firestore.writeBatch(db);

        if (admin) {
            // Full write — set every package, delete missing ones.
            packages.forEach((pkg, idx) => {
                const id = String(pkg.id || ('pkg_' + Date.now() + '_' + idx));
                const docRef = firestore.doc(db, 'packages', id);
                const payload = {
                    ...pkg,
                    id,
                    order: idx,
                    updatedAt: firestore.serverTimestamp()
                };
                batch.set(docRef, payload, { merge: false });
            });
            existingSnap.forEach(d => {
                if (!newIds.has(d.id)) {
                    batch.delete(firestore.doc(db, 'packages', d.id));
                }
            });
            await batch.commit();
            return { count: packages.length, role: 'admin' };
        }

        // ── Staff path ────────────────────────────────────────
        // Update only packages whose id already exists in Firestore.
        // Skip new ones (firestore.rules would reject them anyway), and
        // never issue deletes. Use update() (not set()) so we patch in
        // place without wiping unknown server-side fields.
        let updated = 0, skipped = 0;
        packages.forEach((pkg, idx) => {
            const id = String(pkg.id || '');
            if (!id || !existingIds.has(id)) {
                skipped++;
                return;
            }
            const docRef = firestore.doc(db, 'packages', id);
            // Strip the id field from the patch so we don't overwrite it
            // (and to keep the payload minimal).
            const { id: _ignored, ...rest } = pkg;
            const payload = {
                ...rest,
                order: idx,
                updatedAt: firestore.serverTimestamp()
            };
            batch.update(docRef, payload);
            updated++;
        });

        if (updated === 0) {
            throw new Error(
                'Staff users can only update existing packages.\n\n' +
                'No matching packages were found to update' +
                (skipped ? ' (' + skipped + ' new package(s) skipped — ask an admin to add them).' : '.')
            );
        }
        await batch.commit();
        return { count: updated, skipped, role: 'staff' };
    }

    window.PackagesStore = {
        load: loadPackages,
        loadWithStaleWhileRevalidate: loadPackagesSWR,
        publish: publishPackages,
        clearKey: function () {},                 // no-op (Firebase Auth manages creds)
        get isConfigured() { return true; }
    };

    // ───────────────────────────────────────────────────────────
    // SettingsStore — site-wide flags (e.g. payments enabled)
    //   Firestore doc: /settings/site
    //   Public read, admin-only write (enforced in firestore.rules).
    // ───────────────────────────────────────────────────────────
    const SETTINGS_CACHE_KEY = 'siteSettings';
    const SETTINGS_DEFAULT   = {
        paymentsEnabled: true,
        paymentsDisabledMessage: '',
        // When true, security.js blocks DevTools shortcuts/right-click for normal
        // visitors. Admins are always allowed to use DevTools regardless.
        consoleLockEnabled: true,
        // Default % of total trip cost charged as advance to confirm a booking.
        // Stored as a percentage number (e.g. 5 means 5%, 10 means 10%).
        // Can be overridden per-user via users/{uid}.advanceRate.
        advanceRate: 5,

        // ── Razorpay TEST mode (admin-toggleable) ─────────────
        // When `razorpayTestMode` is TRUE *and* `razorpayTestKeyId` is set
        // to a valid `rzp_test_…` key, js/checkout.js will use the test
        // key instead of the hard-coded LIVE key — Razorpay then runs in
        // its sandbox, so test cards (4111…1111) work and no real money
        // moves. Toggle off (or leave the test key blank) to revert
        // checkout to the LIVE key the moment Settings are saved.
        // The Razorpay SECRET (used by the refund Worker) is NEVER stored
        // in Firestore — it lives only in Cloudflare Worker secrets.
        // See razorpay_test_mode_guide.md for the full procedure.
        razorpayTestMode:  false,
        razorpayTestKeyId: '',

        // ── Conversion Boosters (admin-toggleable) ─────────────
        // Each flag is read by js/conversion-kit.js and the relevant
        // page scripts. Flip any of them off in the admin dashboard
        // (Settings → Conversion Boosters) and the corresponding
        // widget/feature disappears from the live site immediately.
        urgencyBarEnabled:        true,   // sticky red bar on package.html with countdown
        urgencyBarMessage:        '🔥 Bookings closing soon — reserve your seats today',
        whatsappFabEnabled:       true,   // floating WhatsApp button on every public page
        whatsappFabNumber:        '918880195191', // E.164 without "+"
        whatsappFabMessage:       "Hi! I'm interested in an Andaman package — could you share more details?",
        exitIntentCouponEnabled:  true,   // popup when mouse leaves window — gives 10% coupon
        exitIntentCouponCode:     'COMEBACK10',
        exitIntentCouponPercent:  10,
        launchAdvanceCouponEnabled: true, // LAUNCH2000 coupon → flat ₹2,000 advance instead of ₹6K/₹11K
        launchAdvanceCouponCode:    'LAUNCH2000',
        launchAdvanceCouponAmount:  2000,
        googleReviewsEnabled:     true,   // pulls live Google reviews on the homepage testimonials section
        landingPagesEnabled:      true,   // /lp/honeymoon and /lp/family ad-landing pages

        // ── Chat widget provider (admin-toggleable) ──────────
        // Controls which chat experience is rendered on the public
        // site:
        //   'brevo'  — load Brevo Conversations widget (third-party)
        //   'custom' — load our own widget (js/chat.js) which persists
        //              every message to /chats in Firestore so the admin
        //              can read & reply from the dashboard, and (when a
        //              WhatsApp Cloud API token is set) DMs the admin's
        //              phone so they can chat from WhatsApp directly.
        //   'none'   — no chat bubble at all
        // Default = 'custom' so admins see the new Firestore-backed
        // widget out of the box; flip to 'brevo' in Settings to fall
        // back to the third-party widget.
        chatProvider:             'custom',

        // ── WhatsApp Cloud API bridge (admin-only) ───────────
        // When the chat provider is 'custom' AND whatsappBridgeEnabled
        // is true, every new customer chat message is forwarded to the
        // admin's WhatsApp via Meta's Cloud API. Admin replies on
        // WhatsApp arrive at the worker's webhook and land back in the
        // customer's open chat session in real-time.
        //
        // The Meta Access Token + App Secret are NEVER stored in this
        // doc — they live as Cloudflare Worker secrets on the
        // whatsapp-bridge Worker. Only the public bits go here.
        whatsappBridgeEnabled:    false,
        whatsappBridgeWorkerUrl:  '',     // e.g. https://whatsapp-bridge.<acc>.workers.dev
        whatsappBridgeAdminPhone: '',     // E.164 without '+', e.g. 918880195191
        whatsappBridgePhoneNumberId: '',  // Meta WhatsApp Phone Number ID (numeric)

        // ── Gallery upload-form dropdown options (admin-managed) ──
        // The staff-facing upload form on /dashboard locks Category /
        // Place / Package to a fixed dropdown so they can ONLY pick from
        // values pre-approved by the admin. Admins can extend each list
        // from Settings → "Manage Gallery Dropdowns". Stored as plain
        // string arrays so Firestore can update them atomically with
        // arrayUnion / arrayRemove if we ever need that later.
        galleryCategoryOptions: ['Beaches', 'Islands', 'Activities', 'Resorts', 'Sunsets'],
        galleryPlaceOptions:    ['Port Blair', 'Havelock Island', 'Neil Island', 'Ross Island', 'Baratang', 'Diglipur', 'Radhanagar Beach', 'Elephant Beach', 'Cellular Jail'],
        galleryPackageOptions:  ['Budget', 'Standard', 'Luxury', 'Honeymoon', 'Family', 'Adventure']
    };

    function getCachedSettings() {
        try {
            const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
            if (!raw) return null;
            const obj = JSON.parse(raw);
            return Object.assign({}, SETTINGS_DEFAULT, obj || {});
        } catch (_) {
            return null;
        }
    }
    function setCachedSettings(s) {
        try { localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(s)); } catch (_) {}
    }

    async function loadSettings() {
        try {
            const { db, firestore } = await window.__firebaseReady;
            const ref  = firestore.doc(db, 'settings', 'site');
            const snap = await firestore.getDoc(ref);
            if (snap.exists()) {
                const data = Object.assign({}, SETTINGS_DEFAULT, snap.data() || {});
                setCachedSettings(data);
                return data;
            }
        } catch (e) {
            console.warn('Settings read failed; using cache/defaults', e);
        }
        const cached = getCachedSettings();
        return cached || Object.assign({}, SETTINGS_DEFAULT);
    }

    async function saveSettings(patch) {
        const { db, auth, firestore } = await window.__firebaseReady;
        const user = auth.currentUser;
        if (!user) throw new Error('You must be signed in as the admin to change settings.');
        if (!isAdminEmail(user.email)) throw new Error('Only an admin user can change settings.');

        const ref = firestore.doc(db, 'settings', 'site');
        const payload = Object.assign({}, patch || {}, { updatedAt: firestore.serverTimestamp() });
        await firestore.setDoc(ref, payload, { merge: true });

        // Update local cache so subsequent reads on this device are instant.
        const merged = Object.assign({}, getCachedSettings() || SETTINGS_DEFAULT, patch || {});
        setCachedSettings(merged);
        return merged;
    }

    window.SettingsStore = {
        load:  loadSettings,
        save:  saveSettings,
        cached: getCachedSettings,
        DEFAULTS: Object.freeze(Object.assign({}, SETTINGS_DEFAULT))
    };

    // ───────────────────────────────────────────────────────────
    // UsersStore
    // ───────────────────────────────────────────────────────────
    let _currentProfile = null;
    const _authListeners = [];

    function fireAuthListeners(profile) {
        _authListeners.forEach(fn => {
            try { fn(profile); } catch (_) {}
        });
    }

    function cacheProfile(profile) {
        _currentProfile = profile;
        if (profile) {
            try { localStorage.setItem(USER_CACHE_KEY, JSON.stringify(profile)); } catch (_) {}
            try { localStorage.setItem('token', 'firebase'); } catch (_) {}
        } else {
            try { localStorage.removeItem(USER_CACHE_KEY); } catch (_) {}
            try { localStorage.removeItem('token'); } catch (_) {}
        }
    }

    function profileFromUser(authUser, extra) {
        if (!authUser) return null;
        const isAdmin = isAdminEmail(authUser.email);
        return {
            id: authUser.uid,
            uid: authUser.uid,
            email: authUser.email || '',
            username: (extra && extra.username) || authUser.displayName || (authUser.email || '').split('@')[0],
            fullName: (extra && extra.fullName) || authUser.displayName || '',
            phone:    (extra && extra.phone) || '',
            role:     isAdmin ? 'admin' : ((extra && extra.role) || 'user'),
            // photoURL is the Cloudinary-hosted profile picture URL set
            // by uploadProfilePicture() / cleared by removeProfilePicture().
            // Empty string means "use the default initials avatar".
            photoURL: (extra && extra.photoURL) || authUser.photoURL || ''
        };
    }

    async function fetchUserDoc(uid) {
        const { db, firestore } = await window.__firebaseReady;
        try {
            const snap = await firestore.getDoc(firestore.doc(db, 'users', uid));
            return snap.exists() ? snap.data() : null;
        } catch (_) { return null; }
    }

    async function lookupUsername(username) {
        const { db, firestore } = await window.__firebaseReady;
        try {
            const snap = await firestore.getDoc(firestore.doc(db, 'usernames', username.toLowerCase()));
            return snap.exists() ? snap.data() : null;
        } catch (_) { return null; }
    }

    async function registerUser({ username, email, password, fullName, phone }) {
        username = (username || '').trim();
        email    = (email || '').trim().toLowerCase();
        if (!username || !email || !password) throw new Error('All fields are required.');
        if (username.length < 3) throw new Error('Username must be at least 3 characters long.');
        if (username.toLowerCase() === 'deb') throw new Error('This username is reserved.');

        const { db, auth, firebaseAuth, firestore } = await window.__firebaseReady;

        // Best-effort uniqueness check (rules enforce too)
        const existing = await lookupUsername(username);
        if (existing) throw new Error('Username already taken.');

        const cred = await firebaseAuth.createUserWithEmailAndPassword(auth, email, password);
        const uid = cred.user.uid;

        try { await firebaseAuth.updateProfile(cred.user, { displayName: username }); } catch (_) {}

        // ── Send verification email (free, unlimited via Firebase Auth) ──
        // Admins are exempt — they're trusted by the email allowlist.
        var emailVerifSent = false;
        var emailVerifError = null;
        if (!isAdminEmail(email)) {
            // Helper: detect the "domain not authorised for continue URL"
            // error in either the v8 (err.code) OR v9-modular shape (the
            // SDK sometimes only sets err.message). When this fires it
            // means the customer's redirect URL isn't on the project's
            // Authorized Domains list yet — we silently retry without
            // the continue URL so the email still goes out.
            function isUnauthorizedContinueUri(err) {
                if (!err) return false;
                if (err.code === 'auth/unauthorized-continue-uri') return true;
                var msg = String(err.message || err || '').toLowerCase();
                return msg.indexOf('unauthorized-continue-uri') >= 0
                    || msg.indexOf('domain not allowlisted') >= 0
                    || msg.indexOf('domain not whitelisted') >= 0;
            }
            try {
                // First attempt: send WITH a redirect URL pointing back to
                // the site. The redirect URL must be on your Firebase
                // Authorized Domains list (Firebase Console → Authentication
                // → Settings → Authorized domains). If it isn't, we fall
                // back to a no-redirect send (Firebase's default landing
                // page is used instead).
                try {
                    await firebaseAuth.sendEmailVerification(cred.user, {
                        url: window.location.origin + '/?verified=1',
                        handleCodeInApp: false
                    });
                    emailVerifSent = true;
                } catch (innerErr) {
                    if (isUnauthorizedContinueUri(innerErr)) {
                        console.warn('[Firebase] Continue URL not authorized — retrying without redirect…');
                        // No `actionCodeSettings` arg → Firebase uses its
                        // own default landing page, which doesn't require
                        // any domain to be allowlisted.
                        await firebaseAuth.sendEmailVerification(cred.user);
                        emailVerifSent = true;
                    } else {
                        throw innerErr;
                    }
                }
            } catch (err) {
                emailVerifError = err && (err.code || err.message) || String(err);
                console.error('[Firebase] sendEmailVerification FAILED:', err);
                console.error('  → code:', err && err.code);
                console.error('  → message:', err && err.message);
                console.error('  → If this is auth/unauthorized-continue-uri:');
                console.error('     Add your domain at https://console.firebase.google.com/project/' +
                    (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.projectId) +
                    '/authentication/settings (Authorized domains).');
            }
        }

        const batch = firestore.writeBatch(db);
        batch.set(firestore.doc(db, 'users', uid), {
            uid,
            email,
            username,
            usernameLower: username.toLowerCase(),
            fullName: fullName || '',
            phone: phone || '',
            role: isAdminEmail(email) ? 'admin' : 'user',
            emailVerified: !!cred.user.emailVerified, // false for non-admins
            createdAt: firestore.serverTimestamp()
        });
        batch.set(firestore.doc(db, 'usernames', username.toLowerCase()), {
            uid,
            email,
            username
        });
        await batch.commit();

        var profile = profileFromUser(cred.user, {
            username, fullName: fullName || '', phone: phone || '',
            role: isAdminEmail(email) ? 'admin' : 'user',
            emailVerified: !!cred.user.emailVerified
        });
        profile.emailVerifSent = emailVerifSent; // surface to UI
        return profile;
    }

    // Re-send the email-verification message for the currently signed-in user
    async function resendEmailVerification() {
        const { auth, firebaseAuth } = await window.__firebaseReady;
        if (!auth.currentUser) throw new Error('You must be signed in to resend.');
        if (auth.currentUser.emailVerified) throw new Error('Your email is already verified.');
        await firebaseAuth.sendEmailVerification(auth.currentUser, {
            url: window.location.origin + '/?verified=1',
            handleCodeInApp: false
        });
    }

    // Force-refresh the auth user, then mirror the latest emailVerified
    // flag into the Firestore profile so admin tables and gates see it.
    async function refreshEmailVerifiedStatus() {
        const { auth, db, firestore } = await window.__firebaseReady;
        const u = auth.currentUser;
        if (!u) return false;
        try { await u.reload(); } catch (_) {}
        const ok = !!u.emailVerified;
        try {
            await firestore.updateDoc(firestore.doc(db, 'users', u.uid), {
                emailVerified: ok,
                emailVerifiedAt: ok ? firestore.serverTimestamp() : null
            });
        } catch (err) {
            console.warn('Failed to mirror emailVerified to Firestore:', err);
        }
        return ok;
    }

    // identifier may be a username OR an email
    async function loginUser(identifier, password) {
        if (!identifier || !password) throw new Error('Please enter your username/email and password.');
        const { auth, firebaseAuth } = await window.__firebaseReady;

        let email = identifier.trim();
        if (email.indexOf('@') === -1) {
            // Treat as username — look up the email
            const map = await lookupUsername(email);
            if (!map || !map.email) throw new Error('Invalid username/email or password.');
            email = map.email;
        }
        try {
            const cred = await firebaseAuth.signInWithEmailAndPassword(auth, email, password);
            const extra = await fetchUserDoc(cred.user.uid).catch(() => null);

            // Soft-disable: if the admin marked this profile disabled, refuse login.
            if (extra && extra.disabled === true) {
                try { await firebaseAuth.signOut(auth); } catch (_) {}
                throw new Error('This account has been disabled. Please contact support.');
            }

            // onAuthStateChanged will run cacheProfile; but also return a profile now
            const profile = profileFromUser(cred.user, extra);
            cacheProfile(profile);
            return profile;
        } catch (err) {
            // Map common Firebase errors to friendly text
            const code = err && err.code;
            if (code === 'auth/wrong-password' || code === 'auth/user-not-found' || code === 'auth/invalid-credential') {
                throw new Error('Invalid username/email or password.');
            }
            if (code === 'auth/too-many-requests') {
                throw new Error('Too many failed attempts. Please try again in a few minutes.');
            }
            throw new Error(err.message || 'Login failed.');
        }
    }

    async function logoutUser() {
        const { auth, firebaseAuth } = await window.__firebaseReady;
        await firebaseAuth.signOut(auth);
        cacheProfile(null);
    }

    // ── Forgot password / username helpers ──
    //
    // Strategy:
    //   1) If window.AI_ASSISTANT_WORKER_URL is configured (it is, on
    //      production), call /password-reset on that worker. The worker
    //      generates a reset link via Identity Toolkit and emails it via
    //      Brevo from noreply@andamanvoyages.in — DKIM/SPF/DMARC aligned
    //      so it lands in the inbox, not spam.
    //   2) If the worker is unreachable OR not configured, fall back to
    //      Firebase Auth's built-in sendPasswordResetEmail() — it WILL
    //      go to spam, but at least the user gets a reset option.
    //
    // The worker is anti-enumeration: it ALWAYS returns { ok: true }
    // regardless of whether the email is registered, so a malicious
    // caller can't probe for valid accounts. We mirror that here by
    // resolving with the email even on a 200 reply.
    async function sendPasswordReset(identifier) {
        if (!identifier) throw new Error('Please enter your username or email.');
        let email = identifier.trim();
        if (email.indexOf('@') === -1) {
            const map = await lookupUsername(email);
            if (!map || !map.email) throw new Error('We could not find that username.');
            email = map.email;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw new Error('That does not look like a valid email.');
        }

        // 1) Preferred path — branded email via our Worker (no spam).
        //    The Worker (workers/ai-assistant/password-reset.js)
        //    generates a real Firebase reset link via the Identity
        //    Toolkit REST API and ships it through Brevo FROM
        //    noreply@andamanvoyages.in (verified SPF/DKIM/DMARC),
        //    so Gmail places it in the inbox instead of the spam folder.
        //    Configure window.AI_ASSISTANT_WORKER_URL in
        //    js/firebase-config.js. We also accept the legacy
        //    PASSWORD_RESET_WORKER_URL / EMAIL_ROUTER_WORKER_URL names
        //    in case an older deployment still uses them.
        const workerUrl = (
            window.AI_ASSISTANT_WORKER_URL   ||
            window.PASSWORD_RESET_WORKER_URL ||
            window.EMAIL_ROUTER_WORKER_URL   ||
            ''
        ).replace(/\/+$/, '');
        if (workerUrl) {
            try {
                const res = await fetch(workerUrl + '/password-reset', {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ email })
                });
                if (res.ok) {
                    // Worker is anti-enumeration: { ok:true } even when
                    // the email isn't registered. We surface the same
                    // friendly success to the user.
                    return email;
                }
                if (res.status === 429) {
                    throw new Error('Too many reset requests. Please try again in an hour.');
                }
                const txt = await res.text().catch(() => '');
                console.warn('[sendPasswordReset] worker responded', res.status, '— falling back to Firebase. Body:', txt);
            } catch (err) {
                if (err && err.message && err.message.indexOf('Too many') === 0) throw err;
                console.warn('[sendPasswordReset] worker call failed, falling back:', err);
            }
        }

        // 2) Fallback — Firebase's built-in (may land in spam)
        const { auth, firebaseAuth } = await window.__firebaseReady;
        try {
            await firebaseAuth.sendPasswordResetEmail(auth, email);
            return email;
        } catch (err) {
            const code = err && err.code;
            if (code === 'auth/user-not-found') throw new Error('No account found for that email.');
            if (code === 'auth/invalid-email') throw new Error('That does not look like a valid email.');
            throw new Error(err.message || 'Could not send reset email.');
        }
    }

    // Find the username(s) tied to an email.
    // Uses a Firestore query on usersnames.email (works because rules
    // allow public read of the usernames collection).
    async function lookupUsernamesByEmail(email) {
        if (!email) throw new Error('Please enter your email.');
        const { db, firestore } = await window.__firebaseReady;
        const lower = email.trim().toLowerCase();
        const q = firestore.query(
            firestore.collection(db, 'usernames'),
            firestore.where('email', '==', lower)
        );
        const snap = await firestore.getDocs(q);
        const out = [];
        snap.forEach(d => {
            const data = d.data() || {};
            if (data.username) out.push(data.username);
            else out.push(d.id);
        });
        return out;
    }

    async function updateProfile(updates) {
        const { db, auth, firestore } = await window.__firebaseReady;
        const user = auth.currentUser;
        if (!user) throw new Error('Not signed in.');
        const allowed = {};
        if (typeof updates.fullName === 'string') allowed.fullName = updates.fullName;
        if (typeof updates.phone    === 'string') allowed.phone    = updates.phone;
        if (typeof updates.address  === 'string') allowed.address  = updates.address;
        if (typeof updates.city     === 'string') allowed.city     = updates.city;
        if (typeof updates.state    === 'string') allowed.state    = updates.state;
        if (typeof updates.zip      === 'string') allowed.zip      = updates.zip;
        if (typeof updates.country  === 'string') allowed.country  = updates.country;
        if (typeof updates.photoURL === 'string') allowed.photoURL = updates.photoURL;
        if (!Object.keys(allowed).length) return _currentProfile;
        await firestore.setDoc(firestore.doc(db, 'users', user.uid), allowed, { merge: true });
        if (_currentProfile) {
            Object.assign(_currentProfile, allowed);
            cacheProfile(_currentProfile);
        }
        return _currentProfile;
    }

    // ── Profile picture upload (Cloudinary + Firestore) ────────────
    // Uploads `file` (a File or Blob) to Cloudinary using the existing
    // unsigned preset (window.CLOUDINARY_CONFIG, set in firebase-config.js)
    // — same preset used by the gallery — but stores it under a
    // user-scoped folder so admin tooling can find / clean these up
    // separately from package gallery photos.
    //
    // On success, the resulting secure_url is written to
    //   users/{uid}.photoURL
    // and to the cached profile (so window.UsersStore.getCurrentUser()
    // immediately reflects the new picture without a Firestore round-trip).
    //
    // The Auth user's photoURL is also updated via firebaseAuth.updateProfile()
    // so any third-party SDK that reads cred.user.photoURL gets the right
    // value too.
    //
    // The uploader purposely does NOT delete the previous Cloudinary
    // asset — Cloudinary's free tier billing is by total bytes, not
    // file count, and unsigned-preset deletes need a signed call which
    // would expose the API secret in the browser. Old pictures simply
    // become unreferenced; admin can purge them in bulk via the
    // Cloudinary dashboard if storage ever balloons.
    async function uploadProfilePicture(file, onProgress) {
        if (!file) throw new Error('No file selected.');
        if (!/^image\//i.test(file.type)) throw new Error('Please choose an image file.');
        if (file.size > 6 * 1024 * 1024) throw new Error('Image is too large (max 6 MB).');

        const cfg = window.CLOUDINARY_CONFIG || {};
        if (!cfg.cloudName || !cfg.uploadPreset) {
            throw new Error('Cloudinary not configured. Ask admin to set window.CLOUDINARY_CONFIG.');
        }

        const { db, auth, firebaseAuth, firestore } = await window.__firebaseReady;
        const user = auth.currentUser;
        if (!user) throw new Error('Not signed in.');

        // 1) Upload to Cloudinary unsigned endpoint
        const url = 'https://api.cloudinary.com/v1_1/' + encodeURIComponent(cfg.cloudName) + '/image/upload';
        const fd = new FormData();
        fd.append('file', file);
        fd.append('upload_preset', cfg.uploadPreset);
        // Tag the asset with the user's uid so admin can clean up later
        fd.append('folder', 'profile-pictures');
        fd.append('public_id', 'avatar_' + user.uid + '_' + Date.now());
        fd.append('tags', 'profile-picture,uid_' + user.uid);

        // Use XMLHttpRequest so we can report progress (fetch() can't yet)
        const result = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', url, true);
            xhr.upload.onprogress = (evt) => {
                if (typeof onProgress === 'function' && evt.lengthComputable) {
                    onProgress((evt.loaded / evt.total) * 100);
                }
            };
            xhr.onload = () => {
                try {
                    const json = JSON.parse(xhr.responseText || '{}');
                    if (xhr.status >= 200 && xhr.status < 300 && json.secure_url) {
                        resolve(json);
                    } else {
                        reject(new Error('Cloudinary error: ' + (json.error && json.error.message || xhr.statusText)));
                    }
                } catch (e) {
                    reject(new Error('Bad Cloudinary response: ' + e.message));
                }
            };
            xhr.onerror = () => reject(new Error('Network error during upload.'));
            xhr.send(fd);
        });

        const photoURL = result.secure_url;

        // 2) Write to Firestore + Auth user
        await firestore.setDoc(
            firestore.doc(db, 'users', user.uid),
            { photoURL, photoUpdatedAt: firestore.serverTimestamp() },
            { merge: true }
        );
        try { await firebaseAuth.updateProfile(user, { photoURL }); } catch (_) {}

        // 3) Update cache
        if (_currentProfile) {
            _currentProfile.photoURL = photoURL;
            cacheProfile(_currentProfile);
        }
        // Notify listeners so the topbar avatar refreshes everywhere
        fireAuthListeners(_currentProfile);
        return photoURL;
    }

    // Clear the user's profile picture so the UI falls back to the
    // initials avatar. Sets photoURL to '' (NOT deleteField — that
    // would force every UI place that reads it to handle `undefined`
    // separately). The Cloudinary asset itself is left in place; see
    // uploadProfilePicture() for the rationale.
    async function removeProfilePicture() {
        const { db, auth, firebaseAuth, firestore } = await window.__firebaseReady;
        const user = auth.currentUser;
        if (!user) throw new Error('Not signed in.');
        await firestore.setDoc(
            firestore.doc(db, 'users', user.uid),
            { photoURL: '', photoUpdatedAt: firestore.serverTimestamp() },
            { merge: true }
        );
        try { await firebaseAuth.updateProfile(user, { photoURL: '' }); } catch (_) {}
        if (_currentProfile) {
            _currentProfile.photoURL = '';
            cacheProfile(_currentProfile);
        }
        fireAuthListeners(_currentProfile);
        return true;
    }

    // Re-authenticate the current user with their current password.
    // Required by Firebase before any sensitive op (changePassword,
    // changeEmail, deleteUser) on a session older than ~5 minutes.
    async function reauthenticate(currentPassword) {
        const { auth, firebaseAuth } = await window.__firebaseReady;
        const user = auth.currentUser;
        if (!user || !user.email) throw new Error('Not signed in.');
        if (!currentPassword) throw new Error('Current password required.');
        if (typeof firebaseAuth.EmailAuthProvider === 'undefined' ||
            typeof firebaseAuth.reauthenticateWithCredential === 'undefined') {
            throw new Error('Re-authentication SDK not available.');
        }
        const cred = firebaseAuth.EmailAuthProvider.credential(user.email, currentPassword);
        await firebaseAuth.reauthenticateWithCredential(user, cred);
        return true;
    }

    // Change password (requires recent re-auth or pass currentPassword)
    async function changePassword(currentPassword, newPassword) {
        if (!newPassword || newPassword.length < 6) {
            throw new Error('New password must be at least 6 characters.');
        }
        const { auth, firebaseAuth } = await window.__firebaseReady;
        const user = auth.currentUser;
        if (!user) throw new Error('Not signed in.');
        if (currentPassword) {
            try { await reauthenticate(currentPassword); }
            catch (err) {
                if (err && err.code === 'auth/wrong-password' ||
                    err && err.code === 'auth/invalid-credential') {
                    throw new Error('Current password is incorrect.');
                }
                throw err;
            }
        }
        await firebaseAuth.updatePassword(user, newPassword);
        return true;
    }

    // Send a password-reset email to the CURRENT signed-in user.
    // Used as an alternative "change password by email link" UX in the
    // profile page. Goes through the same worker-first / Firebase-fallback
    // path as sendPasswordReset() so the email lands in the inbox, not spam.
    async function sendPasswordResetEmail() {
        const { auth } = await window.__firebaseReady;
        const user = auth.currentUser;
        if (!user || !user.email) throw new Error('Not signed in.');
        return sendPasswordReset(user.email);
    }

    // Delete the CURRENT user's account.
    // Two-step verification flow:
    //   1) callerPassword (for password accounts) or recent re-auth
    //   2) Firestore profile + username doc removed
    //   3) Firebase Auth user.delete()
    async function deleteCurrentAccount(currentPassword) {
        const { db, auth, firebaseAuth, firestore } = await window.__firebaseReady;
        const user = auth.currentUser;
        if (!user) throw new Error('Not signed in.');
        if (currentPassword) {
            try { await reauthenticate(currentPassword); }
            catch (err) {
                if (err && (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential')) {
                    throw new Error('Current password is incorrect.');
                }
                throw err;
            }
        }
        // Try to clean up profile + username docs FIRST while we still have
        // permission. Best-effort: any error is logged but doesn't stop the
        // delete (admin can clean up via the dashboard if needed).
        try {
            const userDocSnap = await firestore.getDoc(firestore.doc(db, 'users', user.uid));
            if (userDocSnap.exists()) {
                const data = userDocSnap.data() || {};
                if (data.username) {
                    try { await firestore.deleteDoc(firestore.doc(db, 'usernames', data.username.toLowerCase())); } catch (_) {}
                }
            }
            try { await firestore.deleteDoc(firestore.doc(db, 'users', user.uid)); } catch (_) {}
        } catch (e) {
            console.warn('Profile cleanup failed before delete:', e);
        }
        // Finally — delete the Firebase Auth account itself.
        await firebaseAuth.deleteUser(user);
        cacheProfile(null);
        return true;
    }

    function onAuthChange(cb) {
        if (typeof cb !== 'function') return () => {};
        _authListeners.push(cb);
        // Fire immediately with the current cached profile (may be null)
        try { cb(_currentProfile); } catch (_) {}
        return function unsubscribe() {
            const i = _authListeners.indexOf(cb);
            if (i >= 0) _authListeners.splice(i, 1);
        };
    }

    function getCurrentUser() {
        if (_currentProfile) return _currentProfile;
        try {
            const raw = localStorage.getItem(USER_CACHE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (_) { return null; }
    }

    function isAdmin() {
        const u = getCurrentUser();
        return !!u && (isAdminEmail(u.email) || u.role === 'admin' || u.username === 'deb');
    }
    function isStaff() {
        const u = getCurrentUser();
        return !!u && (isStaffEmail(u.email) || u.role === 'staff');
    }
    function canAccessDashboard() {
        return isAdmin() || isStaff();
    }

    // ── Admin-only helpers (Firestore rules also enforce these) ──
    function ensureAdmin() {
        if (!isAdmin()) throw new Error('Admin access required.');
    }
    function ensureAdminOrStaff() {
        if (!isAdmin() && !isStaff()) throw new Error('Admin or staff access required.');
    }

    async function listAllUsers() {
        ensureAdmin();
        const { db, firestore } = await window.__firebaseReady;
        const snap = await firestore.getDocs(firestore.collection(db, 'users'));
        const list = [];
        snap.forEach(d => list.push({ uid: d.id, ...(d.data() || {}) }));
        // newest first
        list.sort((a, b) => {
            const ta = (a.createdAt && a.createdAt.toMillis) ? a.createdAt.toMillis() : 0;
            const tb = (b.createdAt && b.createdAt.toMillis) ? b.createdAt.toMillis() : 0;
            return tb - ta;
        });
        return list;
    }

    // Soft-disable: flips a `disabled` boolean on the user's profile doc.
    // The login flow checks this and refuses entry.
    async function setUserDisabled(uid, disabled) {
        ensureAdmin();
        const { db, firestore } = await window.__firebaseReady;
        await firestore.setDoc(
            firestore.doc(db, 'users', uid),
            { disabled: !!disabled, disabledAt: disabled ? firestore.serverTimestamp() : null },
            { merge: true }
        );
    }

    // Removes the user's Firestore profile + username mapping(s).
    // ⚠️ Does NOT delete the Firebase Auth account itself — that requires
    // server-side Admin SDK. We provide a Console deep-link instead.
    //
    // Cleanup is defence-in-depth:
    //   1. Delete users/{uid}.
    //   2. Delete the explicitly-passed usernames/{username} mapping.
    //   3. ALSO scan all `usernames` for any doc whose `uid` field matches
    //      the deleted user, and delete those too. This catches:
    //         • Users who renamed their username (old mapping orphaned)
    //         • Users where the row's username arg was missing/typo'd
    //         • Older registrations that ran before username trimming
    //      Without this sweep, the orphan `usernames/<old>` doc keeps
    //      blocking re-registration with "username already taken".
    async function deleteUserProfile(uid, username) {
        ensureAdmin();
        if (!uid) throw new Error('uid is required.');
        const { db, firestore } = await window.__firebaseReady;

        // Pass 1 — find every username doc that still points at this uid
        const orphanIds = new Set();
        if (username) {
            orphanIds.add(String(username).trim().toLowerCase());
        }
        try {
            const q = firestore.query(
                firestore.collection(db, 'usernames'),
                firestore.where('uid', '==', uid)
            );
            const snap = await firestore.getDocs(q);
            snap.forEach(d => orphanIds.add(d.id));
        } catch (err) {
            console.warn('[deleteUserProfile] username-by-uid sweep failed; continuing with explicit username only:', err);
        }

        // Pass 2 — single batch with everything
        const batch = firestore.writeBatch(db);
        batch.delete(firestore.doc(db, 'users', uid));
        orphanIds.forEach(id => {
            if (id) batch.delete(firestore.doc(db, 'usernames', id));
        });
        await batch.commit();

        return {
            uid,
            removedUsernames: Array.from(orphanIds)
        };
    }

    // Admin-only nuclear option: wipe a stale `usernames/{username}` doc
    // by name, regardless of who currently owns it. Use this to recover
    // from orphaned mappings when the original delete didn't sweep them
    // (e.g. very old accounts created before the auto-sweep landed).
    //
    //     await window.UsersStore.adminDeleteUsername('staff')
    //     // → { username: 'staff', existed: true, ownerUid: '...' }
    async function adminDeleteUsername(username) {
        ensureAdmin();
        if (!username) throw new Error('username is required.');
        const lower = String(username).trim().toLowerCase();
        const { db, firestore } = await window.__firebaseReady;
        const ref = firestore.doc(db, 'usernames', lower);
        let existed = false;
        let ownerUid = null;
        try {
            const snap = await firestore.getDoc(ref);
            existed = snap.exists();
            if (existed) ownerUid = (snap.data() || {}).uid || null;
        } catch (_) {}
        await firestore.deleteDoc(ref);
        return { username: lower, existed, ownerUid };
    }

    // Direct password-reset for an arbitrary email (admin convenience).
    // Routed through the same worker-first / Firebase-fallback path as
    // sendPasswordReset() so the email lands in the customer's inbox
    // (not spam) when the admin triggers it from the dashboard.
    async function adminSendPasswordReset(email) {
        ensureAdmin();
        if (!email) throw new Error('No email provided.');
        return sendPasswordReset(email);
    }

    // Admin-only: set or clear a per-user advance-rate override (percentage).
    // Pass a number 0–100 to override; pass null/undefined to clear and fall
    // back to the global SettingsStore advanceRate.
    async function adminSetUserAdvanceRate(uid, ratePercentOrNull) {
        ensureAdmin();
        if (!uid) throw new Error('uid is required.');
        const { db, firestore } = await window.__firebaseReady;

        let payload;
        if (ratePercentOrNull === null || ratePercentOrNull === undefined || ratePercentOrNull === '') {
            // deleteField clears the override so checkout falls back to global.
            payload = { advanceRate: firestore.deleteField() };
        } else {
            const n = Number(ratePercentOrNull);
            if (!isFinite(n) || n < 0 || n > 100) {
                throw new Error('Advance rate must be a number between 0 and 100.');
            }
            payload = { advanceRate: n };
        }
        await firestore.setDoc(firestore.doc(db, 'users', uid), payload, { merge: true });
    }

    // Returns the advance rate (in percent) that should apply to a given
    // user. Logic:
    //   1. If the user's profile has a numeric advanceRate, use that.
    //   2. Otherwise use the site-wide SettingsStore advanceRate.
    //   3. Fallback to 5 if neither is configured.
    async function getEffectiveAdvanceRate(profile) {
        // per-user override?
        if (profile && typeof profile.advanceRate === 'number' && isFinite(profile.advanceRate)) {
            return profile.advanceRate;
        }
        // global default
        try {
            const s = await window.SettingsStore.load();
            if (s && typeof s.advanceRate === 'number' && isFinite(s.advanceRate)) {
                return s.advanceRate;
            }
        } catch (_) {}
        return 5;
    }

    // ── Per-customer DISCOUNT (admin-set, percentage of trip cost) ──
    // Set or clear a per-user discount percentage. Logged-in customers
    // with a discount value will see it auto-applied at checkout
    // (computed as discount% of subtotal, before GST). Pass null /
    // undefined / '' to clear the discount and remove the field.
    async function adminSetUserDiscount(uid, discountPercentOrNull) {
        ensureAdmin();
        if (!uid) throw new Error('uid is required.');
        const { db, firestore } = await window.__firebaseReady;

        let payload;
        if (discountPercentOrNull === null || discountPercentOrNull === undefined || discountPercentOrNull === '') {
            payload = { discountPercent: firestore.deleteField() };
        } else {
            const n = Number(discountPercentOrNull);
            if (!isFinite(n) || n < 0 || n > 100) {
                throw new Error('Discount must be a number between 0 and 100 (percent).');
            }
            payload = { discountPercent: n };
        }
        await firestore.setDoc(firestore.doc(db, 'users', uid), payload, { merge: true });
    }

    // Returns the discount % that should apply to a given user profile,
    // or 0 if none is configured. Used by checkout.js to auto-apply a
    // logged-in customer's loyalty / VIP discount on top of any coupon.
    function getEffectiveDiscount(profile) {
        if (profile && typeof profile.discountPercent === 'number' && isFinite(profile.discountPercent)) {
            return Math.max(0, Math.min(100, profile.discountPercent));
        }
        return 0;
    }

    window.UsersStore = {
        login:                    loginUser,
        register:                 registerUser,
        logout:                   logoutUser,
        onAuthChange:             onAuthChange,
        getCurrentUser:           getCurrentUser,
        isAdmin:                  isAdmin,
        isStaff:                  isStaff,
        canAccessDashboard:       canAccessDashboard,
        updateProfile:            updateProfile,
        uploadProfilePicture:     uploadProfilePicture,
        removeProfilePicture:     removeProfilePicture,
        reauthenticate:           reauthenticate,
        changePassword:           changePassword,
        sendPasswordResetEmail:   sendPasswordResetEmail,
        deleteCurrentAccount:     deleteCurrentAccount,
        sendPasswordReset:        sendPasswordReset,
        lookupUsernamesByEmail:   lookupUsernamesByEmail,
        // email-verification:
        resendEmailVerification:  resendEmailVerification,
        refreshEmailVerifiedStatus: refreshEmailVerifiedStatus,
        // admin-only:
        listAllUsers:             listAllUsers,
        setUserDisabled:          setUserDisabled,
        deleteUserProfile:        deleteUserProfile,
        adminDeleteUsername:      adminDeleteUsername,
        adminSendPasswordReset:   adminSendPasswordReset,
        adminSetUserAdvanceRate:  adminSetUserAdvanceRate,
        getEffectiveAdvanceRate:  getEffectiveAdvanceRate,
        adminSetUserDiscount:     adminSetUserDiscount,
        getEffectiveDiscount:     getEffectiveDiscount,
        // expose so checkout.js can grab the latest profile (incl. advanceRate)
        fetchUserDoc: async function (uid) {
            return fetchUserDoc(uid);
        }
    };
})();
