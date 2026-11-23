'use strict';
// Música: una pista distinta para el lobby y para cada mapa (secuenciador con Web Audio)
// Cada pista tiene su propio tono, escala, tempo, armonía, melodía, bajo, batería e instrumentos.

const MUSIC_SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], harmMinor: [0, 2, 3, 5, 7, 8, 11],
    dorian: [0, 2, 3, 5, 7, 9, 10], mixo: [0, 2, 4, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10],
    phrygDom: [0, 1, 4, 5, 7, 8, 10], hirajoshi: [0, 2, 3, 7, 8]
};

// Melodías: "grado.duración" en pasos de semicorchea; r = silencio. 4 compases = 64 pasos.
// Baterías (16 pasos): x = golpe, o = abierto (solo en la fila de platillos), . = silencio.
// Bajo: r = fundamental, f = quinta, o = octava; la nota dura hasta el siguiente golpe.
// Arpegio: 0-2 = notas del acorde, 3 = octava de la fundamental.
const MUSIC_TRACKS = {
    // ------- LOBBY: tema de título arcade, alegre y saltarín (Do mayor) -------
    lobby: {
        bpm: 126, swing: 0.07, root: 48, scale: 'major', leadOct: 24, leadWave: 'p25', leadVol: 0.05, gate: 0.8,
        bassWave: 'tri', bassVol: 0.11, bass: 'r..or..or..or.f.',
        arp: { pat: '.0.1.2.1.0.1.2.1', wave: 'sq', vol: 0.016, oct: 36 },
        kit: { low: 'kick', mid: 'snare', hi: 'hat' }, drums: { low: 'x.......x.......', mid: '....x.......x...', hi: '..x...x...x...xo' },
        delay: { beats: 0.75, fb: 0.25, mix: 0.18 },
        A: { prog: [0, 4, 5, 3], lead: '4.2 4.1 5.1 7.2 5.2 4.2 2.2 4.2 r.2 | 6.2 6.1 7.1 8.2 7.2 6.2 4.2 6.2 r.2 | 5.2 7.2 9.2 7.2 5.2 7.2 9.4 | 7.2 5.2 3.2 5.2 7.4 5.2 r.2' },
        B: { prog: [5, 3, 0, 4], lead: '9.4 7.2 5.2 7.4 9.2 7.2 | 7.2 8.2 9.4 7.2 5.2 3.2 r.2 | 11.2 9.2 7.2 4.2 7.2 9.2 11.4 | 11.2 8.2 6.2 8.2 11.4 4.4' }
    },
    // ------- SUZAKU (Santuario Ancestral): escala japonesa, koto y taiko, lento -------
    suzaku: {
        bpm: 78, swing: 0, root: 45, scale: 'minor', leadScale: 'hirajoshi', leadOct: 24, leadWave: 'tri', pluck: true, leadVol: 0.12, gate: 1,
        bassWave: 'sin', bassVol: 0.13, bass: 'r...............',
        pad: { wave: 'sin', vol: 0.03 },
        kit: { low: 'taiko', mid: 'rim', hi: 'hat' }, drums: { low: 'x.......x.x.....', mid: '....x.......x...', hi: '................' },
        delay: { beats: 0.75, fb: 0.4, mix: 0.3 },
        A: { prog: [0, 5, 0, 4], lead: '5.4 3.2 2.2 0.4 r.4 | 4.4 5.4 2.4 r.4 | 3.2 5.2 6.4 5.4 3.4 | 3.4 2.2 3.2 6.8' },
        B: { prog: [5, 4, 0, 4], lead: '5.2 4.2 5.2 7.2 5.8 | 6.2 5.2 3.2 5.2 6.8 | 7.4 6.2 5.2 3.4 2.4 | 3.4 5.4 6.4 r.4' }
    },
    // ------- VOLCÁN: metal en Mi frigio, guitarras sierra y doble bombo -------
    volcano: {
        bpm: 148, swing: 0, root: 40, scale: 'phrygian', leadOct: 24, leadWave: 'saw', det: 9, lp: 3200, leadVol: 0.05, gate: 0.85,
        bassWave: 'saw', bassVol: 0.1, bassLp: 600, bass: 'r.rr.rr.r.rr.rr.', power: true,
        kit: { low: 'kick', mid: 'snare', hi: 'hat' }, drums: { low: 'x.xx..x.x.xx..x.', mid: '....x.......x...', hi: 'x.x.x.x.x.x.x.xo' }, fill: true,
        A: { prog: [0, 0, 1, 0], lead: '7.2 r.1 7.1 9.2 7.2 4.2 r.2 4.4 | 9.2 r.1 9.1 11.2 9.2 7.2 4.2 2.2 r.2 | 8.2 r.1 8.1 10.2 8.2 5.2 3.2 5.2 r.2 | 7.2 4.2 2.2 4.2 7.4 6.2 r.2' },
        B: { prog: [5, 6, 1, 0], lead: '12.4 9.4 7.4 9.4 | 13.4 10.4 8.4 6.4 | 12.2 10.2 8.4 10.4 12.4 | 11.4 9.4 7.4 4.2 7.2' }
    },
    // ------- ECLIPSE: gótico en La menor armónica, órgano/pad y arpegio con eco -------
    eclipse: {
        bpm: 96, swing: 0, root: 45, scale: 'harmMinor', leadOct: 24, leadWave: 'p12', leadVol: 0.05, gate: 0.95, vib: true,
        bassWave: 'tri', bassVol: 0.13, bass: 'r.......r.....f.',
        arp: { pat: '0123210301232103', wave: 'tri', vol: 0.04, oct: 36 },
        pad: { wave: 'saw', vol: 0.02, lp: 900 },
        kit: { low: 'kick', mid: 'snare', hi: 'shaker' }, drums: { low: 'x..........x....', mid: '........x.......', hi: '..x...x...x...x.' },
        delay: { beats: 0.75, fb: 0.5, mix: 0.35 },
        A: { prog: [0, 5, 3, 4], lead: '7.6 9.2 8.4 r.4 | 9.4 7.4 5.4 r.4 | 5.6 3.2 5.4 7.4 | 6.4 8.4 6.4 4.4' },
        B: { prog: [3, 4, 0, 0], lead: '7.4 5.4 3.4 5.4 | 8.4 6.4 4.4 6.4 | 7.8 9.4 7.4 | 7.4 4.4 2.4 0.4' }
    },
    // ------- CYBER: synthwave en Mi menor, bombo a negras, bajo a corcheas y arpegio rápido -------
    cyber: {
        bpm: 132, swing: 0, root: 40, scale: 'minor', leadOct: 24, leadWave: 'saw', det: 12, lp: 2600, leadVol: 0.045, gate: 0.9,
        bassWave: 'saw', bassVol: 0.09, bassLp: 700, bass: '.r.r.r.r.r.r.r.r',
        arp: { pat: '0120210301202103', wave: 'sq', vol: 0.02, oct: 36 },
        kit: { low: 'kick', mid: 'clap', hi: 'hat' }, drums: { low: 'x...x...x...x...', mid: '....x.......x...', hi: '..o...o...o...o.' },
        delay: { beats: 0.75, fb: 0.35, mix: 0.25 },
        A: { prog: [0, 5, 2, 6], lead: '7.3 r.1 4.2 7.2 9.4 r.4 | 12.3 r.1 9.2 7.2 9.4 r.4 | 9.3 r.1 6.2 4.2 6.4 r.4 | 10.3 r.1 8.2 6.2 8.4 r.4' },
        B: { prog: [5, 6, 0, 4], lead: '12.2 11.2 9.2 7.2 9.2 11.2 12.4 | 10.2 8.2 6.2 8.2 10.2 13.2 10.4 | 7.2 9.2 11.2 9.2 7.2 4.2 7.4 | 11.4 8.4 6.4 4.4' }
    },
    // ------- LABORATORIO: funk raro en Re dórico, notas cortas y bajo sincopado -------
    lab: {
        bpm: 116, swing: 0.1, root: 38, scale: 'dorian', leadOct: 24, leadWave: 'p12', leadVol: 0.055, gate: 0.45,
        bassWave: 'sq', bassVol: 0.08, bassLp: 900, bass: 'r..r..o.r.f..r.o',
        arp: { pat: '.1.2.1.0.2.1.0.2', wave: 'p25', vol: 0.014, oct: 36 },
        kit: { low: 'kick', mid: 'clap', hi: 'shaker' }, drums: { low: 'x..x......x.x...', mid: '....x.......x..x', hi: 'x.xxx.xxx.xxx.xx' },
        A: { prog: [0, 3, 0, 4], lead: '7.1 r.1 9.1 r.1 11.1 r.1 9.1 r.1 7.2 4.2 7.2 r.2 | 10.1 r.1 12.1 r.1 10.1 r.1 8.1 r.1 5.2 8.2 10.2 r.2 | 7.1 r.1 9.1 r.1 11.1 r.1 9.1 r.1 7.2 4.2 7.2 r.2 | 11.1 r.1 13.1 r.1 11.1 r.1 8.1 r.1 6.2 4.2 6.2 r.2' },
        B: { prog: [3, 4, 0, 0], lead: '10.2 8.2 5.2 8.2 10.4 r.4 | 11.2 8.2 6.2 8.2 11.4 r.4 | 9.2 7.2 4.2 7.2 9.2 11.2 9.4 | 7.4 4.4 2.4 r.4' }
    },
    // ------- ESMERALDA: aventura en Sol mixolidio, melodía heroica y ritmo de selva -------
    emerald: {
        bpm: 138, swing: 0.14, root: 43, scale: 'mixo', leadOct: 24, leadWave: 'p25', leadVol: 0.055, gate: 0.85,
        bassWave: 'tri', bassVol: 0.13, bass: 'r..f..r.o..f.r.f',
        arp: { pat: '................', wave: 'sq', vol: 0 },
        kit: { low: 'taiko', mid: 'snare', hi: 'shaker' }, drums: { low: 'x..x..x...x.x...', mid: '....x.......x.x.', hi: 'x.xxx.xxx.xxx.xx' }, fill: true,
        A: { prog: [0, 6, 3, 0], lead: '4.3 4.1 7.2 4.2 2.2 4.2 r.2 0.2 | 6.3 6.1 8.2 10.2 8.2 6.2 5.2 6.2 | 10.3 10.1 9.2 7.2 5.2 7.2 9.4 | 11.4 9.2 7.2 4.4 r.4' },
        B: { prog: [3, 0, 6, 4], lead: '7.2 9.2 10.4 9.2 7.2 5.2 3.2 | 11.2 9.2 7.4 9.2 11.2 7.4 | 10.4 8.4 6.4 8.4 | 11.4 8.4 6.4 4.4' }
    },
    // ------- SÍSMICO: industrial pesado en Re frigio, zumbido grave y pisadas -------
    seismic: {
        bpm: 90, swing: 0, root: 38, scale: 'phrygian', leadOct: 12, leadWave: 'saw', lp: 1200, leadVol: 0.07, gate: 1,
        bassWave: 'saw', bassVol: 0.12, bassLp: 260, bassOct: -12, bass: 'r...............',
        pad: { wave: 'saw', vol: 0.018, lp: 500 }, rumble: true,
        kit: { low: 'stomp', mid: 'clank', hi: 'hat' }, drums: { low: 'x.......x.x.....', mid: '........x.......', hi: '................' },
        A: { prog: [0, 0, 1, 0], lead: '0.6 r.2 2.4 0.4 | 4.6 r.2 2.4 0.4 | 1.6 r.2 3.4 1.4 | 0.4 2.4 4.4 2.4' },
        B: { prog: [0, 5, 1, 0], lead: '7.6 r.2 4.4 2.4 | 5.6 r.2 7.4 9.4 | 8.6 r.2 5.4 3.4 | 0.8 r.8' }
    },
    // ------- TÓXICO: turbio en Do# frigio dominante, bajo con wobble y ritmo oscilante -------
    toxic: {
        bpm: 108, swing: 0.18, root: 37, scale: 'phrygDom', leadOct: 24, leadWave: 'sq', lp: 2200, leadVol: 0.04, gate: 0.7,
        bassWave: 'saw', bassVol: 0.1, bassOct: 0, wob: 4.5, bass: 'r.rr..r.r..rr.o.',
        arp: { pat: '.0..1..2..1..0..', wave: 'p12', vol: 0.02, oct: 36 },
        kit: { low: 'kick', mid: 'snare', hi: 'hat' }, drums: { low: 'x.....x...x.x...', mid: '....x.......x...', hi: 'x.x.x.x.x.x.x.xo' },
        delay: { beats: 0.75, fb: 0.3, mix: 0.2 },
        A: { prog: [0, 1, 0, 6], lead: '4.2 2.2 0.2 2.2 4.2 7.2 4.4 | 5.2 3.2 1.2 3.2 5.2 8.2 5.4 | 7.3 r.1 4.2 2.2 4.4 r.4 | 6.2 8.2 10.2 8.2 6.4 r.4' },
        B: { prog: [0, 1, 6, 0], lead: '7.4 4.2 2.2 0.4 2.4 | 8.4 5.2 3.2 1.4 3.4 | 10.4 8.2 6.2 8.4 10.4 | 7.2 4.2 2.2 4.2 7.8' }
    }
};

