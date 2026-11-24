'use strict';
// Utilidades y controles táctiles del móvil

// =========================================================================
// 6. MOTOR DE COMBATE (TEKKEN JUGGLE COMBOS & BLOQUEO DIRECCIONAL)
// =========================================================================

// =========================================================================
// UTILIDADES: escape HTML (los nombres llegan por red) y CONTROLES TÁCTILES
// =========================================================================
function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const TouchPad = {
    held: {},          // código -> nº de dedos que lo mantienen
    pointers: new Map(), // pointerId -> [códigos]
    ready: false,
    isTouchDevice() {
        const mm = q => window.matchMedia && window.matchMedia(q).matches;
        return mm('(pointer: coarse)') || (navigator.maxTouchPoints > 0 && !mm('(hover: hover)'));
    },
    pref() { try { return localStorage.getItem('touch_controls_v1'); } catch (e) { return null; } },
    shouldShow() {
        const p = this.pref();
        if (p === 'on') return true;
        if (p === 'off') return false;
        return this.isTouchDevice();
    },
    refresh() { document.body.classList.toggle('touch-on', this.shouldShow()); },
    toggle() {
        try { localStorage.setItem('touch_controls_v1', this.shouldShow() ? 'off' : 'on'); } catch (e) {}
        this.refresh();
    },
    press(codes) { codes.forEach(c => { this.held[c] = (this.held[c] || 0) + 1; }); this.paint(); },
    release(codes) { codes.forEach(c => { this.held[c] = Math.max(0, (this.held[c] || 0) - 1); }); this.paint(); },
    releaseAll() {
        this.held = {}; this.pointers.clear(); this.stickPtr = null; this.resetKnob(); this.paint();
    },
    resetKnob() {
        document.querySelectorAll('#touch-controls .tc-knob').forEach(k => { k.style.transform = 'translate(-50%, -50%)'; });
        document.querySelectorAll('#touch-controls .tc-stick.on').forEach(s => s.classList.remove('on'));
    },
    paint() {
        document.querySelectorAll('#touch-controls .touch-btn').forEach(b => {
            const codes = (b.dataset.key || '').split(',');
            b.classList.toggle('pressed', codes.every(c => (this.held[c] || 0) > 0));
        });
    },
    isDown(code) { return (this.held[code] || 0) > 0; },
    codesAt(x, y) {
        const el = document.elementFromPoint(x, y);
        const btn = el && el.closest ? el.closest('#touch-controls .touch-btn') : null;
        return btn ? (btn.dataset.key || '').split(',') : [];
    },
    // ---- Controles libres: cada botón se coloca según el perfil del modo (VERSUS / COOP) ----
    WIDGETS: ['move', 'super', 'grab', 'lp', 'mp', 'hp', 'lk', 'mk', 'hk'],
    WIDGET_NAMES: { move: 'Movimiento', super: 'SÚPER', grab: 'AGARRE', lp: 'Puño débil', mp: 'Puño medio', hp: 'Puño fuerte', lk: 'Patada débil', mk: 'Patada media', hk: 'Patada fuerte' },
    makeWidget(id, moveMode, pos, ctrlMode) {
        const coop = (ctrlMode || CtrlProfiles.playMode) === 'coop';
        const w = document.createElement('div');
        w.className = 'tw' + (id === 'move' ? ' tw-move' : '');
        w.dataset.wid = id;
        w.style.setProperty('--s', pos.s);
        w.style.setProperty('--o', pos.o != null ? pos.o : TOUCH_OPACITY_DEFAULT);
        w.style.left = pos.x + '%';
        w.style.top = pos.y + '%';
        const btn = (key, cls, txt) => `<button data-key="${key}" class="touch-btn ${cls}">${txt}</button>`;
        let html = '';
        if (id === 'move') {
            if (moveMode === 'stick') html = '<div class="tc-stick"><div class="tc-knob"></div></div>';
            else html = `<div class="tc-dpad">
                ${btn('ArrowUp,ArrowLeft', 'corner', '↖')}${btn('ArrowUp', '', '▲')}${btn('ArrowUp,ArrowRight', 'corner', '↗')}
                ${btn('ArrowLeft', '', '◀')}<div></div>${btn('ArrowRight', '', '▶')}
                ${btn('ArrowDown,ArrowLeft', 'corner', '↙')}${btn('ArrowDown', '', '▼')}${btn('ArrowDown,ArrowRight', 'corner', '↘')}
            </div>`;
        } else if (id === 'super') html = btn('Super', 'tc-super', 'SÚPER');
        else if (id === 'grab') html = btn('Grab', 'tc-grab', 'AGARRE');
        else {
            const keys = { lp: ['KeyU', 'tc-punch', coop ? 'S.C' : 'P.D'], mp: ['KeyI', 'tc-punch', 'P.M'], hp: ['KeyO', 'tc-punch', 'P.F'],
                           lk: ['KeyJ', 'tc-kick', coop ? 'S.L' : 'K.D'], mk: ['KeyK', 'tc-kick', 'K.M'], hk: ['KeyL', 'tc-kick', 'K.F'] }[id];
            html = btn(keys[0], keys[1], keys[2]);
        }
        w.innerHTML = html;
        return w;
    },
    applyProfile() {
        const root = document.getElementById('touch-controls');
        if (!root) return;
        const prof = CtrlProfiles.touch(CtrlProfiles.playMode);
        this.held = {}; this.pointers.clear(); this.stickPtr = null;
        root.innerHTML = '';
        for (const id of this.WIDGETS) root.appendChild(this.makeWidget(id, prof.mode, prof.layout[id], CtrlProfiles.playMode));
        this.paint();
    },
    stickUpdate(e) {
        const sp = this.stickPtr;
        if (!sp) return;
        const r = sp.el.getBoundingClientRect();
        const rad = r.width / 2;
        const dx = e.clientX - (r.left + rad), dy = e.clientY - (r.top + r.height / 2);
        const t = rad * 0.3;
        const codes = [];
        if (dx < -t) codes.push('ArrowLeft'); else if (dx > t) codes.push('ArrowRight');
        if (dy < -t) codes.push('ArrowUp'); else if (dy > t) codes.push('ArrowDown');
        if (codes.join() !== sp.codes.join()) {
            this.release(sp.codes);
            sp.codes = codes;
            this.press(codes);
        }
        // El pomo sigue al dedo sin salirse de la base
        const d = Math.hypot(dx, dy), lim = rad * 0.55, k = d > lim ? lim / d : 1;
        const knob = sp.el.querySelector('.tc-knob');
        if (knob) knob.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
    },
    init() {
        if (this.ready) return;
        this.ready = true;
        const root = document.getElementById('touch-controls');
        const move = (e, codes) => {
            const prev = this.pointers.get(e.pointerId) || [];
            if (prev.join() === codes.join()) return;
            this.release(prev);
            this.pointers.set(e.pointerId, codes);
            this.press(codes);
        };
        root.addEventListener('pointerdown', (e) => {
            const stickEl = e.target.closest ? e.target.closest('.tc-stick') : null;
            if (stickEl && !this.stickPtr) {
                e.preventDefault();
                try { root.setPointerCapture(e.pointerId); } catch (err) {}
                this.stickPtr = { id: e.pointerId, el: stickEl, codes: [] };
                stickEl.classList.add('on');
                this.stickUpdate(e);
                return;
            }
            const codes = this.codesAt(e.clientX, e.clientY);
            if (!codes.length) return;
            e.preventDefault();
            try { root.setPointerCapture(e.pointerId); } catch (err) {}
            move(e, codes);
        });
        // Deslizar el dedo por la cruceta cambia de dirección sin soltar; las acciones se mantienen
        root.addEventListener('pointermove', (e) => {
            if (this.stickPtr && e.pointerId === this.stickPtr.id) { e.preventDefault(); this.stickUpdate(e); return; }
            if (!this.pointers.has(e.pointerId)) return;
            e.preventDefault();
            const cur = this.pointers.get(e.pointerId) || [];
            const isDir = cur.some(c => c.startsWith('Arrow'));
            if (!isDir) return;
            const codes = this.codesAt(e.clientX, e.clientY);
            if (codes.length && codes.some(c => c.startsWith('Arrow'))) move(e, codes);
        });
        const end = (e) => {
            if (this.stickPtr && e.pointerId === this.stickPtr.id) {
                this.release(this.stickPtr.codes);
                this.stickPtr = null;
                this.resetKnob();
                return;
            }
            if (!this.pointers.has(e.pointerId)) return;
            this.release(this.pointers.get(e.pointerId));
            this.pointers.delete(e.pointerId);
        };
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => root.addEventListener(t, end));
        root.addEventListener('contextmenu', e => e.preventDefault());
        window.addEventListener('blur', () => this.releaseAll());
        document.addEventListener('visibilitychange', () => { if (document.hidden) this.releaseAll(); });
        window.matchMedia && window.matchMedia('(pointer: coarse)').addEventListener &&
            window.matchMedia('(pointer: coarse)').addEventListener('change', () => this.refresh());
        this.refresh();
    }
};
document.addEventListener('contextmenu', (e) => { if (!document.getElementById('screen-game').classList.contains('hidden')) e.preventDefault(); });


