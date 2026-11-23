'use strict';
// Motor de audio sintetizado (efectos y música chiptune)

// =========================================================================
// 3. MOTOR AUDIO SINTETIZADO CON TEMAS CHIPTUNE POR MAPA Y LOBBY
// =========================================================================
class ArcadeSoundEngine {
    constructor() {
        this.enabled = true;
        this.ctx = null;
        this.lobbyPlayer = null;
        this.arenaPlayer = null;
        this.intensity = 0;
        this.currentArenaId = null;
    }

    init() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) this.ctx = new AudioCtx();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    // Buses de volumen: general → (música | efectos) → salida
    _buses() {
        if (this._busCtx === this.ctx && this._bus) return this._bus;
        const ctx = this.ctx;
        const master = ctx.createGain(); master.connect(ctx.destination);
        const music = ctx.createGain(); music.connect(master);
        const fx = ctx.createGain(); fx.connect(master);
        this._bus = { master, music, fx }; this._busCtx = ctx;
        this.applyVolumes();
        return this._bus;
    }
    applyVolumes() {
        if (!this.ctx || !this._bus || this._busCtx !== this.ctx) return;
        const v = (k) => Math.pow(Settings.get('snd', k) / 100, 1.6);   // curva suave: se nota en todo el recorrido
        const t = this.ctx.currentTime;
        this._bus.master.gain.setTargetAtTime(v('master'), t, 0.02);
        this._bus.music.gain.setTargetAtTime(v('music'), t, 0.02);
        this._bus.fx.gain.setTargetAtTime(v('sfx'), t, 0.02);
    }

    toggle() {
        this.enabled = !this.enabled;
        if (!this.enabled) {
            this.stopLobbyMusic();
            this.stopAmbientSound();
        } else if (document.getElementById('screen-game').classList.contains('hidden')) {
            this.startLobbyMusic();
        } else if (this.currentArenaId) {
            this.startAmbientSound(this.currentArenaId);
        }
        return this.enabled;
    }

    playTone(freq, endFreq, duration, type = 'square', gainVal = 0.12) {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
        gain.gain.setValueAtTime(gainVal, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        osc.connect(gain);
        gain.connect(this._buses().fx);
        osc.start(now);
        osc.stop(now + duration);
    }

    playNoise(duration = 0.15, gainVal = 0.18) {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        noise.connect(gain);
        gain.connect(this._buses().fx);
        noise.start();
    }

    // MÚSICA: cada mapa y el lobby tienen su propia pista (ver musica.js)
    startLobbyMusic() {
        if (!this.enabled || this.lobbyPlayer) return;
        this.init();
        if (!this.ctx) return;
        this.lobbyPlayer = new MusicPlayer(this, 'lobby', false);
        this.lobbyPlayer.start();
    }

    stopLobbyMusic() {
        if (this.lobbyPlayer) { this.lobbyPlayer.stop(); this.lobbyPlayer = null; }
    }

    startAmbientSound(arenaId) {
        this.currentArenaId = arenaId;
        this.stopAmbientSound();
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        this.intensity = 0;
        this.arenaPlayer = new MusicPlayer(this, arenaId, true);
        this.arenaPlayer.start();
    }

    // En el clímax la música sube de tempo y suma bombo, platillos y melodía en octava
    setIntensity(level) { this.intensity = level; }

    stopAmbientSound() {
        if (this.arenaPlayer) { this.arenaPlayer.stop(); this.arenaPlayer = null; }
    }

    _musicOut() {
        if (this._mOut && this._mOutCtx === this.ctx) return this._mOut;
        const ctx = this.ctx;
        const g = ctx.createGain(); g.gain.value = 0.8;
        const c = ctx.createDynamicsCompressor();
        c.threshold.value = -16; c.ratio.value = 4; c.attack.value = 0.005; c.release.value = 0.12;
        g.connect(c); c.connect(this._buses().music);
        this._mOut = g; this._mOutCtx = ctx;
        return g;
    }

    _noiseBuf() {
        if (this._nb && this._nbCtx === this.ctx) return this._nb;
        const ctx = this.ctx, n = ctx.sampleRate;
        const buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
        this._nb = buf; this._nbCtx = ctx;
        return buf;
    }

    _wave(id) {
        if (!this._waves || this._wavesCtx !== this.ctx) { this._waves = {}; this._wavesCtx = this.ctx; }
        if (this._waves[id]) return this._waves[id];
        const duty = id === 'p12' ? 0.125 : 0.25, N = 48;
        const re = new Float32Array(N), im = new Float32Array(N);
        for (let k = 1; k < N; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
        return (this._waves[id] = this.ctx.createPeriodicWave(re, im));
    }

    // Nota de sintetizador con envolvente, filtro, desafinación, vibrato y wobble opcionales
    _note(t, freq, dur, vol, o, bus) {
        const ctx = this.ctx;
        const atk = o.atk ?? 0.005, sus = o.sus ?? 1, rel = o.rel ?? 0.04;
        let dec = Math.min(o.dec ?? 0, Math.max(0, dur - atk));
        const g = ctx.createGain();
        const end = t + dur + rel + 0.03;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol, t + atk);
        let level = vol;
        if (dec > 0.001 && sus < 1) { level = Math.max(0.0002, vol * sus); g.gain.exponentialRampToValueAtTime(level, t + atk + dec); }
        g.gain.setValueAtTime(level, t + dur);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + rel);
        g.connect(bus);
        let head = g;
        const extra = [];
        if (o.lp || o.wob) {
            const f = ctx.createBiquadFilter();
            f.type = 'lowpass'; f.frequency.value = o.lp || 650; f.Q.value = o.wob ? 5 : 0.8;
            f.connect(g); head = f;
            if (o.wob) {
                const l = ctx.createOscillator(), lg = ctx.createGain();
                l.frequency.value = o.wob; lg.gain.value = 420;
                l.connect(lg); lg.connect(f.frequency); l.start(t); l.stop(end); extra.push(l);
            }
        }
        const mk = (det) => {
            const osc = ctx.createOscillator();
            if (o.w === 'p12' || o.w === 'p25') osc.setPeriodicWave(this._wave(o.w));
            else osc.type = { sq: 'square', tri: 'triangle', saw: 'sawtooth', sin: 'sine' }[o.w] || 'square';
            osc.frequency.setValueAtTime(freq, t);
            if (det) osc.detune.value = det;
            if (o.vib && dur > 0.25) {
                const l = ctx.createOscillator(), lg = ctx.createGain();
                l.frequency.value = 5.5; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(14, t + 0.25);
                l.connect(lg); lg.connect(osc.detune); l.start(t); l.stop(end);
            }
            osc.connect(head); osc.start(t); osc.stop(end);
        };
        if (o.det) { mk(-o.det); mk(o.det); } else mk(0);
    }

    // Batería sintetizada
    _drum(kind, t, bus) {
        const ctx = this.ctx;
        const env = (vol, dur) => {
            const g = ctx.createGain();
            g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            g.connect(bus); return g;
        };
        const tone = (f0, f1, dur, vol, type = 'sine') => {
            const o = ctx.createOscillator(); o.type = type;
            o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
            o.connect(env(vol, dur)); o.start(t); o.stop(t + dur + 0.02);
        };
        const noise = (ftype, f, q, dur, vol, off = 0) => {
            const s = ctx.createBufferSource(); s.buffer = this._noiseBuf();
            const fl = ctx.createBiquadFilter(); fl.type = ftype; fl.frequency.value = f; fl.Q.value = q;
            const g = ctx.createGain();
            g.gain.setValueAtTime(vol, t + off); g.gain.exponentialRampToValueAtTime(0.0001, t + off + dur);
            s.connect(fl); fl.connect(g); g.connect(bus);
            s.start(t + off, Math.random() * 0.5, dur + 0.02);
        };
        switch (kind) {
            case 'kick': tone(150, 42, 0.2, 0.3); noise('lowpass', 900, 0.7, 0.02, 0.05); break;
            case 'taiko': tone(110, 58, 0.4, 0.32); noise('lowpass', 500, 1, 0.06, 0.1); break;
            case 'stomp': tone(75, 28, 0.5, 0.38); noise('lowpass', 300, 1, 0.25, 0.15); break;
            case 'snare': noise('bandpass', 1900, 0.9, 0.15, 0.17); tone(210, 120, 0.09, 0.1, 'triangle'); break;
            case 'clap': [0, 0.011, 0.022].forEach(o => noise('bandpass', 1300, 1.2, 0.03, 0.13, o)); noise('bandpass', 1300, 1.2, 0.14, 0.1, 0.03); break;
            case 'rim': tone(1750, 1100, 0.04, 0.08, 'square'); noise('highpass', 3000, 0.7, 0.02, 0.04); break;
            case 'clank': noise('bandpass', 4200, 2.5, 0.28, 0.16); tone(180, 90, 0.2, 0.08, 'sawtooth'); break;
            case 'hat': noise('highpass', 7500, 0.8, 0.035, 0.08); break;
            case 'open': noise('highpass', 7000, 0.8, 0.15, 0.07); break;
            case 'shaker': noise('bandpass', 6200, 1.5, 0.06, 0.06); break;
        }
    }

    playNoiseF(duration, gainVal, ftype, f0, f1, q = 1) {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const n = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
        const buffer = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        const filt = this.ctx.createBiquadFilter();
        filt.type = ftype;
        filt.frequency.setValueAtTime(f0, now);
        if (f1) filt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + duration);
        filt.Q.value = q;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(gainVal, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        src.connect(filt); filt.connect(gain); gain.connect(this._buses().fx);
        src.start(now);
    }
    later(ms, fn) { setTimeout(fn, ms); }
    throttle(key, ms) {
        const now = performance.now();
        this._th = this._th || {};
        if (this._th[key] && now - this._th[key] < ms) return false;
        this._th[key] = now;
        return true;
    }
    prof(id) { return SFX_PROFILES[id] || SFX_PROFILES.ronin; }

    // SONIDOS POR PERSONAJE
    charSwing(id, kind) {
        if (!this.throttle('sw' + id + kind, 50)) return;
        const p = this.prof(id);
        const mdk = MOVE_DATA[kind];
        const cat = kind === 'launcher' ? 'launcher' : (kind === 'grab' ? 'grab' : ((mdk && mdk.cat) || (kind === 'kick' ? 'kick' : 'punch')));
        const rank = (mdk && mdk.rank) || 2;
        const base = ({ punch: 1, kick: 0.75, launcher: 1.1, grab: 0.6 }[cat] || 1) * (1.25 - rank * 0.12);
        this.playNoiseF((cat === 'kick' ? 0.16 : 0.1) * (0.8 + rank * 0.15), 0.09 + rank * 0.03, 'bandpass', 1800 * p.pitch * base, 600 * p.pitch, 1.5);
        if (rank === 3 && cat !== 'launcher') this.playTone(150 * p.pitch, 70 * p.pitch, 0.12, 'triangle', 0.06);
        if (kind === 'launcher') this.playTone(200 * p.pitch, 950 * p.pitch, 0.22, p.wave, 0.12);
    }
    charHit(id, kind) {
        if (!this.throttle('hit', 35)) return;
        const p = this.prof(id);
        const heavy = kind === 'heavy' || kind === 'super';
        if (kind === 'chip') { this.playTone(900, 600, 0.05, 'square', 0.05); return; }
        this.playNoiseF(heavy ? 0.22 : 0.1, heavy ? 0.26 : 0.18, 'lowpass', heavy ? 2400 : 3200, 300);
        this.playTone((heavy ? 120 : 190) * p.pitch, 45, heavy ? 0.22 : 0.1, p.wave === 'sine' ? 'triangle' : p.wave, heavy ? 0.2 : 0.14);
        if (p.ping) this.playTone(p.ping, p.ping * 0.7, 0.08, 'square', 0.05);
        if (kind === 'super') this.later(60, () => this.playNoiseF(0.4, 0.2, 'lowpass', 900, 120));
    }
    charCharge(id) {
        const p = this.prof(id);
        this.playTone(240 * p.pitch, 560 * p.pitch, 0.2, 'triangle', 0.07);
    }
    charSpecial(id, isSuper) {
        const p = this.prof(id), m = isSuper ? 0.75 : 1, g = isSuper ? 1.4 : 1;
        switch (p.special) {
            case 'wave': this.playTone(320 * m, 880 * m, 0.14, 'sawtooth', 0.12 * g); this.later(70, () => this.playTone(640 * m, 190 * m, 0.28, 'sine', 0.15 * g)); break;
            case 'fire': this.playNoiseF(0.45, 0.25 * g, 'lowpass', 1600, 300); this.playTone(180 * m, 80 * m, 0.35, 'sawtooth', 0.1 * g); break;
            case 'zap': for (let i = 0; i < 5; i++) this.later(i * 35, () => this.playTone(900 + Math.random() * 900, 300, 0.05, 'square', 0.08 * g)); this.playNoiseF(0.2, 0.12 * g, 'highpass', 3000, 6000); break;
            case 'dark': this.playTone(330 * m, 70 * m, 0.5, 'sawtooth', 0.08 * g); this.playTone(338 * m, 72 * m, 0.5, 'sawtooth', 0.08 * g); this.playTone(110 * m, 55 * m, 0.5, 'triangle', 0.12 * g); break;
            case 'laser': this.playTone(2200 * m, 180 * m, 0.26, 'square', 0.09 * g); this.later(40, () => this.playTone(1600 * m, 120 * m, 0.2, 'sawtooth', 0.06 * g)); break;
            case 'wind': this.playNoiseF(0.5, 0.28 * g, 'bandpass', 400, 2600, 3); this.later(120, () => this.playNoiseF(0.35, 0.18 * g, 'bandpass', 2600, 700, 3)); break;
            case 'rock': this.playNoiseF(0.3, 0.3 * g, 'lowpass', 500, 120); this.playTone(95 * m, 38 * m, 0.35, 'sine', 0.25 * g); break;
            case 'acid': for (let i = 0; i < 6; i++) this.later(i * 45, () => { const f0 = 300 + Math.random() * 500; this.playTone(f0, f0 * 1.8, 0.06, 'sine', 0.1 * g); }); this.playNoiseF(0.3, 0.08 * g, 'bandpass', 900, 500, 2); break;
        }
        if (isSuper) {
            this.playTone(220, 1200, 0.4, 'sawtooth', 0.1);
            this.later(160, () => { [261.63, 329.63, 392].forEach(f => this.playTone(f * p.pitch, f * p.pitch, 0.35, 'square', 0.04)); });
        }
    }
    named(n, a) {
        switch (n) {
            case 'hit': {
                if (a === 'hazard') { this.charHit('titan', 'medium'); break; }
                const [id, kind] = String(a || 'ronin:light').split(':');
                this.charHit(id, kind);
                break;
            }
            case 'block': this.sfxBlock(); break;
            case 'guard': this.sfxGuardBreak(); break;
            case 'juggle': this.sfxJuggleHit(); break;
            case 'ko': this.sfxKO(); break;
            case 'clash': this.sfxClash(); break;
            case 'grab': this.playNoiseF(0.08, 0.2, 'lowpass', 900, 200); this.playTone(160, 90, 0.1, 'square', 0.1); break;
            case 'throw': this.playNoiseF(0.3, 0.2, 'bandpass', 1500, 300, 2); break;
            case 'thud': if (this.throttle('thud', 60)) { this.playNoiseF(0.18, 0.25, 'lowpass', 400, 80); this.playTone(70, 40, 0.2, 'sine', 0.2); } break;
            case 'roll': this.playNoiseF(0.18, 0.1, 'bandpass', 900, 2000, 2); break;
            case 'boom': this.playNoiseF(0.6, 0.3, 'lowpass', 1200, 60); this.playTone(80, 30, 0.5, 'sine', 0.25); break;
            case 'tremor': this.playNoiseF(0.9, 0.18, 'lowpass', 200, 50); this.playTone(55, 35, 0.8, 'sawtooth', 0.08); break;
            case 'meteor': this.playTone(900, 120, 0.8, 'sawtooth', 0.05); break;
            case 'zap': this.charSpecial('storm', false); break;
            case 'wind': this.charSpecial('zephyra', false); break;
            case 'dark': this.charSpecial('vixen', false); break;
            case 'acid': this.charSpecial('viper', false); break;
        }
    }

    sfxSelect() { this.playTone(520, 780, 0.08, 'square', 0.08); }
    sfxPunch() { this.playNoise(0.08, 0.14); this.playTone(180, 60, 0.09, 'triangle', 0.15); }
    sfxKick() { this.playNoise(0.12, 0.18); this.playTone(140, 45, 0.13, 'sawtooth', 0.16); }
    sfxLauncher() { this.playTone(200, 950, 0.22, 'sawtooth', 0.18); this.playNoise(0.15, 0.2); }
    sfxJuggleHit() { this.playTone(600, 1100, 0.1, 'square', 0.14); this.playNoise(0.08, 0.15); }
    sfxBlock() { this.playTone(850, 420, 0.09, 'square', 0.1); }
    sfxGuardBreak() { this.playNoise(0.25, 0.25); this.playTone(150, 40, 0.3, 'sawtooth', 0.2); }
    sfxHadouken() {
        this.playTone(320, 880, 0.14, 'sawtooth', 0.14);
        setTimeout(() => this.playTone(640, 190, 0.25, 'sine', 0.16), 70);
    }
    sfxSuper() {
        this.playTone(220, 1200, 0.35, 'sawtooth', 0.18);
        this.playNoise(0.28, 0.2);
    }
    sfxClash() {
        this.playNoise(0.22, 0.25);
        this.playTone(400, 90, 0.22, 'square', 0.18);
    }
    sfxKO() {
        this.playNoise(0.4, 0.28);
        this.playTone(240, 55, 0.55, 'sawtooth', 0.22);
    }
    sfxFight() {
        this.playTone(440, 440, 0.1, 'square', 0.12);
        setTimeout(() => this.playTone(554, 554, 0.1, 'square', 0.12), 110);
        setTimeout(() => this.playTone(659, 880, 0.28, 'square', 0.15), 220);
    }
}
const sfx = new ArcadeSoundEngine();