// Convierte el texto de la melodía en eventos por paso
function parseMusicLead(str) {
    const ev = new Array(64).fill(null);
    let pos = 0;
    str.replace(/\|/g, ' ').trim().split(/\s+/).forEach(tok => {
        const [d, l] = tok.split('.');
        const len = parseInt(l, 10) || 1;
        if (pos < 64 && d !== 'r') ev[pos] = { deg: parseInt(d, 10), len };
        pos += len;
    });
    if (pos !== 64) console.warn('Melodía con', pos, 'pasos en vez de 64');
    return ev;
}
// Volumen de cada pista (igualadas para que ninguna tape los efectos de golpes)
const MUSIC_TRIM = { lobby: 0.58, suzaku: 0.37, volcano: 0.44, eclipse: 0.5, cyber: 0.61, lab: 0.56, emerald: 0.39, seismic: 0.48, toxic: 0.59 };
Object.keys(MUSIC_TRACKS).forEach(k => { MUSIC_TRACKS[k].trim = MUSIC_TRIM[k] || 0.5; });
Object.values(MUSIC_TRACKS).forEach(t => { t.A.ev = parseMusicLead(t.A.lead); t.B.ev = parseMusicLead(t.B.lead); });

const musicSemi = (scale, deg) => {
    const s = MUSIC_SCALES[scale], n = s.length;
    return s[((deg % n) + n) % n] + 12 * Math.floor(deg / n);
};
const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Reproductor: programa las notas con antelación usando el reloj de audio (tempo estable)
class MusicPlayer {
    constructor(engine, trackId, isArena) {
        this.eng = engine;
        this.T = MUSIC_TRACKS[trackId] || MUSIC_TRACKS.suzaku;
        this.isArena = isArena;
        this.n = 0;
        this.timer = null;
    }

