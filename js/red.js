'use strict';
// Salas multijugador P2P con PeerJS

// =========================================================================
// 4. GESTIÓN DE SALAS MULTIJUGADOR P2P
// =========================================================================
class RoomNetworkManager {
    constructor() {
        this.userId = 'player_' + Math.random().toString(36).substring(2, 10);
        this.peer = null;
        this.hostConnection = null;
        this.connections = new Map();
        this.currentRoomCode = null;
        this.localRooms = {};
        this.onRoomUpdated = null;
        this.onCombatStateReceived = null;
        this.onClientInputReceived = null;
        this.onRoomClosed = null;
        this.onPauseReceived = null;
        this.gameConns = new Map();      // anfitrión: canal de juego (sin orden) de cada invitado
        this.gameConn = null;            // invitado: su canal de juego
        this.snapSeq = 0;                // anfitrión: número de snapshot
        this.lastSnapSeq = 0;            // invitado: último snapshot aplicado
        this.inSeq = 0;                  // invitado: número de input
        this.lastInSeq = {};             // anfitrión: último input recibido de cada invitado
        this.pingTimer = null;
        this.leaving = false;
        this.myProfile = null;
    }

    async init() {
        if (typeof Peer === 'undefined') {
            this.updateBadge('● PEERJS NO DISPONIBLE', 'red');
            throw new Error('No se cargó PeerJS.');
        }
        this.updateBadge('● PEERJS LISTO', 'sky');
    }

    updateBadge(text, color) {
        const badge = document.getElementById('connection-mode-badge');
        if (!badge) return;
        badge.textContent = text;
        badge.className = color === 'emerald'
            ? 'text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
            : color === 'red'
                ? 'text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/40'
                : 'text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/40';
    }

    hostPeerId(code) { return `street-brawl-8-${code.toLowerCase()}`; }

