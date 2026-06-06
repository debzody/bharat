/* ── Itinerary list editors — line-by-line inclusions / exclusions /
 *    activities for the dashboard's day-card editor ─────────────────
 * Two editors:
 *   1. wireStringList(rootEl, getArr, setArr, opts)
 *      Plain string list — Inclusions, Exclusions, Highlights.
 *   2. wireActivityList(rootEl, day, opts)
 *      Per-day activity rows; each row has a chevron toggle that
 *      reveals Description + Image (URL or Cloudinary upload).
 *
 * Activities are stored back as plain strings when no extras are set
 * (legacy back-compat) and as { title, desc, imageUrl } objects when
 * the user fills any extra field. Rendering side accepts both shapes.
 *
 * Loaded by dashboard.html before js/dashboard.js. Self-contained;
 * exposes window.IteListEditors. ─────────────────────────────────── */
(function () {
    'use strict';

    function actionBtn(iconClass, title, fn, disabled) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn-il-act';
        b.title = title;
        b.innerHTML = '<i class="fas ' + iconClass + '"></i>';
        if (disabled) b.disabled = true;
        b.addEventListener('click', fn);
        return b;
    }

    function wireStringList(rootEl, getArr, setArr, opts) {
        if (!rootEl) return;
        opts = opts || {};
        rootEl.classList.add('il-list');
        function read() { var v = getArr(); return Array.isArray(v) ? v.slice() : []; }
        function write(arr) { setArr(arr); }
        function refresh() {
            rootEl.innerHTML = '';
            var arr = read();
            if (!arr.length) {
                var empty = document.createElement('p');
                empty.className = 'il-empty';
                empty.textContent = 'No items yet — click ' +
                    (opts.addLabel || 'Add') + ' below to start.';
                rootEl.appendChild(empty);
            } else {
                arr.forEach(function (val, idx) {
                    var row = document.createElement('div');
                    row.className = 'il-row';
                    var input = document.createElement('input');
                    input.type = 'text';
                    input.className = 'il-row-input';
                    input.value = val == null ? '' : String(val);
                    if (opts.placeholder) input.placeholder = opts.placeholder;
                    input.addEventListener('input', function () {
                        var a = read(); a[idx] = input.value; write(a);
                    });
                    row.appendChild(input);
                    row.appendChild(actionBtn('fa-chevron-up', 'Move up', function () {
                        if (idx === 0) return;
                        var a = read(); var t = a[idx - 1];
                        a[idx - 1] = a[idx]; a[idx] = t;
                        write(a); refresh();
                    }, idx === 0));
                    row.appendChild(actionBtn('fa-chevron-down', 'Move down', function () {
                        var a = read();
                        if (idx >= a.length - 1) return;
                        var t = a[idx + 1]; a[idx + 1] = a[idx]; a[idx] = t;
                        write(a); refresh();
                    }, idx >= arr.length - 1));
                    row.appendChild(actionBtn('fa-trash', 'Remove', function () {
                        var a = read(); a.splice(idx, 1); write(a); refresh();
                    }));
                    rootEl.appendChild(row);
                });
            }
            var add = document.createElement('button');
            add.type = 'button';
            add.className = 'btn-il-add';
            add.innerHTML = '<i class="fas fa-plus"></i> ' + (opts.addLabel || 'Add Item');
            add.addEventListener('click', function () {
                var a = read(); a.push(''); write(a); refresh();
                var inputs = rootEl.querySelectorAll('.il-row-input');
                if (inputs.length) inputs[inputs.length - 1].focus();
            });
            rootEl.appendChild(add);
        }
        refresh();
    }

    function actToObj(a) {
        if (a == null) return { title: '' };
        if (typeof a === 'string') return { title: a };
        return {
            title: String(a.title || ''),
            desc: a.desc || '',
            imageUrl: a.imageUrl || '',
            imagePublicId: a.imagePublicId || '',
            // List of auto-picked Unsplash URLs the admin has hidden from the
            // public carousel. We round-trip this so removals stick across
            // saves. Stored as a plain array of strings.
            excludedImages: Array.isArray(a.excludedImages) ? a.excludedImages.slice() : []
        };
    }
    function objToAct(o) {
        if (!o) return '';
        var hasExclusions = Array.isArray(o.excludedImages) && o.excludedImages.length > 0;
        var hasExtra = !!(o.desc || o.imageUrl || hasExclusions);
        if (!hasExtra) return o.title || '';
        var out = { title: o.title || '' };
        if (o.desc) out.desc = o.desc;
        if (o.imageUrl) out.imageUrl = o.imageUrl;
        if (o.imagePublicId) out.imagePublicId = o.imagePublicId;
        if (hasExclusions) out.excludedImages = o.excludedImages.slice();
        return out;
    }

    function wireActivityList(rootEl, day, opts) {
        if (!rootEl) return;
        opts = opts || {};
        rootEl.classList.add('il-act-list');

        function readAsObjs() {
            var src = Array.isArray(day.activities) ? day.activities : [];
            return src.map(actToObj);
        }
        function writeFromObjs(arr) {
            day.activities = arr.map(objToAct);
        }

        function refresh() {
            rootEl.innerHTML = '';
            var arr = readAsObjs();
            if (!arr.length) {
                var empty = document.createElement('p');
                empty.className = 'il-empty';
                empty.textContent = 'No activities yet — click + Add Activity below.';
                rootEl.appendChild(empty);
            } else {
                arr.forEach(function (_act, idx) {
                    rootEl.appendChild(buildRow(arr, idx));
                });
            }
            var add = document.createElement('button');
            add.type = 'button';
            add.className = 'btn-il-add';
            add.innerHTML = '<i class="fas fa-plus"></i> Add Activity';
            add.addEventListener('click', function () {
                var arr2 = readAsObjs();
                arr2.push({ title: '' });
                writeFromObjs(arr2);
                refresh();
                var inputs = rootEl.querySelectorAll('.il-act-title-input');
                if (inputs.length) inputs[inputs.length - 1].focus();
            });
            rootEl.appendChild(add);
        }

        function buildRow(arr, idx) {
            var act = arr[idx];

            var row = document.createElement('div');
            row.className = 'il-act-row';

            // Header
            var head = document.createElement('div');
            head.className = 'il-act-head';

            var toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.className = 'btn-il-toggle';
            toggleBtn.title = 'Show description / image fields';
            toggleBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';

            var titleInput = document.createElement('input');
            titleInput.type = 'text';
            titleInput.className = 'il-act-title-input';
            titleInput.placeholder = 'e.g. Visit Cellular Jail';
            titleInput.value = act.title || '';
            titleInput.addEventListener('input', function () {
                act.title = titleInput.value;
                writeFromObjs(arr);
            });

            var actions = document.createElement('div');
            actions.className = 'il-act-actions';
            actions.appendChild(actionBtn('fa-chevron-up', 'Move up', function () {
                if (idx === 0) return;
                var t = arr[idx - 1]; arr[idx - 1] = arr[idx]; arr[idx] = t;
                writeFromObjs(arr); refresh();
            }, idx === 0));
            actions.appendChild(actionBtn('fa-chevron-down', 'Move down', function () {
                if (idx >= arr.length - 1) return;
                var t = arr[idx + 1]; arr[idx + 1] = arr[idx]; arr[idx] = t;
                writeFromObjs(arr); refresh();
            }, idx >= arr.length - 1));
            actions.appendChild(actionBtn('fa-trash', 'Remove', function () {
                arr.splice(idx, 1);
                writeFromObjs(arr); refresh();
            }));

            head.appendChild(toggleBtn);
            head.appendChild(titleInput);
            head.appendChild(actions);
            row.appendChild(head);

            // Body
            var body = document.createElement('div');
            body.className = 'il-act-body';
            var startOpen = !!(act.desc || act.imageUrl);
            if (!startOpen) body.classList.add('is-collapsed');
            else toggleBtn.classList.add('is-open');

            // Description (with optional ✨ AI Fill button)
            var descLbl = document.createElement('label');
            descLbl.className = 'il-act-field';

            // Header row: "Description" label on the left, ✨ AI Fill on the right.
            // The button is only added when window.AIAssistant.generateText is
            // available (i.e. the dashboard has the ai-assistant Worker
            // configured) — keeps the UI clean for setups without AI.
            var descHead = document.createElement('div');
            descHead.className = 'il-act-field-head';
            var descSpan = document.createElement('span');
            descSpan.textContent = 'Description';
            descHead.appendChild(descSpan);

            var descInput = document.createElement('textarea');
            descInput.rows = 2;
            descInput.placeholder = 'Optional short description shown on the public page';
            descInput.value = act.desc || '';
            descInput.addEventListener('input', function () {
                act.desc = descInput.value;
                writeFromObjs(arr);
            });

            // ✨ AI Fill button — generates a 1-2 sentence description from
            // the activity title using the ai-assistant Worker. Disabled
            // when the title is empty (otherwise the AI has nothing to
            // describe). Fires only on click — no auto-fill that could burn
            // the Gemini quota on every keystroke.
            if (window.AIAssistant && typeof window.AIAssistant.generateText === 'function') {
                var aiBtn = document.createElement('button');
                aiBtn.type = 'button';
                aiBtn.className = 'btn-il-ai';
                aiBtn.title = 'Generate description with AI (based on the activity title)';
                aiBtn.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i> AI Fill';
                aiBtn.addEventListener('click', function () {
                    var t = (titleInput && titleInput.value || '').trim();
                    if (!t) {
                        if (window.showToast) window.showToast('Type the activity title first, then click AI Fill.', 'info');
                        else alert('Type the activity title first, then click AI Fill.');
                        if (titleInput) titleInput.focus();
                        return;
                    }
                    var orig = aiBtn.innerHTML;
                    aiBtn.disabled = true;
                    aiBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Thinking…';
                    var ctx = {};
                    try {
                        if (typeof opts.getPackageName === 'function') ctx.packageName = String(opts.getPackageName() || '');
                        if (typeof opts.getDayTitle    === 'function') ctx.dayTitle    = String(opts.getDayTitle()    || '');
                        if (typeof opts.getDayNumber   === 'function') ctx.dayNumber   = Number(opts.getDayNumber()   || 0);
                    } catch (_) {}
                    window.AIAssistant.generateText({
                        kind:    'activity',
                        title:   t,
                        context: ctx
                    }).then(function (text) {
                        if (text) {
                            descInput.value = text;
                            // Trigger the same input event the textarea fires
                            // when the user types, so writeFromObjs() runs and
                            // the data is persisted.
                            act.desc = text;
                            writeFromObjs(arr);
                            try { descInput.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
                            // Keep the body open so the result is immediately visible
                            body.classList.remove('is-collapsed');
                            toggleBtn.classList.add('is-open');
                            if (window.showToast) window.showToast('AI description added — feel free to edit.', 'success');
                        } else if (window.showToast) {
                            window.showToast('AI returned an empty response — try again.', 'warning');
                        }
                    }).catch(function (err) {
                        if (window.showToast) window.showToast('AI Fill failed: ' + (err.message || err), 'error');
                        else alert('AI Fill failed: ' + (err.message || err));
                    }).finally(function () {
                        aiBtn.disabled = false;
                        aiBtn.innerHTML = orig;
                    });
                });
                descHead.appendChild(aiBtn);
            }

            descLbl.appendChild(descHead);
            descLbl.appendChild(descInput);
            body.appendChild(descLbl);

            // Image preview + controls
            var imgPreview = document.createElement('div');
            imgPreview.className = 'il-act-image-preview';

            // Lightweight stand-in for the (now-removed) URL <input>.
            // Other handlers below still reference urlInput.value when an
            // upload completes or the image is cleared, so we keep a
            // detached element to satisfy those reads/writes without
            // adding a visible field. Admins manage the cover image
            // exclusively via the Upload button + the ×/restore tiles.
            var urlInput = document.createElement('input');
            urlInput.type = 'hidden';
            urlInput.value = act.imageUrl || '';

            var ctlRow = document.createElement('div');
            ctlRow.className = 'il-act-image-controls';

            var uploadBtn = document.createElement('button');
            uploadBtn.type = 'button';
            uploadBtn.className = 'btn-il-upload';
            uploadBtn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Upload';
            uploadBtn.title = 'Upload an image (Cloudinary)';

            var fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*';
            fileInput.style.display = 'none';

            var statusEl = document.createElement('span');
            statusEl.className = 'il-act-image-status';

            uploadBtn.addEventListener('click', function () { fileInput.click(); });
            fileInput.addEventListener('change', function () {
                var file = fileInput.files && fileInput.files[0];
                if (!file) return;
                if (!window.GalleryStore || typeof window.GalleryStore.uploadGalleryImage !== 'function') {
                    statusEl.textContent = 'Uploader not loaded — paste an image URL instead.';
                    statusEl.style.color = '#c0392b';
                    fileInput.value = '';
                    return;
                }
                var defaults = (typeof opts.uploadDefaults === 'function')
                    ? (opts.uploadDefaults(day) || {}) : {};
                var prefilled = {
                    title:      defaults.title || (act.title || 'Activity image'),
                    category:   defaults.category || '',
                    date:       defaults.date || new Date().toISOString().slice(0, 10),
                    place:      defaults.place || '',
                    packageRef: defaults.packageRef || ''
                };

                // Pop the shared "Photo details — required" dialog so the
                // activity image is tagged with the same Title / Category /
                // Date / Place / Package as a day-photo upload. Falls back
                // to the silent path if the dialog helper isn't loaded yet.
                var metaPromise;
                if (window.IteUploadDialog && typeof window.IteUploadDialog.open === 'function') {
                    metaPromise = window.IteUploadDialog.open(prefilled, [file]);
                } else {
                    metaPromise = Promise.resolve(prefilled);
                }

                metaPromise.then(function (chosen) {
                    if (!chosen) {                    // user cancelled
                        statusEl.textContent = '';
                        fileInput.value = '';
                        return null;
                    }
                    statusEl.textContent = 'Uploading…';
                    statusEl.style.color = '#0d7a8a';
                    uploadBtn.disabled = true;

                    var meta = {
                        title:      chosen.title,
                        category:   chosen.category,
                        date:       chosen.date,
                        place:      chosen.place,
                        packageRef: chosen.packageRef,
                        order:      9999
                    };
                    return window.GalleryStore.uploadGalleryImage(file, meta);
                }).then(function (item) {
                    if (!item) return;
                    act.imageUrl = item.url || item.thumbUrl || '';
                    act.imagePublicId = item.publicId || item.id || '';
                    urlInput.value = act.imageUrl;
                    writeFromObjs(arr);
                    statusEl.textContent = '\u2713 Uploaded.';
                    statusEl.style.color = '#0d7a8a';
                    paintPreview();
                }).catch(function (err) {
                    console.error('activity upload failed:', err);
                    statusEl.textContent = 'Upload failed: ' + (err && err.message || err);
                    statusEl.style.color = '#c0392b';
                }).then(function () {
                    uploadBtn.disabled = false;
                    fileInput.value = '';
                });
            });

            ctlRow.appendChild(uploadBtn);
            ctlRow.appendChild(fileInput);
            ctlRow.appendChild(statusEl);

            body.appendChild(imgPreview);
            body.appendChild(ctlRow);

            // ── Auto-picked carousel manager ──────────────────────
            //   Shows the same Unsplash photos that the public package
            //   page uses for this activity's carousel. Each thumb has
            //   a "×" button that adds the photo URL to
            //   `act.excludedImages` so it disappears from the live
            //   site. Removed photos can be brought back via the
            //   "Restore removed photos" button.
            var carouselWrap = document.createElement('div');
            carouselWrap.className = 'il-act-field il-act-carousel-mgr';
            var carouselHead = document.createElement('div');
            carouselHead.className = 'il-act-field-head';
            var carouselSpan = document.createElement('span');
            carouselSpan.textContent = 'Auto-picked carousel photos';
            carouselHead.appendChild(carouselSpan);
            var restoreBtn = document.createElement('button');
            restoreBtn.type = 'button';
            restoreBtn.className = 'btn-il-ai';
            restoreBtn.title = 'Restore all removed carousel photos';
            restoreBtn.innerHTML = '<i class="fas fa-rotate-left"></i> Restore removed';
            restoreBtn.addEventListener('click', function () {
                act.excludedImages = [];
                writeFromObjs(arr);
                paintCarousel();
            });
            carouselHead.appendChild(restoreBtn);
            carouselWrap.appendChild(carouselHead);

            var carouselGrid = document.createElement('div');
            carouselGrid.className = 'il-act-carousel-grid';
            var carouselNote = document.createElement('p');
            carouselNote.className = 'il-act-carousel-note';
            carouselNote.style.cssText = 'margin:.4rem 0 0;font-size:.78rem;color:#5a6877;';
            carouselWrap.appendChild(carouselGrid);
            carouselWrap.appendChild(carouselNote);
            body.appendChild(carouselWrap);

            function getAutoCarouselImgs() {
                var imgs = [];
                if (act.imageUrl) imgs.push(act.imageUrl);
                if (window.ItineraryImagePicker &&
                    typeof window.ItineraryImagePicker.forActivityMulti === 'function') {
                    var picked = window.ItineraryImagePicker
                        .forActivityMulti(act.title || '', 8);
                    picked.forEach(function (p) {
                        if (imgs.indexOf(p) === -1) imgs.push(p);
                    });
                } else if (window.ItineraryImagePicker) {
                    var single = window.ItineraryImagePicker.forActivity(act.title || '');
                    if (single && imgs.indexOf(single) === -1) imgs.push(single);
                }
                return imgs;
            }

            function paintCarousel() {
                carouselGrid.innerHTML = '';
                var allImgs = getAutoCarouselImgs();
                if (!allImgs.length) {
                    carouselGrid.innerHTML = '<p class="il-empty" style="margin:.3rem 0;">' +
                        'Type an activity title above to see the auto-picked photos here.</p>';
                    carouselNote.textContent = '';
                    return;
                }
                var excluded = Array.isArray(act.excludedImages) ? act.excludedImages : [];
                var visible = allImgs.filter(function (s) { return excluded.indexOf(s) === -1; });
                var shown = visible.slice(0, 5);
                allImgs.forEach(function (src) {
                    var isExcluded = excluded.indexOf(src) !== -1;
                    var isOverflow = !isExcluded && shown.indexOf(src) === -1;
                    var tile = document.createElement('div');
                    tile.className = 'il-act-carousel-tile' +
                        (isExcluded ? ' is-excluded' : '') +
                        (isOverflow ? ' is-overflow' : '');
                    tile.innerHTML =
                        '<img src="' + encodeURI(src) + '" alt="" loading="lazy">' +
                        (isExcluded
                            ? '<button type="button" class="il-act-carousel-restore" title="Bring this photo back"><i class="fas fa-rotate-left"></i></button>'
                            : '<button type="button" class="il-act-carousel-remove" title="Hide this photo from the public carousel"><i class="fas fa-times"></i></button>');
                    var btn = tile.querySelector('button');
                    btn.addEventListener('click', function () {
                        if (!Array.isArray(act.excludedImages)) act.excludedImages = [];
                        if (isExcluded) {
                            // Restore: remove from excludedImages
                            act.excludedImages = act.excludedImages.filter(function (s) { return s !== src; });
                        } else {
                            // Hide: append to excludedImages (de-dupe)
                            if (act.excludedImages.indexOf(src) === -1) act.excludedImages.push(src);
                        }
                        writeFromObjs(arr);
                        paintCarousel();
                    });
                    carouselGrid.appendChild(tile);
                });
                carouselNote.textContent = 'Showing ' + Math.min(shown.length, 5) +
                    ' of ' + visible.length + ' photo' + (visible.length === 1 ? '' : 's') +
                    ' on the public page' +
                    (excluded.length ? ' · ' + excluded.length + ' hidden' : '') + '.';
            }
            paintCarousel();

            // When the title changes the auto-picked photos change too —
            // refresh the manager so admins see what visitors will see.
            titleInput.addEventListener('input', paintCarousel);

            function paintPreview() {
                if (act.imageUrl) {
                    imgPreview.innerHTML =
                        '<img src="' + encodeURI(act.imageUrl) + '" alt="" loading="lazy">' +
                        '<button type="button" class="il-act-image-clear" title="Remove image">' +
                            '<i class="fas fa-times"></i></button>';
                    var clearBtn = imgPreview.querySelector('.il-act-image-clear');
                    if (clearBtn) {
                        clearBtn.addEventListener('click', function () {
                            act.imageUrl = '';
                            act.imagePublicId = '';
                            urlInput.value = '';
                            writeFromObjs(arr);
                            paintPreview();
                        });
                    }
                } else {
                    imgPreview.innerHTML = '<div class="il-act-image-placeholder">' +
                        '<i class="fas fa-image"></i><span>No image yet</span></div>';
                }
            }
            paintPreview();

            row.appendChild(body);

            // Toggle handler
            toggleBtn.addEventListener('click', function () {
                if (body.classList.contains('is-collapsed')) {
                    body.classList.remove('is-collapsed');
                    toggleBtn.classList.add('is-open');
                } else {
                    body.classList.add('is-collapsed');
                    toggleBtn.classList.remove('is-open');
                }
            });

            // Click on the title also expands when collapsed (nicer UX)
            titleInput.addEventListener('focus', function () {
                if (body.classList.contains('is-collapsed')) {
                    body.classList.remove('is-collapsed');
                    toggleBtn.classList.add('is-open');
                }
            });

            return row;
        }

        refresh();
    }

    window.IteListEditors = {
        wireStringList: wireStringList,
        wireActivityList: wireActivityList
    };
})();