    start() {
        const ctx = this.eng.ctx, T = this.T;
        this.bus = ctx.createGain();
        this.bus.gain.setValueAtTime(0.0001, ctx.currentTime);
        this.bus.gain.linearRampToValueAtTime(T.trim, ctx.currentTime + 0.08);
        const out = this.eng._musicOut();
        this.bus.connect(out);
        if (T.delay) {
            const beat = 60 / T.bpm;
            const d = ctx.createDelay(2); d.delayTime.value = beat * T.delay.beats;
            const fb = ctx.createGain(); fb.gain.value = T.delay.fb;
            const wet = ctx.createGain(); wet.gain.value = T.delay.mix;
            this.bus.connect(d); d.connect(fb); fb.connect(d); d.connect(wet); wet.connect(out);
            this.fx = [d, fb, wet];
        }
        this.nextTime = ctx.currentTime + 0.06;
        this.timer = setInterval(() => this.tick(), 60);
        this.tick();
    }

    stop() {
        if (this.timer) { clearInterval(this.timer); this.timer = null; }
        const ctx = this.eng.ctx;
        if (!ctx || !this.bus) return;
        const bus = this.bus, fx = this.fx || [];
        try {
            bus.gain.cancelScheduledValues(ctx.currentTime);
            bus.gain.setValueAtTime(bus.gain.value, ctx.currentTime);
            bus.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
        } catch (e) { /* ignorar */ }
        setTimeout(() => { try { bus.disconnect(); fx.forEach(n => n.disconnect()); } catch (e) { /* ignorar */ } }, 600);
        this.bus = null;
    }

