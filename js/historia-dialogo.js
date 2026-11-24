'use strict';
// =========================================================================
// MODO HISTORIA · ESCENA PREVIA AL COMBATE
//   Pantalla dividida en dos mitades (lado a lado o una sobre otra, alternando en cada combate) con un
//   primer plano de la cara de cada luchador y el diálogo clásico antes de pelear.
//   Avanzar: toque / clic / Enter / Espacio / A · Saltar: botón SALTAR, Esc, B o Start.
// =========================================================================
const STORY_VOICE = {
    ronin: {
        open: ['Has cruzado mi santuario... ahora sentirás el filo de mi espada.', 'You crossed my shrine... now you will feel the edge of my sword.'],
        threat: ['Mi espada no conoce la piedad. ¡Te aplastaré!', 'My blade knows no mercy. I will crush you!'],
        reply: ['Mi espada habla por mí. ¡Defiéndete!', 'My sword speaks for me. Defend yourself!'],
        vow: ['No retrocederé. ¡Por mi honor!', 'I will not back down. For my honor!']
    },
    blaze: {
        open: ['¿Sientes ese calor? Es solo el principio. ¡Te convertiré en cenizas!', 'Feel that heat? It is only the beginning. I will turn you to ashes!'],
        threat: ['Mi fuego no se apaga. ¡Vas a arder!', 'My fire never dies. You will burn!'],
        reply: ['¡Qué bien! Justo tenía ganas de quemar algo.', 'Great! I was just in the mood to burn something.'],
        vow: ['¡Ardamos hasta el final!', 'Let us burn to the very end!']
    },
    storm: {
        open: ['El trueno anuncia tu derrota. ¡No verás mi próximo golpe!', 'Thunder announces your defeat. You will not see my next strike!'],
        threat: ['Más rápido que un rayo... ¡te voy a freír!', 'Faster than lightning... I will fry you!'],
        reply: ['Habla menos... ¡y corre más!', 'Talk less... and run faster!'],
        vow: ['¡Que empiece el relámpago!', 'Let the lightning begin!']
    },
    vixen: {
        open: ['Qué ingenuo... entraste a mi oscuridad por voluntad propia.', 'How naive... you walked into my darkness willingly.'],
        threat: ['Te devoraré antes de que parpadees.', 'I will devour you before you can blink.'],
        reply: ['Deja de ladrar y demuéstralo.', 'Stop barking and prove it.'],
        vow: ['¡Hoy me llevo la victoria!', 'Today the victory is mine!']
    },
    cyborg: {
        open: ['ANÁLISIS COMPLETO: probabilidad de que ganes, 0,03 %.', 'ANALYSIS COMPLETE: your chance of winning, 0.03%.'],
        threat: ['Iniciando protocolo de aplastamiento. Resistirse es inútil.', 'Starting crush protocol. Resistance is futile.'],
        reply: ['Calculando... tu derrota llegará en tres golpes.', 'Calculating... your defeat will arrive in three hits.'],
        vow: ['Iniciando combate. Objetivo: ganar.', 'Starting combat. Objective: win.']
    },
    zephyra: {
        open: ['El viento ya susurró tu nombre... y dijo que perderás.', 'The wind already whispered your name... and said you will lose.'],
        threat: ['¡Te arrastraré como una hoja en mi tornado!', 'I will sweep you away like a leaf in my tornado!'],
        reply: ['El viento está de mi lado. ¡Prepárate!', 'The wind is on my side. Get ready!'],
        vow: ['¡Vuela, que empiezo yo!', 'Fly, because I am starting!']
    },
    titan: {
        open: ['¡Pequeñajo! Mis puños derriban montañas. ¡Te voy a pulverizar!', 'Little one! My fists topple mountains. I will pulverize you!'],
        threat: ['¡Sentirás la fuerza de la roca! ¡Te aplastaré!', 'You will feel the strength of the rock! I will crush you!'],
        reply: ['¿Eso es todo? ¡Ven aquí y siente mi fuerza!', 'Is that all? Come here and feel my strength!'],
        vow: ['¡Aquí se acaba tu camino!', 'Your road ends here!']
    },
    viper: {
        open: ['Un solo roce de mi veneno y todo habrá terminado.', 'One touch of my venom and it will all be over.'],
        threat: ['Lento y doloroso... ¡me encantará verte caer!', 'Slow and painful... I will love watching you fall!'],
        reply: ['Cuidado: mis colmillos muerden más fuerte que tus palabras.', 'Careful: my fangs bite harder than your words.'],
        vow: ['Es hora de inyectar el veneno final.', 'Time to deliver the final venom.']
    }
};