// =========================================================================
// EDITOR DE CONTROLES TÁCTILES: arrastrar para mover, control de tamaño para escalar.
// Se dibuja sobre una escena de referencia (arena + dos luchadores) para ver el tamaño real.
// =========================================================================
const TouchEditor = {
    mode: 'versus', work: null, sel: null, drag: null, raf: 0,
    $(id) { return document.getElementById(id); },
    open(mode) {
        this.mode = mode;
        this.work = JSON.parse(JSON.stringify(CtrlProfiles.touch(mode)));
        this.sel = null;
        this.$('te-mode').textContent = mode === 'coop' ? 'COOPERATIVO' : 'VERSUS';
        this.$('touch-editor').classList.remove('hidden');
        this.render();
        this.updateBar();
        this.startScene();
    },
    close() {
        this.$('touch-editor').classList.add('hidden');
        cancelAnimationFrame(this.raf);
        this.raf = 0;
    },
    render() {
        const layer = this.$('touch-editor-layer');
        layer.innerHTML = '';
        for (const id of TouchPad.WIDGETS) {
            const w = TouchPad.makeWidget(id, this.work.mode, this.work.layout[id], this.mode);
            w.classList.add('tw-edit');
            if (id === this.sel) w.classList.add('sel');
            layer.appendChild(w);
        }
    },
    updateBar() {
        const sel = this.sel, name = this.$('te-sel-name'), rng = this.$('te-size'), val = this.$('te-size-val');
        const orng = this.$('te-opa'), oval = this.$('te-opa-val'), oall = this.$('te-opa-all');
        if (!sel) { name.textContent = 'Toca un botón'; rng.disabled = true; val.textContent = ''; orng.disabled = true; oall.disabled = true; oval.textContent = ''; return; }
        const op = Math.round((this.work.layout[sel].o != null ? this.work.layout[sel].o : TOUCH_OPACITY_DEFAULT) * 100);
        orng.disabled = false; oall.disabled = false; orng.value = op; oval.textContent = op + '%';
        const s = Math.round(this.work.layout[sel].s * 100);
        name.textContent = (this.mode === 'coop' && sel === 'lp') ? 'Salto corto' : (this.mode === 'coop' && sel === 'lk') ? 'Salto largo' : TouchPad.WIDGET_NAMES[sel];
        rng.disabled = false; rng.value = s; val.textContent = s + '%';
    },
    setSize(pct) {
        if (!this.sel) return;
        const v = Math.max(50, Math.min(220, pct));
        this.work.layout[this.sel].s = v / 100;
        const el = this.$('touch-editor-layer').querySelector(`.tw[data-wid="${this.sel}"]`);
        if (el) el.style.setProperty('--s', v / 100);
        this.updateBar();
    },
    setOpacity(pct, all) {
        const v = Math.max(TOUCH_OPACITY_MIN * 100, Math.min(100, pct)) / 100;
        const ids = all ? TouchPad.WIDGETS : (this.sel ? [this.sel] : []);
        for (const id of ids) {
            this.work.layout[id].o = v;
            const el = this.$('touch-editor-layer').querySelector(`.tw[data-wid="${id}"]`);
            if (el) el.style.setProperty('--o', v);
        }
        this.updateBar();
    },
    select(id) {
        this.sel = id;
        this.$('touch-editor-layer').querySelectorAll('.tw').forEach(w => w.classList.toggle('sel', w.dataset.wid === id));
        this.updateBar();
    },
    initEvents() {
        if (this._ev) return;
        this._ev = true;
        const layer = this.$('touch-editor-layer');
        layer.addEventListener('pointerdown', (e) => {
            const w = e.target.closest ? e.target.closest('.tw') : null;
            if (!w) { this.select(null); return; }
            e.preventDefault();
            const id = w.dataset.wid;
            this.select(id);
            const p = this.work.layout[id];
            this.drag = { id, el: w, pid: e.pointerId, ox: e.clientX / innerWidth * 100 - p.x, oy: e.clientY / innerHeight * 100 - p.y };
            try { layer.setPointerCapture(e.pointerId); } catch (err) {}
        });
        layer.addEventListener('pointermove', (e) => {
            const d = this.drag;
            if (!d || e.pointerId !== d.pid) return;
            e.preventDefault();
            const p = this.work.layout[d.id];
            p.x = Math.max(2, Math.min(98, e.clientX / innerWidth * 100 - d.ox));
            p.y = Math.max(2, Math.min(98, e.clientY / innerHeight * 100 - d.oy));
            d.el.style.left = p.x + '%';
            d.el.style.top = p.y + '%';
        });
        const end = (e) => { if (this.drag && e.pointerId === this.drag.pid) this.drag = null; };
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => layer.addEventListener(t, end));
        this.$('te-size').oninput = (e) => this.setSize(+e.target.value);
        this.$('te-opa').oninput = (e) => this.setOpacity(+e.target.value);
        this.$('te-opa-all').onclick = () => { if (this.sel) this.setOpacity(Math.round(this.work.layout[this.sel].o * 100), true); };
        this.$('te-minus').onclick = () => { if (this.sel) this.setSize(Math.round(this.work.layout[this.sel].s * 100) - 10); };
        this.$('te-plus').onclick = () => { if (this.sel) this.setSize(Math.round(this.work.layout[this.sel].s * 100) + 10); };
        this.$('te-reset').onclick = () => {
            this.work.layout = JSON.parse(JSON.stringify(DEFAULT_TOUCH_LAYOUT));
            this.render(); this.updateBar();
        };
        this.$('te-cancel').onclick = () => this.close();
        this.$('te-save').onclick = () => {
            CtrlProfiles.data[this.mode].touch = JSON.parse(JSON.stringify(this.work));
            CtrlProfiles.save();
            TouchPad.applyProfile();
            if (typeof renderSettingsUI === 'function') renderSettingsUI();
            this.close();
            if (typeof showToast === 'function') showToast('Controles táctiles guardados.', 'success');
        };
        window.addEventListener('resize', () => { if (this.raf) this.drawScene(); });
    },
    startScene() {
        this.initEvents();
        cancelAnimationFrame(this.raf);
        const loop = (now) => { this.drawScene(now / 1000); this.raf = requestAnimationFrame(loop); };
        this.raf = requestAnimationFrame(loop);
    },
    // Escena de referencia: cielo, montañas, suelo, barras de vida y dos luchadores
    drawScene(t) {
        t = t || 0;
        const cv = this.$('touch-editor-bg');
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const W = Math.round(innerWidth * dpr), H = Math.round(innerHeight * dpr);
        if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
        const ctx = cv.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#04050d'); g.addColorStop(0.45, '#141a3a'); g.addColorStop(0.78, '#3d2257'); g.addColorStop(1, '#a1456b');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fef3c7'; ctx.beginPath(); ctx.arc(W * 0.82, H * 0.2, H * 0.09, 0, 6.2832); ctx.fill();
        const ridge = (col, base, amp, f) => {
            ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, H);
            for (let x = 0; x <= W; x += 12) ctx.lineTo(x, H * base - Math.sin(x / W * f) * H * amp - Math.sin(x / W * f * 2.3) * H * amp * 0.4);
            ctx.lineTo(W, H); ctx.fill();
        };
        ridge('#2a2350', 0.62, 0.07, 7); ridge('#1c1838', 0.7, 0.05, 11);
        const gy = H * 0.84;
        ctx.fillStyle = '#2b1738'; ctx.fillRect(0, gy, W, H - gy);
        ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(0, gy, W, 2 * dpr);
        // Barras de vida de referencia
        const bar = (x, w, fill) => {
            ctx.fillStyle = 'rgba(2,6,23,.85)'; ctx.fillRect(x, H * 0.04, w, H * 0.035);
            ctx.fillStyle = fill; ctx.fillRect(x + 2, H * 0.04 + 2, (w - 4) * 0.8, H * 0.035 - 4);
        };
        bar(W * 0.04, W * 0.36, '#22c55e'); bar(W * 0.6, W * 0.36, '#ef4444');
        // Luchadores (los mismos dibujos del juego)
        try {
            const mk = (idx, facing) => ({ archetype: FIGHTER_ARCHETYPES[idx % FIGHTER_ARCHETYPES.length], state: 'idle', stateTimer: 0, stateMax: 1, alive: true, onGround: true,
                vx: 0, vy: 0, facing, animFrame: t * 10.8, stunTimer: 0, blocking: false, crouching: false, inJuggle: false, mp: 0, hitFlash: 0, slotIndex: idx });
            [[0, 1, 0.38], [3, -1, 0.62]].forEach(([idx, face, px]) => {
                const f = mk(idx, face);
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.translate(W * px, gy + H * 0.05);
                const s = (H * 0.42 / 150) * f.archetype.build.s;
                ctx.scale(s, s);
                FighterArt.draw(ctx, f, t);
                ctx.restore();
            });
        } catch (err) { /* la escena es solo referencia visual */ }
    }
};