    intense() { return this.isArena && this.eng.intensity > 0; }

    stepDur(n) {
        const T = this.T, base = 60 / (T.bpm * (this.intense() ? 1.1 : 1)) / 4;
        return n % 2 === 0 ? base * (1 + T.swing) : base * (1 - T.swing);
    }

    tick() {
        const ctx = this.eng.ctx;
        if (!ctx || !this.eng.enabled || !this.bus) return;
        const now = ctx.currentTime;
        if (this.nextTime < now - 0.05) this.nextTime = now + 0.03;
        while (this.nextTime < now + 0.35) {
            this.step(this.n, this.nextTime);
            this.nextTime += this.stepDur(this.n);
            this.n++;
        }
    }

    // Test/render sin conexión: programa hasta cierto segundo
    renderTo(seconds) {
        while (this.nextTime < seconds) {
            this.step(this.n, this.nextTime);
            this.nextTime += this.stepDur(this.n);
            this.n++;
        }
    }

    step(n, t) {
        const T = this.T, e = this.eng, bus = this.bus;
        const sib = n % 16, barG = Math.floor(n / 16);
        const sec = Math.floor(barG / 4) % 2 === 0 ? T.A : T.B, bar = barG % 4;
        const cr = sec.prog[bar], inten = this.intense();
        const base = 60 / (T.bpm * (inten ? 1.1 : 1)) / 4;
        const semi = (deg) => musicSemi(T.scale, deg);

        // Batería
        const lane = (k) => (T.drums[k] || '')[sib];
        let low = lane('low') === 'x', mid = lane('mid') === 'x', hi = lane('hi');
        if (inten) { if (sib % 4 === 0) low = true; if (sib % 2 === 0 && !hi) hi = 'x'; }
        if (T.fill && bar === 3 && sib >= 12) mid = true;
        if (low) e._drum(T.kit.low, t, bus);
        if (mid) e._drum(T.kit.mid, t, bus);
        if (hi === 'x' || hi === 'o') e._drum(hi === 'o' ? 'open' : T.kit.hi, t, bus);

        // Bajo (la nota dura hasta el siguiente golpe)
        const bp = sec.bass || T.bass, ch = bp[sib];
        if (ch && ch !== '.') {
            let len = 1;
            while (sib + len < 16 && bp[sib + len] === '.') len++;
            const m = T.root + (T.bassOct || 0) + semi(cr) + (ch === 'f' ? 7 : ch === 'o' ? 12 : 0);
            const o = { w: T.bassWave, lp: T.bassLp, atk: 0.005, dec: 0.12, sus: 0.7, wob: T.wob };
            e._note(t, midiHz(m), len * base * 0.95, T.bassVol, o, bus);
            if (T.power) e._note(t, midiHz(m + 7), len * base * 0.9, T.bassVol * 0.6, o, bus);
        }

        // Pad
        if (T.pad && sib === 0) {
            for (let k = 0; k < 3; k++) {
                e._note(t, midiHz(T.root + 12 + semi(cr + 2 * k)), 16 * base * 1.02, T.pad.vol,
                    { w: T.pad.wave, lp: T.pad.lp, atk: 0.35, dec: 0, sus: 1, rel: 0.5, det: 6 }, bus);
            }
        }

        // Arpegio
        if (T.arp && T.arp.vol > 0) {
            const d = T.arp.pat[sib];
            if (d && d !== '.') {
                const i = parseInt(d, 10);
                const m = T.root + T.arp.oct + (i < 3 ? semi(cr + 2 * i) : semi(cr) + 12);
                e._note(t, midiHz(m), base * 1.4, T.arp.vol * (inten ? 1.25 : 1), { w: T.arp.wave, atk: 0.003, dec: 0.1, sus: 0.2 }, bus);
            }
        }

        // Melodía
        const ev = sec.ev[bar * 16 + sib];
        if (ev) {
            const m = T.root + T.leadOct + musicSemi(T.leadScale || T.scale, ev.deg);
            const dur = Math.max(base * 0.8, ev.len * base * T.gate);
            const o = { w: T.leadWave, lp: T.lp, det: T.det, atk: 0.006, dec: T.pluck ? 0.45 : 0.18, sus: T.pluck ? 0.02 : 0.75, vib: T.vib };
            e._note(t, midiHz(m), dur, T.leadVol, o, bus);
            if (inten) e._note(t, midiHz(m + 12), dur, T.leadVol * 0.4, { ...o, det: 0 }, bus);
        }
    }
}