const StoryDialog = (function () {
    let root = null, raf = 0, st = null, padRaf = 0;
    const padPrev = {};
    const en = () => typeof I18n !== 'undefined' && I18n.lang && I18n.lang() === 'en';
    const pick = pair => (en() ? pair[1] : pair[0]);
    const esc = s => (typeof escapeHtml === 'function' ? escapeHtml(s) : String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));

    function lines(hero, rival) {
        const hv = STORY_VOICE[hero.id] || STORY_VOICE.ronin, rv = STORY_VOICE[rival.id] || STORY_VOICE.titan;
        return [
            { who: 'rival', text: pick(rv.open) },
            { who: 'hero', text: pick(hv.reply) },
            { who: 'rival', text: pick(rv.threat) },
            { who: 'hero', text: pick(hv.vow) }
        ];
    }

    function portrait(arch, facing, look) {
        const a = (typeof Look !== 'undefined' && look) ? Look.resolve(arch, look) : arch;
        return { archetype: a, facing, onGround: true, alive: true, vx: 0, vy: 0, vy0: 0, blocking: false, crouching: false, inJuggle: false, stunTimer: 0, hitFlash: 0, mp: 100, state: 'idle', stateTimer: 0, stateMax: 0, animFrame: 0, crouch: 0 };
    }

    function build(opts) {
        const mode = opts.idx % 2 === 0 ? 'h' : 'v';          // h = lado a lado · v = una sobre otra
        const hero = opts.hero, rival = opts.rival;
        root = document.createElement('div');
        root.id = 'story-vs';
        root.className = 'sv-' + mode;
        root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Diálogo previo al combate');
        const half = (cls, arch) => `<div class="sv-half ${cls}" style="--c:${arch.primary};--c2:${arch.secondary}"><canvas class="sv-cv"></canvas>` +
            `<div class="sv-tag"><span class="sv-ic">${arch.icon}</span><b>${esc(arch.name)}</b></div><div class="sv-bubble"><div class="sv-who"></div><div class="sv-text"></div><i class="sv-next">▶</i></div></div>`;
        // En horizontal: héroe a la izquierda y rival a la derecha. En vertical: rival arriba y héroe abajo.
        root.innerHTML = (mode === 'h' ? half('sv-hero', hero) + half('sv-rival', rival) : half('sv-rival', rival) + half('sv-hero', hero)) +
            `<div class="sv-flash"></div><div class="sv-line"></div><div class="sv-vs">VS</div>` +
            `<div class="sv-top"><span>COMBATE ${opts.idx + 1} / ${opts.total}</span><em>${esc(ARENAS[rival.homeArena].name.toUpperCase())}</em></div>` +
            `<button type="button" class="sv-skip">SALTAR ▶▶</button>`;
        document.body.appendChild(root);
        const cv = k => root.querySelector('.sv-' + k + ' .sv-cv');
        st = {
            opts, mode, t0: performance.now(), i: -1, typed: 0, lineT: 0, done: false, ending: false,
            list: lines(hero, rival),
            hero: { cv: cv('hero'), f: portrait(hero, 1, opts.look), arch: hero },
            rival: { cv: cv('rival'), f: portrait(rival, -1, null), arch: rival },
            els: { hero: root.querySelector('.sv-hero'), rival: root.querySelector('.sv-rival') }
        };
        root.addEventListener('pointerdown', e => { if (e.target.closest('.sv-skip')) return; e.preventDefault(); advance(); });
        root.querySelector('.sv-skip').addEventListener('click', e => { e.stopPropagation(); finish(); });
        document.addEventListener('keydown', onKey, true);
        setTimeout(() => { if (st && st.i < 0) next(); }, 900);     // tras la animación de apertura empieza el primer diálogo
    }

    function next() {
        if (!st || st.ending) return;
        st.i++;
        if (st.i >= st.list.length) return finish();
        const ln = st.list[st.i];
        st.typed = 0; st.lineT = performance.now();
        for (const k of ['hero', 'rival']) {
            const el = st.els[k];
            const on = k === ln.who;
            el.classList.toggle('talk', on);
            el.classList.toggle('dim', !on);
            const b = el.querySelector('.sv-bubble');
            b.classList.toggle('on', on);
            if (on) {
                el.querySelector('.sv-who').textContent = st.opts[k === 'hero' ? 'hero' : 'rival'].name;
                el.querySelector('.sv-text').textContent = '';
            }
        }
        try { sfx.sfxSelect && sfx.sfxSelect(); } catch (e) { /* ignorar */ }
    }
    function advance() {
        if (!st || st.ending || st.i < 0) return;
        const ln = st.list[st.i];
        if (st.typed < ln.text.length) { st.typed = ln.text.length; return; }      // completa el texto
        next();
    }
    function onKey(e) {
        if (!st) return;
        if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') { e.preventDefault(); e.stopPropagation(); advance(); }
        else if (e.code === 'Escape' || e.code === 'Backspace') { e.preventDefault(); e.stopPropagation(); finish(); }
    }

    function drawHalf(h, active, now) {
        const cv = h.cv, W = cv.clientWidth | 0, H = cv.clientHeight | 0;
        if (W < 8 || H < 8) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
        const ctx = cv.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const a = h.arch, t = (now - st.t0) / 1000;
        // Fondo: degradado del color del luchador + rayos de velocidad
        const g = ctx.createRadialGradient(W / 2, H * 0.42, 10, W / 2, H * 0.42, Math.max(W, H) * 0.75);
        g.addColorStop(0, a.secondary); g.addColorStop(0.45, '#0b1020'); g.addColorStop(1, '#02030a');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.save(); ctx.translate(W / 2, H * 0.42);
        ctx.globalAlpha = active ? 0.22 : 0.1; ctx.fillStyle = a.primary;
        const n = 22;
        for (let i = 0; i < n; i++) {
            const ang = (i / n) * Math.PI * 2 + t * 0.15, w = 0.05 + 0.03 * Math.sin(i * 3.1 + t);
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, Math.max(W, H), ang, ang + w); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
        // Primer plano: la cara llena la mitad; el que habla se acerca más (zoom suave)
        const f = h.f; f.animFrame = t * 2.2;
        const bs = a.build ? a.build.s : 1;
        const sinceLine = Math.min(1, (now - st.lineT) / 1400);
        const push = active ? 1 + 0.1 * (1 - Math.pow(1 - sinceLine, 3)) : 0.94;
        const reserve = Math.min(H * 0.4, 96), faceH = H - reserve;      // la cara queda por encima de la burbuja de texto
        const k = Math.min(faceH * 0.021, W * 0.0128) * push / Math.sqrt(bs);
        ctx.save();
        ctx.translate(W / 2 + (f.facing > 0 ? -W * 0.03 : W * 0.03), faceH * 0.5 + 110 * k * bs - 4);
        ctx.scale(f.facing * k * bs, k * bs);
        FighterArt.draw(ctx, f, t);
        ctx.restore();
        // Viñeta y oscurecido del que no habla
        const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.75);
        v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.65)');
        ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
        if (!active) { ctx.fillStyle = 'rgba(2,6,23,0.38)'; ctx.fillRect(0, 0, W, H); }
    }

    function frame(now) {
        raf = requestAnimationFrame(frame);
        if (!st) return;
        const ln = st.list[st.i];
        if (ln) {
            const want = Math.min(ln.text.length, Math.floor((now - st.lineT) / 28));
            if (st.typed < want) st.typed = want;
            const b = st.els[ln.who].querySelector('.sv-text');
            const shown = ln.text.slice(0, st.typed);
            if (b.textContent !== shown) b.textContent = shown;
            st.els[ln.who].querySelector('.sv-bubble').classList.toggle('full', st.typed >= ln.text.length);
        }
        drawHalf(st.hero, !!ln && ln.who === 'hero', now);
        drawHalf(st.rival, !!ln && ln.who === 'rival', now);
    }

    function pollPad() {
        padRaf = requestAnimationFrame(pollPad);
        if (!st) return;
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        let a = false, b = false;
        for (const p of pads) { if (!p) continue; a = a || !!(p.buttons[0] && p.buttons[0].pressed); b = b || !!((p.buttons[1] && p.buttons[1].pressed) || (p.buttons[9] && p.buttons[9].pressed)); }
        const ea = a && !padPrev.a, eb = b && !padPrev.b; padPrev.a = a; padPrev.b = b;
        if (performance.now() - st.t0 < 500) return;
        if (ea) advance();
        if (eb) finish();
    }

    function finish() {
        if (!st || st.ending) return;
        st.ending = true;
        const cb = st.opts.onDone;
        root.classList.add('out');
        setTimeout(() => { cleanup(); if (cb) cb(); }, 260);
    }
    function cleanup() {
        cancelAnimationFrame(raf); cancelAnimationFrame(padRaf); raf = padRaf = 0;
        document.removeEventListener('keydown', onKey, true);
        if (root && root.parentNode) root.parentNode.removeChild(root);
        root = null; st = null;
    }
    function play(opts) {
        if (st) cleanup();
        build(opts);
        raf = requestAnimationFrame(frame);
        padRaf = requestAnimationFrame(pollPad);
    }
    function cancel() { if (st) cleanup(); }
    return { play, cancel, active: () => !!st, _lines: lines };
})();
