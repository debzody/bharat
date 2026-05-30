/* ── ai-package-import.js — admin uploads a brochure → AI creates a package
 *
 * Adds a "📄 Upload Brochure (AI)" button to the dashboard's Packages tab
 * (admin-only). Click → file picker → upload to Cloudinary → call the
 * ai-assistant Worker's POST /extract-package → preview modal lets the
 * admin review/edit the extracted fields → click "Create Package" →
 * appends a new package doc to Firestore (does NOT modify existing ones).
 *
 * Requires:
 *   - window.AI_ASSISTANT_WORKER_URL (set in dashboard.html)
 *   - window.PackagesStore (for the publish call)
 *   - window.__firebaseReady   (for fresh ID token on the worker call)
 *   - Cloudinary unsigned preset 'andaman_unsigned' (re-used from gallery)
 */
(function () {
    'use strict';

    if (window.__dashRole !== 'admin') return; // hard-gate to admins

    var CLOUDINARY = { cloud: 'dnvsxgnmu', preset: 'andaman_unsigned', folder: 'package-brochures' };

    function workerUrl() {
        var u = String(window.AI_ASSISTANT_WORKER_URL || '').trim();
        return u ? u.replace(/\/+$/, '') : '';
    }

    function escHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
        });
    }
    function toast(msg, kind) {
        if (window.Toast && window.Toast[kind || 'info']) { window.Toast[kind || 'info'](msg); return; }
        if (window.showToast) { window.showToast(msg, kind || 'info'); return; }
        console.log('[ai-pkg]', msg);
    }
    async function getIdToken() {
        try {
            if (window.__firebaseReady) {
                var fb = await window.__firebaseReady;
                if (fb && fb.auth && fb.auth.currentUser) return await fb.auth.currentUser.getIdToken();
            }
        } catch (_) {}
        return null;
    }

    /* ── Inject the trigger button in the Packages section header ── */
    function injectButton() {
        var hdr = document.querySelector('#section-packages .section-header .section-actions');
        if (!hdr || document.getElementById('aiPkgImportBtn')) return;
        var btn = document.createElement('button');
        btn.id = 'aiPkgImportBtn';
        btn.className = 'btn-add-package';
        btn.style.background = 'linear-gradient(135deg,#8e44ad,#3498db)';
        btn.title = 'Upload a brochure image — AI extracts the package';
        btn.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i> AI Import (PDF/Image)';
        btn.addEventListener('click', openFilePicker);
        // Insert before the publish button so it sits next to "Add Package"
        var publishBtn = document.getElementById('publishBtn');
        if (publishBtn && publishBtn.parentNode === hdr) hdr.insertBefore(btn, publishBtn);
        else hdr.appendChild(btn);
    }

    /* ── File picker (one-shot input) ── */
    function openFilePicker() {
        var inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'image/*,application/pdf';
        inp.style.display = 'none';
        document.body.appendChild(inp);
        inp.addEventListener('change', function () {
            var f = inp.files && inp.files[0];
            if (f) handleFile(f);
            try { document.body.removeChild(inp); } catch (_) {}
        });
        inp.click();
    }

    async function handleFile(file) {
        if (!workerUrl()) {
            toast('AI worker URL not configured (window.AI_ASSISTANT_WORKER_URL).', 'error');
            return;
        }
        if (file.size > 8 * 1024 * 1024) {
            toast('File too large (max 8 MB).', 'error');
            return;
        }
        showProgressModal('Uploading brochure to Cloudinary…');
        var url;
        try {
            url = await uploadToCloudinary(file);
        } catch (err) {
            closeProgressModal();
            toast('Upload failed: ' + (err && err.message || err), 'error');
            return;
        }
        updateProgress('Asking AI to read the brochure…');
        var fields;
        try {
            fields = await callExtract(url);
        } catch (err) {
            closeProgressModal();
            toast('AI extraction failed: ' + (err && err.message || err), 'error');
            return;
        }
        closeProgressModal();
        showPreviewModal(fields, url, file);
    }

    function uploadToCloudinary(file) {
        return new Promise(function (resolve, reject) {
            var fd = new FormData();
            fd.append('file', file);
            fd.append('upload_preset', CLOUDINARY.preset);
            fd.append('folder', CLOUDINARY.folder);
            var xhr = new XMLHttpRequest();
            xhr.open('POST', 'https://api.cloudinary.com/v1_1/' + CLOUDINARY.cloud + '/auto/upload');
            xhr.upload.onprogress = function (e) {
                if (e.lengthComputable) updateProgress('Uploading… ' + Math.round(e.loaded / e.total * 100) + '%');
            };
            xhr.onload = function () {
                try {
                    var r = JSON.parse(xhr.responseText || '{}');
                    if (xhr.status >= 200 && xhr.status < 300 && r.secure_url) resolve(r.secure_url);
                    else reject(new Error(r.error ? r.error.message : ('HTTP ' + xhr.status)));
                } catch (e) { reject(e); }
            };
            xhr.onerror = function () { reject(new Error('Network error')); };
            xhr.send(fd);
        });
    }

    async function callExtract(imageUrl) {
        var token = await getIdToken();
        if (!token) throw new Error('Not signed in.');
        var res = await fetch(workerUrl() + '/extract-package', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ imageUrl: imageUrl })
        });
        var body = await res.json().catch(function () { return {}; });
        if (!res.ok || !body.ok) throw new Error(body.error || ('HTTP ' + res.status));
        return body.fields;
    }

    /* ── Progress modal (uploading / thinking) ── */
    var progEl = null;
    function showProgressModal(msg) {
        closeProgressModal();
        progEl = document.createElement('div');
        progEl.className = 'aipkg-overlay';
        progEl.innerHTML = '<div class="aipkg-progress"><i class="fas fa-spinner fa-spin"></i><span id="aipkgProgText">' + escHtml(msg) + '</span></div>';
        document.body.appendChild(progEl);
        injectStyles();
    }
    function updateProgress(msg) {
        var el = document.getElementById('aipkgProgText');
        if (el) el.textContent = msg;
    }
    function closeProgressModal() {
        if (progEl && progEl.parentNode) progEl.parentNode.removeChild(progEl);
        progEl = null;
    }

    /* ── Preview / edit modal ── */
    function showPreviewModal(fields, imageUrl, file) {
        injectStyles();
        var modal = document.createElement('div');
        modal.className = 'aipkg-overlay';
        modal.innerHTML =
            '<div class="aipkg-card">' +
                '<div class="aipkg-head">' +
                    '<h3><i class="fas fa-wand-magic-sparkles"></i> AI extracted package</h3>' +
                    '<button type="button" class="aipkg-close" aria-label="Close"><i class="fas fa-times"></i></button>' +
                '</div>' +
                '<div class="aipkg-body">' +
                    '<div class="aipkg-source">' +
                        '<img src="' + escHtml(imageUrl) + '" alt="brochure preview" loading="lazy">' +
                        '<small>Source: ' + escHtml(file.name) + ' · ' + Math.round(file.size/1024) + ' KB</small>' +
                    '</div>' +
                    '<div class="aipkg-fields">' +
                        row('Name *', '<input type="text" data-f="name" value="' + escHtml(fields.name || '') + '">') +
                        row('Tagline / desc', '<input type="text" data-f="desc" value="' + escHtml(fields.desc || '') + '">') +
                        row('Price (₹/person) *', '<input type="number" min="0" data-f="price" value="' + escHtml(fields.price || 0) + '">') +
                        row('Duration', '<input type="text" data-f="duration" value="' + escHtml(fields.duration || '') + '">') +
                        row('Category',
                            '<select data-f="category">' +
                                ['','Budget','Standard','Luxury','Premium','Honeymoon','Family','Adventure'].map(function (c) {
                                    return '<option value="' + escHtml(c) + '"' + (c === (fields.category || '') ? ' selected' : '') + '>' + (c || '— select —') + '</option>';
                                }).join('') +
                            '</select>'
                        ) +
                        row('Rating (0-5)', '<input type="number" min="0" max="5" step="0.1" data-f="rating" value="' + escHtml(fields.rating || 4.5) + '">') +
                        row('Inclusions', '<textarea rows="3" data-f="inclusions">' + escHtml((fields.inclusions || []).join('\n')) + '</textarea>') +
                        row('Exclusions', '<textarea rows="2" data-f="exclusions">' + escHtml((fields.exclusions || []).join('\n')) + '</textarea>') +
                        row('Places visited', '<textarea rows="2" data-f="places">' + escHtml((fields.places || []).join(', ')) + '</textarea>') +
                        '<div class="aipkg-itin"><h4>Day-by-Day Itinerary</h4><div id="aipkgItinList"></div></div>' +
                    '</div>' +
                '</div>' +
                '<div class="aipkg-foot">' +
                    '<button type="button" class="aipkg-cancel">Cancel</button>' +
                    '<button type="button" class="aipkg-save"><i class="fas fa-plus"></i> Create Package</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(modal);

        // Render itinerary editor
        renderItinerary(modal, fields.itinerary || []);

        modal.querySelector('.aipkg-close').addEventListener('click', function () { modal.remove(); });
        modal.querySelector('.aipkg-cancel').addEventListener('click', function () { modal.remove(); });
        modal.addEventListener('click', function (e) { if (e.target === modal) modal.remove(); });
                modal.querySelector('.aipkg-save').addEventListener('click', function () { savePackage(modal, fields, imageUrl); });
    }

    function row(label, html) {
        return '<label class="aipkg-row"><span>' + escHtml(label) + '</span>' + html + '</label>';
    }

    function renderItinerary(modal, days) {
        var list = modal.querySelector('#aipkgItinList');
        if (!list) return;
        list.innerHTML = '';
        days.forEach(function (d, i) { list.appendChild(itinRow(d, i + 1)); });
        var addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'aipkg-itin-add';
        addBtn.innerHTML = '<i class="fas fa-plus"></i> Add day';
        addBtn.addEventListener('click', function () {
            list.appendChild(itinRow({ day: list.children.length + 1, title: '', details: '' }, list.children.length + 1));
        });
        list.parentNode.appendChild(addBtn);
    }
    function itinRow(d, n) {
        var w = document.createElement('div');
        w.className = 'aipkg-day';
        w.innerHTML =
            '<div class="aipkg-day-num">Day ' + n + '</div>' +
            '<input type="text" class="aipkg-day-title" placeholder="Title (e.g. Arrival in Port Blair)" value="' + escHtml(d.title || '') + '">' +
            '<textarea class="aipkg-day-details" rows="2" placeholder="Details">' + escHtml(d.details || '') + '</textarea>' +
            '<button type="button" class="aipkg-day-del" title="Remove this day"><i class="fas fa-trash"></i></button>';
        w.querySelector('.aipkg-day-del').addEventListener('click', function () { w.remove(); });
        return w;
    }

    async function savePackage(modal, originalFields, imageUrl) {
        var saveBtn = modal.querySelector('.aipkg-save');
        var orig = saveBtn.innerHTML;
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating…';
        function val(f){var el=modal.querySelector('[data-f="'+f+'"]');return el?el.value:'';}
        function lines(f){return String(val(f)||'').split(/\r?\n|,/).map(function(s){return s.trim();}).filter(Boolean);}
        var itinerary=[];
        modal.querySelectorAll('.aipkg-day').forEach(function(row,i){
            var t=(row.querySelector('.aipkg-day-title')||{}).value||'';
            var d=(row.querySelector('.aipkg-day-details')||{}).value||'';
            if(t||d)itinerary.push({day:i+1,title:t,details:d});
        });
        var name=String(val('name')||'').trim();
        var price=Number(val('price')||0);
        if(!name){toast('Name is required','error');saveBtn.disabled=false;saveBtn.innerHTML=orig;return;}
        if(!price||price<=0){toast('Price must be > 0','error');saveBtn.disabled=false;saveBtn.innerHTML=orig;return;}
        var newPkg={
            id: slugify(name)+'-'+Date.now().toString(36).slice(-4),
            name:name,
            desc:String(val('desc')||'').trim(),
            price:price,
            duration:String(val('duration')||'').trim(),
            category:String(val('category')||'').trim(),
            rating:Math.max(0,Math.min(5,Number(val('rating')||4.5))),
            inclusions:lines('inclusions'),
            exclusions:lines('exclusions'),
            places:lines('places'),
            itinerary:itinerary,
            image:imageUrl,
            visible:true,
            order:9999,
            createdAt:new Date().toISOString(),
            createdVia:'ai-import'
        };
        try{
            var current=await window.PackagesStore.load();
            var list=(current&&Array.isArray(current.data))?current.data.slice():[];
            list.push(newPkg);
            await window.PackagesStore.publish(list);
            toast('\u2713 Package created \u2014 review it in the grid below','success');
            modal.remove();
            if(typeof window._renderPackages==='function'){try{window._renderPackages(list);}catch(_){}}
            else{location.reload();}
        }catch(err){
            console.error('savePackage failed:',err);
            toast('Save failed: '+(err&&err.message||err),'error');
            saveBtn.disabled=false;
            saveBtn.innerHTML=orig;
        }
    }

    function slugify(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40)||'package';}

    function injectStyles(){
        if(document.getElementById('aipkg-styles'))return;
        var css=document.createElement('style');
        css.id='aipkg-styles';
        css.textContent=[
            '.aipkg-overlay{position:fixed;inset:0;background:rgba(15,32,39,.65);backdrop-filter:blur(3px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;}',
            '.aipkg-progress{background:#fff;border-radius:12px;padding:1.4rem 1.8rem;display:inline-flex;gap:.7rem;align-items:center;color:#1c2b48;font-weight:600;box-shadow:0 12px 36px rgba(0,0,0,.35);}',
            '.aipkg-progress i{color:#8e44ad;font-size:1.3rem;}',
            '.aipkg-card{background:#fff;border-radius:14px;width:100%;max-width:880px;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 22px 64px rgba(0,0,0,.4);}',
            '.aipkg-head{padding:.95rem 1.2rem;background:linear-gradient(135deg,#8e44ad,#3498db);color:#fff;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;}',
            '.aipkg-head h3{margin:0;font-size:1.05rem;font-weight:700;display:flex;align-items:center;gap:.5rem;}',
            '.aipkg-close{background:rgba(255,255,255,.18);border:0;color:#fff;width:32px;height:32px;border-radius:8px;cursor:pointer;}',
            '.aipkg-close:hover{background:rgba(255,255,255,.32);}',
            '.aipkg-body{flex:1 1 0;overflow-y:auto;padding:1.1rem 1.25rem;display:grid;grid-template-columns:200px 1fr;gap:1.2rem;}',
            '.aipkg-source img{max-width:100%;border-radius:10px;border:1px solid #e3e8ef;}',
            '.aipkg-source small{display:block;margin-top:.4rem;color:#7a8b96;font-size:.78rem;}',
            '.aipkg-fields{display:flex;flex-direction:column;gap:.6rem;}',
            '.aipkg-row{display:flex;flex-direction:column;gap:.3rem;font-size:.82rem;font-weight:600;color:#5a6877;}',
            '.aipkg-row input,.aipkg-row textarea,.aipkg-row select{padding:.5rem .7rem;border:1px solid #cfd9df;border-radius:7px;font-family:inherit;font-size:.9rem;color:#2c3e50;background:#fff;}',
            '.aipkg-row input:focus,.aipkg-row textarea:focus,.aipkg-row select:focus{outline:none;border-color:#8e44ad;box-shadow:0 0 0 3px rgba(142,68,173,.18);}',
            '.aipkg-row textarea{resize:vertical;font-family:inherit;}',
            '.aipkg-itin{margin-top:.5rem;}',
            '.aipkg-itin h4{margin:0 0 .4rem;font-size:.86rem;color:#1c2b48;}',
            '.aipkg-day{display:grid;grid-template-columns:60px 1fr 32px;grid-template-rows:auto auto;gap:.35rem .55rem;align-items:start;padding:.55rem;background:#f8fafc;border:1px solid #eef1f4;border-radius:8px;margin-bottom:.4rem;}',
            '.aipkg-day-num{font-weight:700;color:#8e44ad;font-size:.78rem;align-self:center;}',
            '.aipkg-day-title{padding:.35rem .55rem;border:1px solid #cfd9df;border-radius:6px;font:inherit;font-size:.86rem;}',
            '.aipkg-day-details{grid-column:2/3;padding:.35rem .55rem;border:1px solid #cfd9df;border-radius:6px;font:inherit;font-size:.84rem;resize:vertical;}',
            '.aipkg-day-del{grid-row:1/3;background:#fdedec;border:0;border-radius:6px;color:#c0392b;cursor:pointer;font-size:.78rem;align-self:center;height:32px;}',
            '.aipkg-day-del:hover{background:#fadbd8;}',
            '.aipkg-itin-add{margin-top:.4rem;background:#fff;border:1px dashed #cfd9df;color:#5a6877;padding:.45rem .9rem;border-radius:8px;cursor:pointer;font-weight:600;font-size:.82rem;}',
            '.aipkg-itin-add:hover{background:#f6f9fa;color:#8e44ad;border-color:#8e44ad;}',
            '.aipkg-foot{padding:.85rem 1.25rem;border-top:1px solid #e3e8ef;display:flex;justify-content:flex-end;gap:.5rem;background:#f9fbfc;flex-shrink:0;}',
            '.aipkg-cancel{padding:.55rem 1.1rem;border-radius:8px;font:inherit;font-size:.9rem;font-weight:600;cursor:pointer;border:1px solid #cfd9df;background:#fff;color:#5a6877;}',
            '.aipkg-cancel:hover{background:#f0f3f5;}',
            '.aipkg-save{padding:.55rem 1.2rem;border-radius:8px;font:inherit;font-size:.9rem;font-weight:700;cursor:pointer;border:0;background:linear-gradient(135deg,#8e44ad,#3498db);color:#fff;display:inline-flex;align-items:center;gap:.4rem;box-shadow:0 2px 8px rgba(142,68,173,.32);}',
            '.aipkg-save:hover:not(:disabled){filter:brightness(1.05);}',
            '.aipkg-save:disabled{opacity:.65;cursor:not-allowed;}',
            '@media (max-width:720px){.aipkg-body{grid-template-columns:1fr;}}'
        ].join('');
        document.head.appendChild(css);
    }

    if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',injectButton);}else{injectButton();}
    document.querySelectorAll('.sidebar-link[data-section="packages"]').forEach(function(link){link.addEventListener('click',function(){setTimeout(injectButton,50);});});
})();
