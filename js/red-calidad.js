'use strict';
// =====================================================================
// CALIDAD DE RED: servidores ICE (STUN/TURN), ping, fluctuación, pérdida y el indicador de la partida
// =====================================================================

// URL del Worker de Cloudflare que entrega credenciales TURN temporales (ver tools/cloudflare-turn-worker.js).
// Vacía = se usan solo los STUN de abajo + el TURN público compartido que ya trae PeerJS.
const NET_TURN_URL = '';
const NET_STUN = [
    { urls: ['stun:stun.cloudflare.com:3478'] },
    { urls: ['stun:stun.l.google.com:19302'] }
];
// TURN público de PeerJS (compartido, EU/EE. UU.): queda como último recurso
const NET_PEERJS_TURN = { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' };

const NET_PING_MS = 1000;          // cada cuánto mide el anfitrión el ping de cada invitado
const NET_INTERP_MS = 70;          // colchón de interpolación de los rivales (≈ 2 snapshots a 30 Hz)
const NET_MAX_REWIND = 15;         // cuadros máx. que se retrocede para compensar el lag (0,25 s)
const NET_PLAYABLE_MS = 150;       // por encima, el indicador avisa

const NetQuality = {
    iceServers: [...NET_STUN, NET_PEERJS_TURN],
    iceAt: 0,
    rtt: 0,            // invitado: su ping medido por el anfitrión (suavizado)
    jitter: 0,
    loss: 0,           // % de snapshots perdidos (invitado)
    peerRtt: {},       // anfitrión: ping por invitado
    peerJitter: {},
    _seqSeen: 0, _seqGaps: 0,
    _timer: 0, _warned: false,

    // Credenciales TURN propias (si hay Worker); si falla, sigue con los STUN y el TURN de PeerJS
    async loadIce() {
        if (!NET_TURN_URL || (this.iceAt && Date.now() - this.iceAt < 20 * 60 * 1000)) return this.iceServers;
        try {
            const ctl = new AbortController();
            const to = setTimeout(() => ctl.abort(), 3500);
            const r = await fetch(NET_TURN_URL, { signal: ctl.signal, cache: 'no-store' });
            clearTimeout(to);
            const data = await r.json();
            const own = (data.iceServers || []).map(s => ({ ...s, urls: [].concat(s.urls || []).filter(u => !/:53(\?|$)/.test(u)) })).filter(s => s.urls.length);
            if (own.length) { this.iceServers = [...own, ...NET_STUN, NET_PEERJS_TURN]; this.iceAt = Date.now(); }
        } catch (e) { /* sin Worker: se usa lo que hay */ }
        return this.iceServers;
    },
    peerOptions() { return { config: { iceServers: this.iceServers, sdpSemantics: 'unified-plan' } }; },

    // ---- medición
    // Anfitrión: llega el PONG de un invitado
    onPong(peerId, t0) {
        const ms = Math.max(1, performance.now() - t0);
        const prev = this.peerRtt[peerId];
        this.peerRtt[peerId] = prev === undefined ? ms : prev * 0.7 + ms * 0.3;
        this.peerJitter[peerId] = (this.peerJitter[peerId] || 0) * 0.7 + Math.abs(ms - (prev === undefined ? ms : prev)) * 0.3;
    },
    // Invitado: el anfitrión le dice cómo mide su ping
    onPing(r, j) { if (r > 0) { this.rtt = r; this.jitter = j || 0; } },
    // Invitado: cuenta huecos en la secuencia de snapshots
    onSeq(seq) {
        if (this._lastSeq !== undefined && seq > this._lastSeq + 1) this._seqGaps += seq - this._lastSeq - 1;
        this._seqSeen++;
        this._lastSeq = seq;
        if (this._seqSeen >= 100) { this.loss = Math.round(100 * this._seqGaps / (this._seqSeen + this._seqGaps)); this._seqSeen = 0; this._seqGaps = 0; }
    },
    reset() { this._warned = false; this.pingTable = {}; this.rtt = 0; this.jitter = 0; this.loss = 0; this.peerRtt = {}; this.peerJitter = {}; this._lastSeq = undefined; this._seqSeen = 0; this._seqGaps = 0; },

    // Cuadros (1/60 s) que el anfitrión retrocede las posiciones para un golpe de ese invitado
    rewindFrames(peerId) {
        const r = this.peerRtt[peerId];
        if (!r) return 0;
        return Math.min(NET_MAX_REWIND, Math.round((r + NET_INTERP_MS) / (1000 / 60)));
    },
    // Ping más alto entre los invitados (anfitrión) o el propio (invitado)
    shownPing(isHost) {
        if (!isHost) return { ms: this.rtt, jit: this.jitter, loss: this.loss };
        let ms = 0, jit = 0;
        for (const k in this.peerRtt) { if (this.peerRtt[k] > ms) { ms = this.peerRtt[k]; jit = this.peerJitter[k] || 0; } }
        return { ms, jit, loss: 0 };
    },
    level(ms) { return ms < 80 ? 'good' : (ms <= NET_PLAYABLE_MS ? 'ok' : 'bad'); },

    // ---- ping junto al nombre de cada jugador (partidas online)
    table() { const t = {}; for (const k in this.peerRtt) t[k] = Math.round(this.peerRtt[k]); return t; },
    setTable(t) { this.pingTable = t || {}; },
    pingTable: {},
    start() {
        if (this._timer) return;
        this._timer = setInterval(() => this.paint(), 500);
    },
    paint() {
        const g = typeof state !== 'undefined' && state.gameInstance;
        const online = g && g.room && !g.room.isLocal && g.running !== false;
        const tbl = g && g.isHost ? this.table() : this.pingTable;
        for (const el of document.querySelectorAll('.hud-ping')) {
            const id = el.id.slice(9);
            const ms = online && id !== (g && g.localUserId && g.isHost ? g.localUserId : null) ? tbl[id] : 0;
            if (!ms) { if (el.textContent) { el.textContent = ''; delete el.dataset.lv; } continue; }
            const txt = `${ms}ms`;
            if (el.textContent !== txt) el.textContent = txt;
            el.dataset.lv = this.level(ms);
            el.title = this.level(ms) === 'bad' ? 'Conexión lenta' : '';
        }
        // aviso único si el propio ping supera el límite jugable
        const mine = online && g.localUserId && (g.isHost ? 0 : tbl[g.localUserId]);
        if (mine > NET_PLAYABLE_MS * 1.3 && !this._warned) { this._warned = true; showToast('Tu conexión es lenta: puede notarse retraso en los golpes.', 'warn'); }
    }
};
NetQuality.start();