    waitForPeerOpen(peer) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Tiempo agotado PeerJS.')), 15000);
            const cleanup = () => {
                clearTimeout(timeout);
                peer.off('open', onOpen);
                peer.off('error', onError);
            };
            const onOpen = id => { cleanup(); resolve(id); };
            const onError = err => { cleanup(); reject(err); };
            peer.on('open', onOpen);
            peer.on('error', onError);
        });
    }

    createPeerConnectionHandlers(conn) {
        conn.on('data', message => {
            if (!message || !message.type) return;

            if (message.type === 'JOIN_ROOM' && this.currentRoomCode && this.peer && this.peer.id === this.hostPeerId(this.currentRoomCode)) {
                this.handleGuestJoin(conn, message.player);
            } else if (message.type === 'CLIENT_INPUT' && this.currentRoomCode && this.onClientInputReceived) {
                this.onClientInputReceived(conn.peer, message.input);
            } else if (message.type === 'LEAVE_ROOM' && this.currentRoomCode) {
                this.connections.delete(conn.peer);
                const room = this.localRooms[this.currentRoomCode];
                if (room && room.hostId === this.userId) {
                    room.slots = room.slots.filter(slot => slot.id !== conn.peer);
                    this.saveRoomState(room);
                }
            }
        });

        conn.on('close', () => {
            if (this.connections.get(conn.peer) !== conn) return;   // ya lo sustituyó una reconexión
            this.connections.delete(conn.peer);
            const room = this.currentRoomCode && this.localRooms[this.currentRoomCode];
            // En plena partida el hueco queda "ausente": un bot juega por él hasta 30 s y puede volver
            if (room && room.hostId === this.userId && room.status === 'playing') {
                const sl = room.slots.find(s => s.id === conn.peer && !s.isBot);
                if (sl) {
                    sl.away = true; sl.awayAt = Date.now();
                    const pid = conn.peer;
                    setTimeout(() => {
                        const r = this.currentRoomCode && this.localRooms[this.currentRoomCode];
                        const s2 = r && r.slots.find(s => s.id === pid);
                        if (s2 && s2.away) { r.slots = r.slots.filter(s => s.id !== pid); this.saveRoomState(r); }
                    }, 30000);
                    return;
                }
            }
            if (room && room.hostId === this.userId) {
                const prev = room.slots.length;
                room.slots = room.slots.filter(s => s.id !== conn.peer);
                if (room.slots.length !== prev) this.saveRoomState(room);
            }
        });
    }

    // ---- canal de juego (anfitrión): snapshots e inputs sin esperar a paquetes viejos
    attachGameConn(conn) {
        this.gameConns.set(conn.peer, conn);
        conn.on('data', message => {
            if (!message || !message.type) return;
            if (message.type === 'CLIENT_INPUT' && this.currentRoomCode && this.onClientInputReceived) {
                if (message.seq !== undefined) {
                    if (message.seq <= (this.lastInSeq[conn.peer] || 0)) return;   // llegó tarde: ya hay uno más nuevo
                    this.lastInSeq[conn.peer] = message.seq;
                }
                this.onClientInputReceived(conn.peer, message.input);
            } else if (message.type === 'PONG') {
                NetQuality.onPong(conn.peer, message.t);
            }
        });
        conn.on('close', () => { if (this.gameConns.get(conn.peer) === conn) this.gameConns.delete(conn.peer); });
    }

    startPinging() {
        clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => {
            this.gameConns.forEach((conn, pid) => {
                if (conn.open) conn.send({ type: 'PING', t: performance.now(), r: NetQuality.peerRtt[pid] || 0, j: NetQuality.peerJitter[pid] || 0 });
            });
        }, NET_PING_MS);
    }

    async createRoom(playerProfile, arena = 'suzaku', difficulty = 'normal', timerMode = '99') {
        let code;
        let peer;
        let opened = false;

        await NetQuality.loadIce();
        for (let attempt = 0; attempt < 5 && !opened; attempt++) {
            code = this.generateCode();
            peer = new Peer(this.hostPeerId(code), NetQuality.peerOptions());
            try {
                await this.waitForPeerOpen(peer);
                opened = true;
            } catch (err) {
                peer.destroy();
            }
        }

        if (!opened) throw new Error('No se pudo crear la sala. Inténtalo de nuevo.');

        this.peer = peer;
        this.userId = peer.id;
        this.currentRoomCode = code;
        this.connections.clear();
        this.gameConns.clear();
        this.snapSeq = 0; this.lastInSeq = {}; NetQuality.reset();
        this.leaving = false;

        const hostSlot = {
            id: this.userId,
            name: playerProfile.name,
            archetypeId: playerProfile.archetypeId,
            look: playerProfile.look,
            isBot: false,
            isHost: true
        };
        const roomData = {
            code,
            hostId: this.userId,
            arena,
            difficulty,
            timerMode,
            mode: 'ffa',
            status: 'lobby',
            slots: [hostSlot],
            updatedAt: Date.now()
        };

        this.localRooms[code] = roomData;
        peer.on('connection', conn => {
            if (conn.metadata && conn.metadata.ch === 'game') { this.attachGameConn(conn); return; }
            this.connections.set(conn.peer, conn);
            this.createPeerConnectionHandlers(conn);
        });
        this.startPinging();

        this.updateBadge('● SALA CREADA', 'emerald');
        return roomData;
    }

    async joinRoom(code, playerProfile) {
        const cleanCode = code.trim().toUpperCase();
        if (cleanCode.length !== 5) throw new Error('El código debe tener 5 caracteres.');

        this.leaveRoom();
        await NetQuality.loadIce();
        this.leaving = false;
        this.myProfile = playerProfile;
        NetQuality.reset();
        this.lastSnapSeq = 0; this.inSeq = 0;
        const peer = new Peer(NetQuality.peerOptions());
        this.peer = peer;

        this.userId = await this.waitForPeerOpen(peer);
        this.currentRoomCode = cleanCode;
        const conn = peer.connect(this.hostPeerId(cleanCode), { reliable: true });
        this.hostConnection = conn;
        conn.on('close', () => this.onHostConnClosed(conn));

        return await new Promise((resolve, reject) => {
            let settled = false;
            const timeout = setTimeout(() => {
                if (settled) return;
                settled = true;
                this.leaveRoom();
                reject(new Error(`No se encontró la sala "${cleanCode}".`));
            }, 15000);

            conn.on('open', () => {
                this.createGuestConnectionHandlers(conn, room => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timeout);
                    this.localRooms[cleanCode] = room;
                    this.updateBadge('● CONECTADO P2P', 'emerald');
                    this.openGameChannel();
                    resolve(room);
                }, msg => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timeout);
                    this.leaveRoom();
                    reject(new Error(msg));
                });
                conn.send({
                    type: 'JOIN_ROOM',
                    player: {
                        id: this.userId,
                        name: playerProfile.name,
                        archetypeId: playerProfile.archetypeId,
                        look: playerProfile.look,
                        isBot: false,
                        isHost: false
                    }
                });
            });
        });
    }

    createGuestConnectionHandlers(conn, onRoomState, onError) {
        conn.on('data', message => {
            if (!message || !message.type) return;

            if (message.type === 'ROOM_STATE' && message.room) {
                onRoomState(message.room);
            } else if (message.type === 'ROOM_UPDATE' && message.room) {
                this.localRooms[message.room.code] = message.room;
                if (this.onRoomUpdated) this.onRoomUpdated(message.room);
            } else if (message.type === 'ROOM_ERROR') {
                onError(message.message || 'No se pudo entrar.');
            } else if (message.type === 'ROOM_CLOSED') {
                this.currentRoomCode = null;
                showToast('El anfitrión cerró la sala.', 'warn');
                if (this.onRoomClosed) this.onRoomClosed();
            } else if (message.type === 'COMBAT_SNAPSHOT' && this.onCombatStateReceived) {
                this.acceptSnapshot(message);
            } else if (message.type === 'PING') {
                NetQuality.onPing(message.r, message.j);
                const gc = this.gameConn && this.gameConn.open ? this.gameConn : conn;
                gc.send({ type: 'PONG', t: message.t });
            } else if (message.type === 'PAUSE' && this.onPauseReceived) {
                this.onPauseReceived(!!message.paused);
            }
        });
    }

    // Todo lo que manda un invitado es dato NO confiable: nombre acotado y sin caracteres de control/HTML,
    // luchador válido y colores hexadecimales. El anfitrión nunca copia otros campos del invitado.
    sanitizeGuestSlot(g) {
        g = (g && typeof g === 'object') ? g : {};
        let name = typeof g.name === 'string' ? g.name.replace(/[\u0000-\u001f\u007f<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14) : '';
        if (!name) name = 'BRAWLER_' + Math.floor(10 + Math.random() * 89);
        const arch = (typeof FIGHTER_ARCHETYPES !== 'undefined' ? FIGHTER_ARCHETYPES : []).find(a => a.id === g.archetypeId);
        const out = { name, archetypeId: arch ? arch.id : (FIGHTER_ARCHETYPES[0] && FIGHTER_ARCHETYPES[0].id) };
        if (typeof Look !== 'undefined' && Look.clean) out.look = Look.clean(g.look);
        return out;
    }

    handleGuestJoin(conn, guestSlot) {
        guestSlot = this.sanitizeGuestSlot(guestSlot);
        const room = this.localRooms[this.currentRoomCode];
        if (!room || room.hostId !== this.userId) return;

        if (room.status === 'playing') {
            // Un invitado ausente que vuelve recupera su sitio y su luchador
            const back = room.slots.find(s => s.id === conn.peer && !s.isBot);
            if (back) {
                back.away = false; delete back.awayAt;
                this.connections.set(conn.peer, conn);
                conn.send({ type: 'ROOM_STATE', room });
                return;
            }
            this.rejectGuest(conn, 'La partida ya está en curso.');
            return;
        }

        // Un mismo par que repite JOIN_ROOM no puede ocupar más de un slot
        if (room.slots.some(s => s.id === conn.peer)) {
            conn.send({ type: 'ROOM_STATE', room });
            return;
        }

        // Límite validado SIEMPRE en el anfitrión (4 en cooperativo, 8 en el resto)
        const max = getRoomMaxPlayers(room);
        const slot = { ...guestSlot, id: conn.peer, isBot: false, isHost: false };
        if (room.slots.length < max) {
            room.slots.push(slot);
        } else {
            const botIdx = room.slots.findIndex(s => s.isBot);
            if (botIdx >= 0) room.slots[botIdx] = slot;
            else {
                this.rejectGuest(conn, isCoopRoom(room) ? COOP_FULL_MESSAGE : 'La sala está llena (8/8).');
                return;
            }
        }

        this.connections.set(conn.peer, conn);
        conn.send({ type: 'ROOM_STATE', room });
        this.saveRoomState(room);
    }

    // Envía el motivo y cierra con un pequeño margen para que el mensaje llegue antes del cierre
    rejectGuest(conn, message) {
        try { conn.send({ type: 'ROOM_ERROR', message }); } catch (e) {}
        setTimeout(() => { try { conn.close(); } catch (e) {} }, 400);
    }

    // Cambio de modo validado por el anfitrión: respeta el tope de jugadores del modo destino
    changeRoomMode(room, mode) {
        if (!room || room.hostId !== this.userId) return { ok: false, error: 'Solo el anfitrión puede cambiar el modo.' };
        const max = mode === 'coop' ? COOP_MAX_PLAYERS : VERSUS_MAX_PLAYERS;
        const humans = room.slots.filter(s => !s.isBot).length;
        if (humans > max) {
            return { ok: false, error: `No se puede cambiar a Cooperativo: hay ${humans} jugadores y el máximo es ${max}.` };
        }
        let removedBots = 0;
        while (room.slots.length > max) {
            let idx = -1;
            for (let i = room.slots.length - 1; i >= 0; i--) { if (room.slots[i].isBot) { idx = i; break; } }
            if (idx < 0) break;
            room.slots.splice(idx, 1);
            removedBots++;
        }
        room.mode = mode;
        // Combate a muerte usa 3/5/8 minutos; al entrar o salir de él la duración vuelve a un valor válido
        const dmTimes = ['180', '300', '480'];
        if (mode === 'dm' && !dmTimes.includes(room.timerMode)) room.timerMode = '300';
        if (mode !== 'dm' && dmTimes.includes(room.timerMode)) room.timerMode = '99';
        return { ok: true, removedBots };
    }

    generateCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
        return code;
    }

    async saveRoomState(room) {
        if (!room) return;
        room.updatedAt = Date.now();
        this.localRooms[room.code] = room;

        if (room.isLocal) {
            if (this.onRoomUpdated && document.getElementById('screen-lobby') && !document.getElementById('screen-lobby').classList.contains('hidden')) {
                this.onRoomUpdated(room);
            }
            return;
        }

        if (room.hostId !== this.userId) return;
        this.broadcastRoomUpdate(room);
        if (this.onRoomUpdated && room.status !== 'playing') this.onRoomUpdated(room);
    }

    broadcastRoomUpdate(room) {
        this.connections.forEach(conn => {
            if (conn.open) conn.send({ type: 'ROOM_UPDATE', room });
        });
    }

    broadcastCombatSnapshot(payload) {
        if (!this.currentRoomCode) return;
        const msg = { type: 'COMBAT_SNAPSHOT', payload, seq: ++this.snapSeq };
        if (this.snapSeq % 15 === 1) msg.pg = NetQuality.table();   // pings de todos, para mostrarlos junto a cada nombre
        this.connections.forEach((conn, pid) => {
            const gc = this.gameConns.get(pid);
            const c = gc && gc.open ? gc : conn;
            if (c.open) c.send(msg);
        });
    }

    // Invitado: descarta snapshots viejos que llegan desordenados
    acceptSnapshot(message) {
        if (message.seq !== undefined) {
            if (message.seq <= this.lastSnapSeq) return;
            this.lastSnapSeq = message.seq;
            NetQuality.onSeq(message.seq);
        }
        if (message.pg) NetQuality.setTable(message.pg);
        if (this.onCombatStateReceived) this.onCombatStateReceived(message.payload);
    }

    // Invitado: abre el canal de juego sin orden; si falla, todo sigue por el canal normal
    openGameChannel() {
        const peer = this.peer;
        if (!peer || peer.destroyed || !this.currentRoomCode) return;
        try {
            const gc = peer.connect(this.hostPeerId(this.currentRoomCode), { reliable: false, metadata: { ch: 'game' } });
            gc.on('open', () => { this.gameConn = gc; });
            gc.on('close', () => { if (this.gameConn === gc) this.gameConn = null; });
            gc.on('error', () => { if (this.gameConn === gc) this.gameConn = null; });
            gc.on('data', message => {
                if (!message || !message.type) return;
                if (message.type === 'COMBAT_SNAPSHOT') this.acceptSnapshot(message);
                else if (message.type === 'PING') {
                    NetQuality.onPing(message.r, message.j);
                    gc.send({ type: 'PONG', t: message.t });
                }
            });
        } catch (e) { this.gameConn = null; }
    }

    // El canal de control del invitado se cerró: en lobby equivale a perder la sala; en partida intenta volver
    onHostConnClosed(conn) {
        if (this.leaving || this.hostConnection !== conn || !this.currentRoomCode) return;
        const room = this.localRooms[this.currentRoomCode];
        if (room && room.status === 'playing' && this.myProfile) { this.tryReconnect(); return; }
        this.currentRoomCode = null;
        showToast('Se perdió la conexión con el anfitrión.', 'warn');
        if (this.onRoomClosed) this.onRoomClosed();
    }

    // Reintenta durante 25 s con el mismo peer; si el anfitrión lo reconoce, el luchador vuelve a ser suyo
    async tryReconnect() {
        if (this._reconnecting) return;
        this._reconnecting = true;
        const code = this.currentRoomCode;
        this.showReconnect(true);
        const t0 = Date.now();
        let ok = false;
        while (!ok && !this.leaving && this.currentRoomCode === code && Date.now() - t0 < 25000) {
            try {
                let peer = this.peer;
                if (!peer || peer.destroyed) {
                    peer = new Peer(this.userId, NetQuality.peerOptions());
                    this.peer = peer;
                    await this.waitForPeerOpen(peer);
                } else if (peer.disconnected) {
                    peer.reconnect();
                    await new Promise(r => setTimeout(r, 1200));
                }
                const conn = peer.connect(this.hostPeerId(code), { reliable: true });
                await new Promise((resolve, reject) => {
                    const to = setTimeout(() => reject(new Error('timeout')), 6000);
                    conn.on('open', () => { clearTimeout(to); resolve(); });
                    conn.on('error', e => { clearTimeout(to); reject(e); });
                });
                ok = await new Promise(resolve => {
                    const to = setTimeout(() => resolve(false), 5000);
                    conn.on('data', m => {
                        if (m && m.type === 'ROOM_STATE') { clearTimeout(to); resolve(true); }
                        else if (m && m.type === 'ROOM_ERROR') { clearTimeout(to); resolve(false); }
                    });
                    conn.send({ type: 'JOIN_ROOM', player: { id: this.userId, name: this.myProfile.name, archetypeId: this.myProfile.archetypeId, look: this.myProfile.look, isBot: false, isHost: false } });
                });
                if (ok) {
                    this.hostConnection = conn;
                    conn.on('close', () => this.onHostConnClosed(conn));
                    this.createGuestConnectionHandlers(conn, () => {}, () => {});
                    this.lastSnapSeq = 0;
                    this.openGameChannel();
                } else { try { conn.close(); } catch (e) {} }
            } catch (e) { /* se reintenta */ }
            if (!ok) await new Promise(r => setTimeout(r, 2000));
        }
        this._reconnecting = false;
        this.showReconnect(false);
        if (ok) { showToast('¡Reconectado!', 'success'); return; }
        if (!this.leaving && this.currentRoomCode === code) {
            this.currentRoomCode = null;
            showToast('No se pudo reconectar con el anfitrión.', 'warn');
            if (this.onRoomClosed) this.onRoomClosed();
        }
    }

    showReconnect(on) {
        let el = document.getElementById('net-reconnect');
        if (!on) { if (el) el.remove(); return; }
        if (!el) {
            el = document.createElement('div');
            el.id = 'net-reconnect';
            el.textContent = 'Reconectando con el anfitrión…';
            document.body.appendChild(el);
        }
    }

    // El anfitrión avisa a los invitados de que la partida se pausó o se reanudó
    broadcastPause(paused) {
        if (!this.currentRoomCode) return;
        this.connections.forEach(conn => {
            if (conn.open) conn.send({ type: 'PAUSE', paused: !!paused });
        });
    }

    sendClientInput(input) {
        if (!this.currentRoomCode) return;
        const c = this.gameConn && this.gameConn.open ? this.gameConn : this.hostConnection;
        if (!c || !c.open) return;
        c.send({ type: 'CLIENT_INPUT', input, seq: ++this.inSeq });
    }

    leaveRoom() {
        this.leaving = true;
        clearInterval(this.pingTimer); this.pingTimer = null;
        this.showReconnect(false);
        if (this.hostConnection && this.hostConnection.open) {
            this.hostConnection.send({ type: 'LEAVE_ROOM' });
            this.hostConnection.close();
        }

        if (this.peer && this.currentRoomCode && this.peer.id === this.hostPeerId(this.currentRoomCode)) {
            this.connections.forEach(conn => {
                if (conn.open) conn.send({ type: 'ROOM_CLOSED' });
            });
        }

        if (this.peer && !this.peer.destroyed) this.peer.destroy();
        this.peer = null;
        this.hostConnection = null;
        this.gameConn = null;
        this.connections.clear();
        this.gameConns.clear();
        this.currentRoomCode = null;
        this._reconnecting = false;
        NetQuality.reset();
        this.updateBadge('● PEERJS LISTO', 'sky');
    }
}

const net = new RoomNetworkManager();
