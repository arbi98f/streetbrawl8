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
            this.connections.delete(conn.peer);
            const room = this.currentRoomCode && this.localRooms[this.currentRoomCode];
            if (room && room.hostId === this.userId) {
                const prev = room.slots.length;
                room.slots = room.slots.filter(s => s.id !== conn.peer);
                if (room.slots.length !== prev) this.saveRoomState(room);
            }
        });
    }

    async createRoom(playerProfile, arena = 'suzaku', difficulty = 'normal', timerMode = '99') {
        let code;
        let peer;
        let opened = false;

        for (let attempt = 0; attempt < 5 && !opened; attempt++) {
            code = this.generateCode();
            peer = new Peer(this.hostPeerId(code));
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

        const hostSlot = {
            id: this.userId,
            name: playerProfile.name,
            archetypeId: playerProfile.archetypeId,
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
            this.connections.set(conn.peer, conn);
            this.createPeerConnectionHandlers(conn);
        });

        this.updateBadge('● SALA CREADA', 'emerald');
        return roomData;
    }

    async joinRoom(code, playerProfile) {
        const cleanCode = code.trim().toUpperCase();
        if (cleanCode.length !== 5) throw new Error('El código debe tener 5 caracteres.');

        this.leaveRoom();
        const peer = new Peer();
        this.peer = peer;

        this.userId = await this.waitForPeerOpen(peer);
        this.currentRoomCode = cleanCode;
        const conn = peer.connect(this.hostPeerId(cleanCode), { reliable: true });
        this.hostConnection = conn;

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
                this.onCombatStateReceived(message.payload);
            } else if (message.type === 'PAUSE' && this.onPauseReceived) {
                this.onPauseReceived(!!message.paused);
            }
        });
    }

    handleGuestJoin(conn, guestSlot) {
        const room = this.localRooms[this.currentRoomCode];
        if (!room || room.hostId !== this.userId) return;

        if (room.status === 'playing') {
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
        this.connections.forEach(conn => {
            if (conn.open) conn.send({ type: 'COMBAT_SNAPSHOT', payload });
        });
    }

    // El anfitrión avisa a los invitados de que la partida se pausó o se reanudó
    broadcastPause(paused) {
        if (!this.currentRoomCode) return;
        this.connections.forEach(conn => {
            if (conn.open) conn.send({ type: 'PAUSE', paused: !!paused });
        });
    }

    sendClientInput(input) {
        if (!this.currentRoomCode || !this.hostConnection || !this.hostConnection.open) return;
        this.hostConnection.send({ type: 'CLIENT_INPUT', input });
    }

    leaveRoom() {
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
        this.connections.clear();
        this.currentRoomCode = null;
        this.updateBadge('● PEERJS LISTO', 'sky');
    }
}

const net = new RoomNetworkManager();
