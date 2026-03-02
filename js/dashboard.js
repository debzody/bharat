// Dashboard JavaScript
document.addEventListener('DOMContentLoaded', function () {
    // ── Data Layer ──────────────────────────────────────────────
    const DB = {
        users: JSON.parse(localStorage.getItem('users') || '[]'),
        bookings: JSON.parse(localStorage.getItem('bookings') || '[]'),
        saveBookings() {
            localStorage.setItem('bookings', JSON.stringify(this.bookings));
        }
    };

    const PACKAGES = {
        budget: { name: 'Budget Andaman Escape', price: 15999, color: '#3498db' },
        standard: { name: 'Standard Andaman Bliss', price: 21999, color: '#1abc9c' },
        luxury: { name: 'Luxury Andaman Retreat', price: 28999, color: '#9b59b6' },
        honeymoon: { name: 'Honeymoon Paradise', price: 24999, color: '#e74c3c' },
        test: { name: 'Payment Test', price: 1, color: '#95a5a6' }
    };

    // Set user display
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    const dashUsername = document.getElementById('dashUsername');
    if (currentUser && dashUsername) {
        dashUsername.textContent = currentUser.username;
    }

    // ── Sidebar Navigation ──────────────────────────────────────
    const sidebarLinks = document.querySelectorAll('.sidebar-link[data-section]');
    const sections = document.querySelectorAll('.dashboard-section');
    const pageTitle = document.getElementById('pageTitle');

    const sectionTitles = {
        overview: 'Dashboard Overview',
        bookings: 'All Bookings',
        packages: 'Package Performance',
        customers: 'Customers',
        revenue: 'Revenue Analytics'
    };

    sidebarLinks.forEach(link => {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            const section = this.dataset.section;

            sidebarLinks.forEach(l => l.classList.remove('active'));
            this.classList.add('active');

            sections.forEach(s => s.classList.remove('active'));
            const target = document.getElementById('section-' + section);
            if (target) target.classList.add('active');

            if (pageTitle) pageTitle.textContent = sectionTitles[section] || 'Dashboard';

            // Close sidebar on mobile
            document.getElementById('sidebar').classList.remove('open');
        });
    });

    // Mobile sidebar toggle
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarClose = document.getElementById('sidebarClose');

    if (menuToggle) {
        menuToggle.addEventListener('click', () => sidebar.classList.add('open'));
    }
    if (sidebarClose) {
        sidebarClose.addEventListener('click', () => sidebar.classList.remove('open'));
    }

    // ── Helpers ─────────────────────────────────────────────────
    function formatCurrency(amount) {
        return '₹' + Number(amount).toLocaleString('en-IN');
    }

    function formatDate(dateStr) {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function getPackageName(key) {
        if (PACKAGES[key]) return PACKAGES[key].name;
        return key ? key.charAt(0).toUpperCase() + key.slice(1) : 'Unknown';
    }

    function getUserName(userId) {
        const user = DB.users.find(u => u.id === userId);
        return user ? user.username : 'Guest';
    }

    // ── Overview Stats ──────────────────────────────────────────
    function renderOverview() {
        const bookings = DB.bookings;
        const confirmed = bookings.filter(b => b.status !== 'cancelled');
        const cancelled = bookings.filter(b => b.status === 'cancelled');
        const totalRevenue = confirmed.reduce((sum, b) => sum + (b.price || 0), 0);

        document.getElementById('totalBookings').textContent = bookings.length;
        document.getElementById('totalRevenue').textContent = formatCurrency(totalRevenue);
        document.getElementById('totalCustomers').textContent = DB.users.length;
        document.getElementById('confirmedBookings').textContent = confirmed.length;

        // Donut chart
        const total = bookings.length;
        const confirmedCount = confirmed.length;
        const cancelledCount = cancelled.length;

        document.getElementById('donutTotal').textContent = total;
        document.getElementById('legendConfirmed').textContent = confirmedCount;
        document.getElementById('legendCancelled').textContent = cancelledCount;

        const chart = document.getElementById('statusChart');
        if (total > 0) {
            const confirmedDeg = (confirmedCount / total) * 360;
            chart.style.background = `conic-gradient(
                #1abc9c 0deg ${confirmedDeg}deg,
                #e74c3c ${confirmedDeg}deg 360deg
            )`;
        } else {
            chart.style.background = 'conic-gradient(#ddd 0deg 360deg)';
        }

        // Revenue by package bar chart
        renderRevenueBarChart();

        // Recent bookings table
        renderRecentBookings();
    }

    function renderRevenueBarChart() {
        const container = document.getElementById('revenueChart');
        const confirmed = DB.bookings.filter(b => b.status !== 'cancelled');

        const packageRevenue = {};
        confirmed.forEach(b => {
            const key = b.package_name || 'unknown';
            if (!packageRevenue[key]) packageRevenue[key] = 0;
            packageRevenue[key] += b.price || 0;
        });

        const entries = Object.entries(packageRevenue).sort((a, b) => b[1] - a[1]);

        if (entries.length === 0) {
            container.innerHTML = '<p class="chart-empty">No revenue data yet</p>';
            return;
        }

        const maxVal = Math.max(...entries.map(e => e[1]));

        container.innerHTML = entries.map(([pkg, rev]) => {
            const pct = maxVal > 0 ? (rev / maxVal) * 100 : 0;
            const color = PACKAGES[pkg] ? PACKAGES[pkg].color : '#1abc9c';
            return `
                <div class="bar-item">
                    <span class="bar-label">${getPackageName(pkg)}</span>
                    <div class="bar-track">
                        <div class="bar-fill" style="width: ${pct}%; background: ${color};">${formatCurrency(rev)}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderRecentBookings() {
        const tbody = document.getElementById('recentBookingsBody');
        const recent = [...DB.bookings].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 5);

        if (recent.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No bookings yet</td></tr>';
            return;
        }

        tbody.innerHTML = recent.map(b => `
            <tr>
                <td>#${String(b.id).slice(-6)}</td>
                <td>${getPackageName(b.package_name)}</td>
                <td>${getUserName(b.userId)}</td>
                <td>${b.duration || '-'}</td>
                <td>${formatCurrency(b.price || 0)}</td>
                <td><span class="badge badge-${b.status || 'confirmed'}">${(b.status || 'confirmed').toUpperCase()}</span></td>
                <td>${formatDate(b.createdAt)}</td>
            </tr>
        `).join('');
    }

    // ── All Bookings ────────────────────────────────────────────
    function renderAllBookings(filter, search) {
        const tbody = document.getElementById('allBookingsBody');
        let bookings = [...DB.bookings].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

        if (filter && filter !== 'all') {
            bookings = bookings.filter(b => (b.status || 'confirmed') === filter);
        }

        if (search) {
            const q = search.toLowerCase();
            bookings = bookings.filter(b =>
                getPackageName(b.package_name).toLowerCase().includes(q) ||
                getUserName(b.userId).toLowerCase().includes(q) ||
                String(b.id).includes(q)
            );
        }

        if (bookings.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="table-empty">No bookings found</td></tr>';
            return;
        }

        tbody.innerHTML = bookings.map(b => `
            <tr>
                <td>#${String(b.id).slice(-6)}</td>
                <td>${getPackageName(b.package_name)}</td>
                <td>${getUserName(b.userId)}</td>
                <td>${b.duration || '-'}</td>
                <td>${b.guests || '-'}</td>
                <td>${formatCurrency(b.price || 0)}</td>
                <td><span class="badge badge-${b.status || 'confirmed'}">${(b.status || 'confirmed').toUpperCase()}</span></td>
                <td>${formatDate(b.createdAt)}</td>
                <td>
                    ${(b.status || 'confirmed') !== 'cancelled'
                        ? `<button class="action-btn action-btn-cancel" data-id="${b.id}">Cancel</button>`
                        : '-'}
                </td>
            </tr>
        `).join('');

        // Attach cancel handlers
        tbody.querySelectorAll('.action-btn-cancel').forEach(btn => {
            btn.addEventListener('click', function () {
                const id = Number(this.dataset.id);
                if (confirm('Cancel this booking?')) {
                    const booking = DB.bookings.find(b => b.id === id);
                    if (booking) {
                        booking.status = 'cancelled';
                        DB.saveBookings();
                        refreshAll();
                    }
                }
            });
        });
    }

    // Booking search and filter
    const bookingSearch = document.getElementById('bookingSearch');
    const bookingFilter = document.getElementById('bookingFilter');

    if (bookingSearch) {
        bookingSearch.addEventListener('input', () => {
            renderAllBookings(bookingFilter.value, bookingSearch.value);
        });
    }
    if (bookingFilter) {
        bookingFilter.addEventListener('change', () => {
            renderAllBookings(bookingFilter.value, bookingSearch.value);
        });
    }

    // ── Package Editor ──────────────────────────────────────────
    let packagesData = [];

    const SITE_IMAGES = [
        'images/beach1.jpg', 'images/beach2.jpg', 'images/beach3.jpg',
        'images/beach4.jpg', 'images/neil1.jpg', 'images/neil2.jpg',
        'images/neil3.jpg', 'images/neil4.jpg', 'images/neil6.jpg',
        'images/ross2.jpg', 'images/ross3.jpg'
    ];

    async function loadAndRenderPackages() {
        const container = document.getElementById('packageCards');
        container.innerHTML = '<p style="padding:2rem;color:#888;text-align:center;"><i class="fas fa-spinner fa-spin"></i> Loading packages…</p>';
        try {
            const res = await fetch('/.netlify/functions/packages', { cache: 'no-store' });
            packagesData = await res.json();
        } catch (e) {
            // Fallback to PACKAGES constant
            packagesData = Object.entries(PACKAGES).map(([id, p]) => ({
                id, name: p.name, desc: '', price: p.price,
                rating: 4.5, image: 'images/beach1.jpg', inclusions: [], visible: true
            }));
        }
        renderPackageEditorCards();
    }

    function renderPackages() {
        loadAndRenderPackages();
    }

    // ── Itinerary Day Helpers ───────────────────────────────────
    function renderDaysHtml(pkgIdx) {
        const days = (packagesData[pkgIdx].days) || [];
        if (days.length === 0) {
            return '<p class="days-empty">No days yet. Click "+ Add Day" to start.</p>';
        }
        return days.map((day, dayIdx) => `
            <div class="pkg-day-card">
                <div class="pkg-day-header">
                    <span class="pkg-day-num">Day ${day.day}</span>
                    <button type="button" class="btn-del-day" onclick="window._pkgDeleteDay(${pkgIdx},${dayIdx})" title="Remove day">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="pkg-edit-row">
                    <label>Title</label>
                    <input type="text" class="pkg-input" value="${escHtml(day.title||'')}"
                        placeholder="e.g. Arrival in Port Blair"
                        oninput="window._pkgDayUpdate(${pkgIdx},${dayIdx},'title',this.value)">
                </div>
                <div class="pkg-edit-row">
                    <label>Description</label>
                    <input type="text" class="pkg-input" value="${escHtml(day.desc||'')}"
                        placeholder="Short description of the day"
                        oninput="window._pkgDayUpdate(${pkgIdx},${dayIdx},'desc',this.value)">
                </div>
                <div class="pkg-edit-row">
                    <label>Activities <small>(one per line)</small></label>
                    <textarea class="pkg-input pkg-textarea" rows="4"
                        placeholder="Airport pickup&#10;Hotel check-in&#10;City tour"
                        oninput="window._pkgDayUpdate(${pkgIdx},${dayIdx},'activities',this.value.split('\\n').map(s=>s.trim()).filter(Boolean))"
                    >${escHtml((day.activities||[]).join('\n'))}</textarea>
                </div>
            </div>
        `).join('');
    }

    function renderDaysContainer(pkgIdx) {
        const container = document.getElementById('days-container-' + pkgIdx);
        if (container) container.innerHTML = renderDaysHtml(pkgIdx);
        // Update badge count
        const badge = document.querySelector(`[data-idx="${pkgIdx}"] .itinerary-badge`);
        if (badge) badge.textContent = (packagesData[pkgIdx].days||[]).length + ' days';
    }

    function renderPackageEditorCards() {
        const container = document.getElementById('packageCards');
        if (!packagesData.length) {
            container.innerHTML = '<p style="padding:2rem;color:#888;text-align:center;">No packages yet. Click "Add Package".</p>';
            return;
        }

        container.innerHTML = packagesData.map((pkg, idx) => `
            <div class="pkg-edit-card" data-idx="${idx}">
                <div class="pkg-edit-header">
                    <span class="pkg-edit-num">#${idx + 1}</span>
                    <label class="pkg-visible-toggle">
                        <input type="checkbox" ${pkg.visible !== false ? 'checked' : ''}
                            onchange="window._pkgUpdate(${idx},'visible',this.checked)">
                        <span>Visible</span>
                    </label>
                    <button class="btn-del-pkg" onclick="window._pkgDelete(${idx})" title="Delete package">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div class="pkg-edit-body">
                    <div class="pkg-edit-row">
                        <label>Package Name</label>
                        <input type="text" class="pkg-input" value="${escHtml(pkg.name)}"
                            placeholder="e.g. Budget Andaman Escape"
                            oninput="window._pkgUpdate(${idx},'name',this.value)">
                    </div>
                    <div class="pkg-edit-row">
                        <label>Description</label>
                        <input type="text" class="pkg-input" value="${escHtml(pkg.desc || '')}"
                            placeholder="e.g. 4N/5D | Port Blair + Havelock"
                            oninput="window._pkgUpdate(${idx},'desc',this.value)">
                    </div>
                    <div class="pkg-edit-row pkg-edit-row-2col">
                        <div>
                            <label>Price (₹)</label>
                            <input type="number" class="pkg-input" value="${pkg.price}" min="1"
                                oninput="window._pkgUpdate(${idx},'price',parseInt(this.value)||1)">
                        </div>
                        <div>
                            <label>Rating (0–5)</label>
                            <input type="number" class="pkg-input" value="${pkg.rating}" min="0" max="5" step="0.1"
                                oninput="window._pkgUpdate(${idx},'rating',parseFloat(this.value)||0)">
                        </div>
                    </div>
                    <div class="pkg-edit-row">
                        <label>Inclusions <small>(comma-separated)</small></label>
                        <input type="text" class="pkg-input" value="${escHtml((pkg.inclusions||[]).join(', '))}"
                            placeholder="e.g. Hotels, Ferries, Breakfast"
                            oninput="window._pkgUpdate(${idx},'inclusions',this.value.split(',').map(s=>s.trim()).filter(Boolean))">
                    </div>
                    <div class="pkg-edit-row">
                        <label>Image</label>
                        <select class="pkg-input" onchange="window._pkgUpdate(${idx},'image',this.value)">
                            ${SITE_IMAGES.map(img => `<option value="${img}" ${pkg.image===img?'selected':''}>${img.split('/').pop()}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <!-- Itinerary Editor (collapsible) -->
                <details class="pkg-itinerary-section">
                    <summary class="pkg-itinerary-summary">
                        <i class="fas fa-map-marked-alt"></i> Edit Itinerary
                        <span class="itinerary-badge">${(pkg.days||[]).length} days</span>
                    </summary>
                    <div class="pkg-itinerary-body">
                        <div class="pkg-edit-row">
                            <label>Duration</label>
                            <input type="text" class="pkg-input" value="${escHtml(pkg.duration||'')}"
                                placeholder="e.g. 4 Nights / 5 Days"
                                oninput="window._pkgUpdate(${idx},'duration',this.value)">
                        </div>
                        <div class="pkg-edit-row">
                            <label>Highlights <small>(comma-separated)</small></label>
                            <input type="text" class="pkg-input" value="${escHtml((pkg.highlights||[]).join(', '))}"
                                placeholder="e.g. Radhanagar Beach, Cellular Jail"
                                oninput="window._pkgUpdate(${idx},'highlights',this.value.split(',').map(s=>s.trim()).filter(Boolean))">
                        </div>
                        <div class="pkg-edit-row">
                            <label>Exclusions <small>(comma-separated)</small></label>
                            <input type="text" class="pkg-input" value="${escHtml((pkg.exclusions||[]).join(', '))}"
                                placeholder="e.g. Airfare, Lunch, Travel Insurance"
                                oninput="window._pkgUpdate(${idx},'exclusions',this.value.split(',').map(s=>s.trim()).filter(Boolean))">
                        </div>
                        <div class="pkg-days-label">
                            <label>Day-by-Day Itinerary</label>
                        </div>
                        <div id="days-container-${idx}" class="pkg-days-container">
                            ${renderDaysHtml(idx)}
                        </div>
                        <button type="button" class="btn-add-day" onclick="window._pkgAddDay(${idx})">
                            <i class="fas fa-plus"></i> Add Day
                        </button>
                    </div>
                </details>
            </div>
        `).join('');
    }

    function escHtml(str) {
        return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    // Global helpers called by inline onchange/oninput
    window._pkgUpdate = function(idx, field, value) { packagesData[idx][field] = value; };

    window._pkgDelete = function(idx) {
        if (!confirm(`Delete "${packagesData[idx].name}"?`)) return;
        packagesData.splice(idx, 1);
        renderPackageEditorCards();
    };

    window._pkgDayUpdate = function(pkgIdx, dayIdx, field, value) {
        if (!packagesData[pkgIdx] || !packagesData[pkgIdx].days) return;
        packagesData[pkgIdx].days[dayIdx][field] = value;
    };

    window._pkgDeleteDay = function(pkgIdx, dayIdx) {
        if (!packagesData[pkgIdx] || !packagesData[pkgIdx].days) return;
        if (!confirm('Remove Day ' + (dayIdx + 1) + '?')) return;
        packagesData[pkgIdx].days.splice(dayIdx, 1);
        packagesData[pkgIdx].days.forEach((d, i) => { d.day = i + 1; });
        renderDaysContainer(pkgIdx);
    };

    window._pkgAddDay = function(pkgIdx) {
        if (!packagesData[pkgIdx]) return;
        if (!packagesData[pkgIdx].days) packagesData[pkgIdx].days = [];
        const nextDay = packagesData[pkgIdx].days.length + 1;
        packagesData[pkgIdx].days.push({ day: nextDay, title: 'Day ' + nextDay, desc: '', activities: [] });
        renderDaysContainer(pkgIdx);
    };

    window.addNewPackage = function() {
        packagesData.push({
            id: 'pkg_' + Date.now(),
            name: 'New Package',
            desc: '',
            price: 10000,
            rating: 4.0,
            image: 'images/beach1.jpg',
            inclusions: ['Hotels', 'Ferries'],
            visible: true,
            days: []
        });
        renderPackageEditorCards();
        document.getElementById('packageCards').lastElementChild?.scrollIntoView({ behavior: 'smooth' });
    };

    // Wire up toolbar buttons (CSP-safe — no inline onclick)
    const addPackageBtn = document.getElementById('addPackageBtn');
    if (addPackageBtn) addPackageBtn.addEventListener('click', () => window.addNewPackage());

    const publishBtnEl = document.getElementById('publishBtn');
    if (publishBtnEl) publishBtnEl.addEventListener('click', () => window.saveAndPublishPackages());

    window.saveAndPublishPackages = async function() {
        const btn = document.getElementById('publishBtn');
        const status = document.getElementById('publishStatus');

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publishing…';
        status.style.display = 'block';
        status.className = 'publish-status publish-info';
        status.innerHTML = '⏳ Saving packages to live site…';

        try {
            const res = await fetch('/.netlify/functions/packages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Admin-Token': 'deb2024' },
                body: JSON.stringify(packagesData)
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Server error ' + res.status);

            localStorage.setItem('sitePackages', JSON.stringify(packagesData));
            status.className = 'publish-status publish-success';
            status.innerHTML = '✅ Published! All visitors will see the updated packages immediately.';
            btn.innerHTML = '<i class="fas fa-check"></i> Saved!';
            setTimeout(() => {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Save & Publish';
            }, 3000);
        } catch (err) {
            status.className = 'publish-status publish-error';
            status.innerHTML = '❌ Publish failed: ' + err.message;
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Save & Publish';
        }
    };

    // ── Customers ───────────────────────────────────────────────
    function renderCustomers(search) {
        const tbody = document.getElementById('customersBody');
        let users = [...DB.users];

        if (search) {
            const q = search.toLowerCase();
            users = users.filter(u =>
                u.username.toLowerCase().includes(q) ||
                u.email.toLowerCase().includes(q)
            );
        }

        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No customers found</td></tr>';
            return;
        }

        tbody.innerHTML = users.map(u => {
            const userBookings = DB.bookings.filter(b => b.userId === u.id && b.status !== 'cancelled');
            const totalSpent = userBookings.reduce((s, b) => s + (b.price || 0), 0);

            return `
                <tr>
                    <td>#${String(u.id).slice(-6)}</td>
                    <td>${u.username}</td>
                    <td>${u.email}</td>
                    <td>${userBookings.length}</td>
                    <td>${formatCurrency(totalSpent)}</td>
                </tr>
            `;
        }).join('');
    }

    const customerSearch = document.getElementById('customerSearch');
    if (customerSearch) {
        customerSearch.addEventListener('input', () => renderCustomers(customerSearch.value));
    }

    // ── Revenue Analytics ───────────────────────────────────────
    function renderRevenue() {
        const bookings = DB.bookings;
        const confirmed = bookings.filter(b => b.status !== 'cancelled');
        const cancelled = bookings.filter(b => b.status === 'cancelled');

        const totalRevenue = confirmed.reduce((s, b) => s + (b.price || 0), 0);
        const avgBooking = confirmed.length > 0 ? totalRevenue / confirmed.length : 0;
        const cancelledRevenue = cancelled.reduce((s, b) => s + (b.price || 0), 0);

        // Top package
        const packageRevenue = {};
        confirmed.forEach(b => {
            const key = b.package_name || 'unknown';
            if (!packageRevenue[key]) packageRevenue[key] = 0;
            packageRevenue[key] += b.price || 0;
        });
        const topPkg = Object.entries(packageRevenue).sort((a, b) => b[1] - a[1])[0];

        document.getElementById('revTotalRevenue').textContent = formatCurrency(totalRevenue);
        document.getElementById('revAvgBooking').textContent = formatCurrency(Math.round(avgBooking));
        document.getElementById('revTopPackage').textContent = topPkg ? getPackageName(topPkg[0]) : '-';
        document.getElementById('revCancelledRevenue').textContent = formatCurrency(cancelledRevenue);

        // Revenue breakdown
        const breakdownContainer = document.getElementById('revenueBreakdown');
        const entries = Object.entries(packageRevenue).sort((a, b) => b[1] - a[1]);

        if (entries.length === 0) {
            breakdownContainer.innerHTML = '<p class="chart-empty">No revenue data yet</p>';
        } else {
            const maxRev = Math.max(...entries.map(e => e[1]));
            const colors = ['#1abc9c', '#3498db', '#9b59b6', '#e74c3c', '#f39c12'];

            breakdownContainer.innerHTML = entries.map(([pkg, rev], i) => {
                const pct = maxRev > 0 ? (rev / maxRev) * 100 : 0;
                const color = PACKAGES[pkg] ? PACKAGES[pkg].color : colors[i % colors.length];
                return `
                    <div class="revenue-item">
                        <span class="revenue-item-name">${getPackageName(pkg)}</span>
                        <div class="revenue-item-bar">
                            <div class="revenue-item-fill" style="width: ${pct}%; background: ${color};"></div>
                        </div>
                        <span class="revenue-item-amount">${formatCurrency(rev)}</span>
                    </div>
                `;
            }).join('');
        }

        // Monthly trend
        renderMonthlyTrend();
    }

    function renderMonthlyTrend() {
        const container = document.getElementById('monthlyTrend');
        const confirmed = DB.bookings.filter(b => b.status !== 'cancelled');

        if (confirmed.length === 0) {
            container.innerHTML = '<p class="chart-empty">No trend data yet</p>';
            return;
        }

        // Group by month
        const monthly = {};
        confirmed.forEach(b => {
            const d = new Date(b.createdAt || Date.now());
            const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
            if (!monthly[key]) monthly[key] = { count: 0, revenue: 0 };
            monthly[key].count++;
            monthly[key].revenue += b.price || 0;
        });

        const sorted = Object.entries(monthly).sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
        const maxCount = Math.max(...sorted.map(e => e[1].count));

        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        container.innerHTML = sorted.map(([key, data]) => {
            const pct = maxCount > 0 ? (data.count / maxCount) * 100 : 0;
            const [year, month] = key.split('-');
            const label = monthNames[parseInt(month) - 1] + ' ' + year.slice(2);

            return `
                <div class="trend-bar">
                    <span class="trend-bar-value">${data.count}</span>
                    <div class="trend-bar-fill" style="height: ${Math.max(pct, 3)}%;"></div>
                    <span class="trend-bar-label">${label}</span>
                </div>
            `;
        }).join('');
    }

    // ── Refresh All ─────────────────────────────────────────────
    function refreshAll() {
        // Reload data from localStorage
        DB.users = JSON.parse(localStorage.getItem('users') || '[]');
        DB.bookings = JSON.parse(localStorage.getItem('bookings') || '[]');

        renderOverview();
        renderAllBookings(
            bookingFilter ? bookingFilter.value : 'all',
            bookingSearch ? bookingSearch.value : ''
        );
        renderPackages();
        renderCustomers(customerSearch ? customerSearch.value : '');
        renderRevenue();
    }

    // Initial render
    refreshAll();

    // Auto-refresh when localStorage changes (e.g. from another tab)
    window.addEventListener('storage', refreshAll);
});
