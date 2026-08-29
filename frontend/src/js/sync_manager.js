import { hermesBridge } from './crypto_wasm_bridge.js';
import { RealDoubleRatchet } from './double_ratchet.js';
import { CryptoClient } from './crypto_client.js';
import { state } from './state.js';
import { PayloadValidator } from './security/payload_validator.js';
import { ephemeralStore, isEphemeralType } from './ephemeral_store.js';

export class SyncManager {
    constructor(currentUserAlias, storage, contacts, groups, chats, onMessageReceived) {
        this.currentUserAlias = currentUserAlias;
        this.storage = storage;
        this.contacts = contacts;
        this.groups = groups;
        this.chats = chats;
        this.onMessageReceived = onMessageReceived; // Callback to refresh UI
        this.activeChatId = null; // Currently selected active chat ID in UI
        this.websocket = null;
        this.syncInterval = null;
        this.sphincsKeysCache = {}; // Cache for SPHINCS+ public keys
        this.ratchets = {}; // Active RealDoubleRatchet instances per contact
    }

    async getOrInitRatchet(contactId) {
        if (!this.ratchets) this.ratchets = {};
        if (this.ratchets[contactId] && this.ratchets[contactId].isWasmMode) {
            return this.ratchets[contactId];
        }

        // Intentar recuperar el estado serializado del ratchet desde storage cifrado
        let savedState = null;
        try {
            savedState = await this.storage.load(`ratchet_state_${contactId}`);
        } catch (e) {
            console.warn(`[SyncManager] Fallo al cargar estado del ratchet de ${contactId} desde almacenamiento:`, e);
        }

        if (savedState && savedState.serialized) {
            try {
                const ratchet = new RealDoubleRatchet(contactId);
                await ratchet.loadState(savedState.serialized);
                this.ratchets[contactId] = ratchet;
                return ratchet;
            } catch (e) {
                console.warn(`[SyncManager] Fallo cargando sesión de ratchet serializada para ${contactId}:`, e);
            }
        }

        const sharedKeyHex = this.contacts.sharedKeys[contactId];
        if (!sharedKeyHex || sharedKeyHex === "0000000000000000000000000000000000000000000000000000000000000000") {
            return null;
        }

        let receiverKyberPk = null;
        try {
            const receiverHash = await CryptoClient.hashClientId(contactId);
            const keysRes = await fetch(`/api/user/${receiverHash}`);
            if (keysRes.ok) {
                const keys = await keysRes.json();
                receiverKyberPk = keys.kyber_pk_hex;
            }
        } catch (e) {
            console.warn("Could not fetch remote key for ratchet init:", e);
        }
        if (!receiverKyberPk) return null;

        const userKeys = await this.getOrRecoverUserKeys();
        if (!userKeys || !userKeys.kyber_sk) return null;

        try {
            const ratchet = new RealDoubleRatchet(contactId);
            const isAlice = this.currentUserAlias < contactId;
            await ratchet.init(userKeys.kyber_sk, receiverKyberPk, isAlice, sharedKeyHex);
            this.ratchets[contactId] = ratchet;
            // Guardar el estado inicial inmediatamente
            await this._saveRatchetStateToVault(contactId, ratchet);
            return ratchet;
        } catch (e) {
            console.warn(`[DoubleRatchet] Failed to initialize for ${contactId}:`, e);
            return null;
        }
    }

    async _saveRatchetStateToVault(contactId, ratchet) {
        if (!this.storage || !ratchet) return;
        try {
            const serialized = await ratchet.exportState();
            await this.storage.save(`ratchet_state_${contactId}`, {
                contactId: contactId,
                serialized: serialized,
                updatedAt: Date.now()
            });
        } catch (e) {
            console.error(`[SyncManager] CRITICAL: Could not persist ratchet state for ${contactId}:`, e);
            const err = new Error(`Persistencia transaccional fallida para ${contactId}: el estado del ratchet no pudo escribirse en disco.`);
            err.name = "RatchetPersistenceError";
            throw err;
        }
    }

    async getOrRecoverUserKeys() {
        let keys = null;
        try {
            keys = await this.storage.load('hermes_keys') 
                   || await this.storage.load('hermes_pqc_keys') 
                   || state.userKeys;
        } catch (e) {
            if (e.name === 'StorageDecryptionError') {
                throw e;
            }
            console.warn("[SyncManager] Aviso al descifrar hermes_keys (se regenerarán):", e.message);
        }
        if (!keys || !keys.sphincs_sk || !keys.kyber_sk) {
            console.warn("[SyncManager] Local PQC keys missing or incomplete. Regenerating and re-registering PQC keys...");
            try {
                console.log("[SyncManager] Generando llaves en fallback (WASM)...");
                const generated = hermesBridge.generateIdentityKeys();
                const newKeys = {
                    kyber_pk: generated.kyber_pk_hex,
                    kyber_sk: generated.kyber_sk_hex,
                    sphincs_pk: generated.sphincs_pk_hex,
                    sphincs_sk: generated.sphincs_sk_hex
                };

                const idHash = this.storage.getUserId();
                const reg = await fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        client_id: idHash,
                        kyber_pk_hex: newKeys.kyber_pk,
                        sphincs_pk_hex: newKeys.sphincs_pk
                    })
                });

                if (!reg.ok) {
                    // SEC: no guardar/adoptar llaves recién generadas que el servidor
                    // rechazó (p.ej. 409 porque este id_hash ya está registrado con OTRA
                    // llave -- desde que db_connection.py::register_user dejó de aceptar
                    // sobreescrituras). Guardarlas de todos modos habría dejado el
                    // almacenamiento local con llaves que nunca van a poder autenticar
                    // contra el servidor: una desincronización auto-infligida, distinta
                    // pero igual de rota que la vulnerabilidad que este 409 previene.
                    const detail = await reg.json().catch(() => null);
                    console.error(`[SyncManager] Fallo al re-registrar llaves de recuperación: HTTP ${reg.status}.`, detail);
                    if (reg.status === 409 && window.modalManager) {
                        window.modalManager.alert(
                            'ERROR DE SINCRONIZACIÓN',
                            'No se pudieron regenerar tus llaves: este usuario ya está registrado en el servidor con otras llaves. Inicia sesión de nuevo o restaura tu cuenta con tu frase de recuperación.',
                            'error'
                        );
                    }
                    return null;
                }

                keys = newKeys;
                state.userKeys = keys;
                await this.savePQCKeys(keys);
            } catch (e) {
                console.error("[SyncManager] Failed to recover PQC keys:", e);
                return null;
            }
        }
        return keys;
    }

    async savePQCKeys(keys) {
        await this.storage.save('hermes_pqc_keys', {
            kyber_pk: keys.kyber_pk,
            kyber_sk: keys.kyber_sk,
            sphincs_pk: keys.sphincs_pk,
            sphincs_sk: keys.sphincs_sk,
            savedAt: Date.now()
        });
        // También guardamos en el key original por retrocompatibilidad con auth_ui
        await this.storage.save('hermes_keys', keys);
    }

    async start(websocketUrl) {
        // Re-register public keys on the server before starting WS.
        // The server is stateless about keys (DROP+CREATE on restart in some configs),
        // so we must ensure the user is in the DB before WS auth is attempted.
        await this._ensureRegistered();

        window.addEventListener('online', () => {
            console.info('[SyncManager] Red recuperada (online). Vaciando cola offline...');
            this.flushOutbox();
        });

        // Start periodic REST polling fallback in case WS is disconnected
        this.syncInterval = setInterval(() => {
            this.fetchPendingBlobs();
            this.flushOutbox();
        }, 15000);
        await this.fetchPendingBlobs();
        this.flushOutbox();
        this.connectWebSocket(websocketUrl);
    }

    async _ensureRegistered() {
        /**
         * Re-registers the user's public keys on the server.
         * This is idempotent — calling it multiple times is safe.
         * It guarantees the server knows the user's public key before WS auth.
         */
        try {
            const idHash = this.storage.getUserId();
            const userKeys = await this.getOrRecoverUserKeys();
            if (!userKeys) return;

            // Prueba de posesión de la clave privada: el servidor exige timestamp+signature
            // firmados con la clave Ed25519/SPHINCS+ del usuario antes de emitir un token de
            // sesión (si no, cualquiera que supiera el alias público podía autenticarse como
            // cualquier cuenta).
            const timestamp = Math.floor(Date.now() / 1000);
            const signatureHex = await CryptoClient.signTimestamp(timestamp, userKeys.sphincs_sk);

            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client_id: idHash,
                    password: '',
                    kyber_pk_hex: userKeys.kyber_pk,
                    sphincs_pk_hex: userKeys.sphincs_pk,
                    timestamp: timestamp,
                    signature: signatureHex
                })
            });
            if (res.ok) {
                const data = await res.json();
                if (data && data.token) {
                    // Solo sessionStorage: es por-pestaña. Guardarlo también en
                    // localStorage (compartido entre pestañas) permitía que una
                    // cuenta abierta en otra ventana pisara/leyera el token de esta.
                    sessionStorage.setItem('hermes_session_token', data.token);
                }
            }
        } catch (e) {
            console.warn('[SyncManager] Could not re-register keys:', e);
        }
    }

    stop() {
        if (this.syncInterval) clearInterval(this.syncInterval);
        if (this.websocket) this.websocket.close();
    }

    // Registro explícito post-handshake (BACKLOG #1): el servidor solo se entera de una
    // relación contacto/grupo cuando el cliente se lo dice acá, DESPUÉS de que el
    // handshake ya se completó de verdad (contact_accept recibido/enviado, group_invite
    // recibido/creado) -- nunca infiriéndolo del tráfico del relay (blind relay no debe
    // saber quién habla con quién). Best-effort: si falla, la reconciliación simplemente
    // no va a ver esta relación más adelante, pero no debe romper el flujo de chat/grupo.
    async registerRelationship(relationshipType, targetId) {
        try {
            const token = sessionStorage.getItem('hermes_session_token');
            if (!token) return;
            await fetch('/api/user/relationships', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ relationship_type: relationshipType, target_id: targetId })
            });
        } catch (e) {
            console.warn(`[SyncManager] No se pudo registrar relación (${relationshipType}:${targetId}) para reconciliación:`, e);
        }
    }

    async fetchPendingBlobs() {
        const idHash = this.storage.getUserId();
        const userKeys = await this.getOrRecoverUserKeys();
        if (!userKeys) return;

        try {
            const timestamp = intTimestamp();
            const challenge = String(timestamp);
            const signature = await CryptoClient.signChallenge(challenge, userKeys.sphincs_sk);

            const headers = { "Content-Type": "application/json" };
            const token = sessionStorage.getItem('hermes_session_token');
            if (token) {
                headers["Authorization"] = `Bearer ${token}`;
            }

            const res = await fetch("/api/fetch", {
                method: "POST",
                headers: headers,
                body: JSON.stringify({
                    id_hash: idHash,
                    timestamp: timestamp,
                    signature: signature
                })
            });

            if (res.ok) {
                const data = await res.json();
                if (data.blobs.length > 0) {
                    logger(`Received ${data.blobs.length} pending blobs via REST.`);
                }
                for (const blob of data.blobs) {
                    await this.processIncomingBlob(blob, userKeys);
                }
                if (data.blobs.length > 0 && this.onMessageReceived) {
                    this.onMessageReceived();
                }
            } else if (res.status === 401) {
                console.warn("[SyncManager] Re-registrando llaves públicas en relevo tras respuesta 401...");
                if (userKeys.kyber_pk && userKeys.sphincs_pk) {
                    const reg = await fetch('/api/register', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            client_id: idHash,
                            kyber_pk_hex: userKeys.kyber_pk,
                            sphincs_pk_hex: userKeys.sphincs_pk
                        })
                    }).catch(() => null);

                    if (reg && !reg.ok) {
                        console.error(`[SyncManager] Fallo en re-registro: HTTP ${reg.status}.`);
                        if (reg.status === 409 || reg.status === 429) {
                            this.stop();
                            console.error("[SyncManager] Desincronización crítica o límite de peticiones excedido.");
                            if (window.modalManager) {
                                window.modalManager.alert(
                                    'ERROR DE SINCRONIZACIÓN', 
                                    'No se pudo autenticar con el servidor. Por favor, cierra sesión y vuelve a entrar o restaura tu cuenta.', 
                                    'error'
                                );
                            }
                        }
                    }
                }
            } else {

                logger(`Fetch blobs failed with status: ${res.status}`);
            }
        } catch (e) {

            console.warn("[SyncManager] Fallback poll failed:", e);
        }
    }

    async flushOutbox() {
        if (!window.state || !window.state.store || !window.state.store.state.outbox) return;
        const outbox = window.state.store.state.outbox;
        if (outbox.length === 0) return;
        
        logger(`[SyncManager] Flushing ${outbox.length} pending messages from outbox...`);
        for (const msg of [...outbox]) {
            try {
                const headers = { "Content-Type": "application/json" };
                const token = sessionStorage.getItem('hermes_session_token');
                if (token) {
                    headers["Authorization"] = `Bearer ${token}`;
                }

                const res = await fetch("/api/relay", {
                    method: "POST",
                    headers: headers,
                    body: JSON.stringify({
                        sender_hash: msg.sender_hash,
                        receiver_hash: msg.receiver_hash,
                        encrypted_blob_hex: msg.encrypted_blob_hex,
                        session_key_hash: msg.session_key_hash,
                        ttl_seconds: window.privacySettings ? window.privacySettings.settings.pendingMessageTTL : 86400
                    })
                });

                if (res.ok) {
                    // Si se envió, eliminar del outbox
                    if (window.hermesStore && typeof window.hermesStore.dispatch === 'function') {
                        await window.hermesStore.dispatch('OUTBOX_REMOVED', msg);
                    } else if (window.state && window.state.store && typeof window.state.store.dispatch === 'function') {
                        await window.state.store.dispatch('OUTBOX_REMOVED', msg);
                    }
                    if (this.chats && typeof this.chats.updateMessageStatusById === 'function') {
                        await this.chats.updateMessageStatusById(this.storage, msg.id, 'sent');
                    }
                    // Los mensajes efímeros ("vista única") viven en ephemeralStore (memoria),
                    // no en this.chats.history -- probar los dos es inofensivo (uno de los dos
                    // siempre va a ser un no-op) y evita que un efímero reintentado se quede
                    // visualmente en "pending" para siempre pese a haberse enviado bien.
                    ephemeralStore.updateStatusById(msg.id, 'sent');
                    if (this.onMessageSent) this.onMessageSent(msg.id);
                    if (this.onMessageReceived) this.onMessageReceived();
                }
            } catch (e) {
                console.warn(`[SyncManager] Flush failed for message ${msg.id}, keeping in outbox.`);
            }
        }
    }

    connectWebSocket(url) {
        const idHash = this.storage.getUserId();
        this.websocket = new WebSocket(`${url}/ws/${idHash}`);

        this.websocket.onopen = async () => {
            const userKeys = await this.getOrRecoverUserKeys();
            if (!userKeys) return;
            try {
                // Handshake auth within 5 seconds
                const timestamp = intTimestamp();
                const sig = await CryptoClient.signChallenge(String(timestamp), userKeys.sphincs_sk);
                this.websocket.send(JSON.stringify({
                    type: "auth",
                    timestamp: timestamp,
                    signature: sig,
                    show_online: window.state?.privacySettings?.onlineStatus !== false
                }));
            } catch (e) {
                console.error("WS auth failed:", e);
            }
        };

        this.websocket.onmessage = async (event) => {
            let rawData;
            try { rawData = JSON.parse(event.data); } catch(e) { return; }
            const data = PayloadValidator.sanitizePayload(rawData);
            if (!data || typeof data !== 'object') return;

            if (data.type === "auth_ok") {
                logger("WebSocket authenticated successfully.");
                this.fetchPendingBlobs(); // Traer mensajes pendientes inmediatamente
                this.flushOutbox(); // Vaciar cola offline al reconectar
                return;
            }

            if (data.type === "relayed_blob") {
                const userKeys = await this.getOrRecoverUserKeys();
                if (userKeys) {
                    await this.processIncomingBlob(data, userKeys);
                    if (this.onMessageReceived) {
                        this.onMessageReceived();
                    }
                }
            }
        };

        this.websocket.onclose = () => {
            // Reconnect after 5 seconds
            setTimeout(() => this.connectWebSocket(url), 5000);
        };
    }

    async sendOOBVerification(receiverId) {
        if (!this.storage || !this.currentUserAlias) return;
        try {
            await this.sendBlob(this.currentUserAlias, receiverId, {
                type: "oob_verify"
            });
        } catch (e) {
            console.error("[SyncManager] Error sending OOB verification:", e);
        }
    }

    async processIncomingBlob(blob, userKeys) {
        // blob structure: { sender_hash, encrypted_blob_hex, timestamp }
        // The encrypted_blob_hex contains the E2EE package { ciphertext_kem, wrapped_otp_key, stego_container, signature, aes_nonce }
        // Wait, how do we know what key to use for decryption?
        // 1. Is it a group message or DM?
        // Let's try to decrypt it.
        // We can parse the envelope from encrypted_blob_hex:
        try {
            let rawEnvelope;
            try { rawEnvelope = JSON.parse(hexToString(blob.encrypted_blob_hex)); } catch(e) { return; }
            const envelope = PayloadValidator.sanitizePayload(rawEnvelope);
            if (!PayloadValidator.validateEnvelope(envelope)) return;
            
            // Check if sender is blocked
            const senderId = envelope.sender_id;
            if (this.contacts.blockedContacts.includes(senderId)) {
                return; // Suppressed
            }

            // Resolve the sender's SPHINCS+ public key from registry
            const senderSphincsPk = await this._getSenderSphincsPk(senderId);
            if (senderSphincsPk === "none") {
                console.warn(`[SyncManager] Could not resolve SPHINCS+ PK for sender ${senderId}. Skipping decryption.`);
                return;
            }

            // Find key: if it is targeted to a group, look up group key
            const isGroup = this.groups.userGroups.some(g => g.id === envelope.receiver_id);
            const groupObj = isGroup ? this.groups.userGroups.find(g => g.id === envelope.receiver_id) : null;
            
            let decryptedPlaintext = null;
            
            if (isGroup && groupObj) {
                decryptedPlaintext = await CryptoClient.decryptPayload(
                    envelope,
                    "none",
                    senderSphincsPk,
                    groupObj.symmetric_key
                );
            } else {
                // DM: retrieve sender sphincs pk and shared key
                if (envelope.version === "sealed_v1" && envelope.sealed) {
                    try {
                        const plaintextBytes = hermesBridge.openFromContact(userKeys.kyber_sk, envelope.sealed);
                        decryptedPlaintext = new TextDecoder().decode(new Uint8Array(plaintextBytes));
                    } catch (errSealed) {
                        console.warn(`[SyncManager] sealed_v1 decryption failed for ${senderId}:`, errSealed);
                        return; // Fail-closed: no hay fallback débil para este tipo de envelope.
                    }
                } else if (envelope.version === "v2" && envelope.ratchet_header) {
                    try {
                        const ratchet = await this.getOrInitRatchet(senderId);
                        if (ratchet) {
                            const ctBytes = new Uint8Array(envelope.wrapped_otp_key.match(/.{1,2}/g)?.map(b => parseInt(b, 16)) || []);
                            const ivBytes = new Uint8Array((envelope.aes_nonce || "").match(/.{1,2}/g)?.map(b => parseInt(b, 16)) || []);
                            const headerCipherBytes = new Uint8Array((envelope.ratchet_header.ciphertext || "").match(/.{1,2}/g)?.map(b => parseInt(b, 16)) || []);
                            const headerIvBytes = new Uint8Array((envelope.ratchet_header.iv || "").match(/.{1,2}/g)?.map(b => parseInt(b, 16)) || []);
                            
                            decryptedPlaintext = await ratchet.decryptMessage({
                                header: { ciphertext: headerCipherBytes, iv: headerIvBytes },
                                ciphertext: ctBytes,
                                iv: ivBytes,
                                message_number: envelope.ratchet_header.message_number
                            });
                            await this._saveRatchetStateToVault(senderId, ratchet);
                        }
                    } catch (errV2) {
                        if (errV2 && errV2.name === "RatchetPersistenceError") {
                            throw errV2;
                        }
                        console.warn(`[DoubleRatchet] v2 decryption failed for ${senderId}, falling back to v1:`, errV2);
                    }
                }
                if (!decryptedPlaintext) {
                    const sharedKey = this.contacts.sharedKeys[senderId];
                    decryptedPlaintext = await CryptoClient.decryptPayload(
                        envelope,
                        userKeys.kyber_sk,
                        senderSphincsPk,
                        sharedKey || "0000000000000000000000000000000000000000000000000000000000000000"
                    );
                }
            }

            if (!decryptedPlaintext) return;

            // Parse inner payload
            let rawPayload;
            try { rawPayload = JSON.parse(decryptedPlaintext); } catch(e) { return; }
            const payload = PayloadValidator.sanitizePayload(rawPayload);
            if (!payload || typeof payload !== 'object') return;
            
            if (payload.type === "chat" || payload.type === "ephemeral_image" || payload.type === "ephemeral_audio" || payload.type === "ephemeral_text") {
                if (!this.contacts.contacts.includes(senderId) && senderId !== this.currentUserAlias) {
                    this.contacts.contacts.push(senderId);
                    this.contacts.contactData = this.contacts.contactData.filter(c => c.contact_id !== senderId);
                    this.contacts.contactData.push({
                        contact_id: senderId,
                        status: 'accepted',
                        shared_key: null
                    });
                    await this.contacts.save(this.storage);
                }
                // Detectar si es un mensaje de audio empaquetado como chat
                const isAudio = payload.msgType === 'audio' || payload.type === 'ephemeral_audio';
                const localType = payload.type === 'ephemeral_image' 
                    ? 'ephemeral_image' 
                    : payload.type === 'ephemeral_audio' ? 'ephemeral_audio'
                    : payload.type === 'ephemeral_text' ? 'ephemeral_text'
                    : isAudio ? 'audio' : payload.type;

                const incomingMsg = {
                    id:            envelope.signature,
                    sender:        senderId,
                    receiver:      envelope.receiver_id,
                    plaintext:     payload.text,
                    verified:      true,
                    timestamp:     formatTime(blob.timestamp),
                    type:          localType,
                    audioMime:     payload.audioMime     || null,
                    audioDuration: payload.audioDuration || 0,
                    viewed_by:     [],
                    unread:        (this.activeChatId !== senderId && senderId !== this.currentUserAlias),
                    raw:           envelope
                };
                if (isEphemeralType(localType)) {
                    // Nunca tocar disco con contenido efímero — ver ephemeral_store.js.
                    ephemeralStore.add(senderId, incomingMsg);
                } else {
                    await this.chats.addMessage(this.storage, senderId, incomingMsg);
                }

                if ((this.activeChatId !== senderId || document.hidden) && "Notification" in window && Notification.permission === "granted") {
                    try {
                        const title = `Mensaje de @${senderId}`;
                        const body = localType === 'ephemeral_image' ? '📷 Foto efímera' :
                                     localType === 'ephemeral_audio' ? '🎵 Audio efímero' :
                                     localType === 'ephemeral_text' ? '🤫 Mensaje efímero' :
                                     localType === 'audio' ? '🎵 Mensaje de voz' :
                                     (payload.text.substring(0, 40) + (payload.text.length > 40 ? '...' : ''));
                        new Notification(title, { body });
                    } catch (e) {}
                }

                // Dispatch event for in-app notifications
                if (senderId !== this.currentUserAlias) {
                    document.dispatchEvent(new CustomEvent('hermes:new_message', { detail: { sender: senderId } }));
                }


                // Send delivery and read receipts for DMs
                if (senderId !== this.currentUserAlias) {
                    try {
                        await this.sendBlob(this.currentUserAlias, senderId, {
                            type: "receipt",
                            subtype: "delivered",
                            msg_id: envelope.signature
                        });
                        
                        if (this.activeChatId === senderId && window.state?.privacySettings?.readReceipts !== false && !window.disableReadReceipts) {
                            await this.sendBlob(this.currentUserAlias, senderId, {
                                type: "receipt",
                                subtype: "read",
                                msg_id: envelope.signature
                            });
                        }
                    } catch (e) {
                        console.error("[SyncManager] Error sending receipts:", e);
                    }
                }
            } 
            else if (payload.type === "receipt") {
                const isGroupReceipt = !!payload.group_id;
                const targetId = isGroupReceipt ? payload.group_id : senderId;
                const msgId = payload.msg_id;
                const subtype = payload.subtype;
                const targetHistory = this.chats.getMessages(targetId);
                const msg = targetHistory.find(m => m.id === msgId);
                if (msg) {
                    if (isGroupReceipt) {
                        // Un solo tick no alcanza para "leído por todos" en un grupo --
                        // se acumula quién entregó/leyó y recién se sube el status
                        // agregado cuando el resto de la membresía (todos menos yo) lo
                        // cubre por completo.
                        if (!msg.deliveredBy) msg.deliveredBy = [];
                        if (!msg.readBy) msg.readBy = [];
                        if (subtype === "delivered" && !msg.deliveredBy.includes(senderId)) {
                            msg.deliveredBy.push(senderId);
                        }
                        if (subtype === "read" && !msg.readBy.includes(senderId)) {
                            msg.readBy.push(senderId);
                        }
                        const grp = this.groups.userGroups.find(g => g.id === targetId);
                        const others = grp ? grp.members.filter(m => m !== this.currentUserAlias) : [];
                        const allRead = others.length > 0 && others.every(m => msg.readBy.includes(m));
                        const allDelivered = others.length > 0 && others.every(m => msg.deliveredBy.includes(m));
                        if (allRead) {
                            msg.status = "read";
                        } else if (allDelivered && msg.status !== "read") {
                            msg.status = "delivered";
                        }
                    } else if (subtype === "read") {
                        msg.status = "read";
                    } else if (subtype === "delivered" && msg.status !== "read") {
                        msg.status = "delivered";
                    }
                    await this.chats.save(this.storage);
                    if (this.onMessageReceived) this.onMessageReceived();
                }
            }
            else if (payload.type === "msg_delete") {
                const targetId = isGroup ? envelope.receiver_id : senderId;
                await this.chats.deleteMessage(this.storage, targetId, payload.msg_id);
            }
            else if (payload.type === "msg_edit") {
                const targetId = isGroup ? envelope.receiver_id : senderId;
                await this.chats.editMessage(this.storage, targetId, payload.msg_id, payload.new_text);
            }
            else if (payload.type === "ephemeral_viewed") {
                const targetId = payload.group_id || (isGroup ? envelope.receiver_id : senderId);
                const msgId = payload.msg_id;
                const viewerId = senderId;

                const isEphemeral = !!ephemeralStore.find(targetId, msgId);
                const msg = isEphemeral
                    ? ephemeralStore.find(targetId, msgId)
                    : this.chats.getMessages(targetId).find(m => m.id === msgId);
                if (msg) {
                    if (!msg.viewed_by) msg.viewed_by = [];
                    if (!msg.viewed_by.includes(viewerId)) {
                        msg.viewed_by.push(viewerId);
                    }

                    let shouldDelete = false;
                    if (isGroup) {
                        const group = this.groups.userGroups.find(g => g.id === targetId);
                        if (group) {
                            const otherMembers = group.members.filter(m => m !== msg.sender);
                            const allViewed = otherMembers.every(m => msg.viewed_by.includes(m));
                            if (allViewed) shouldDelete = true;
                        }
                    } else {
                        shouldDelete = true;
                    }

                    if (isEphemeral) {
                        // Solo en memoria — nada que persistir en ningún caso.
                        if (shouldDelete) ephemeralStore.remove(targetId, msgId);
                    } else if (shouldDelete) {
                        await this.chats.deleteMessage(this.storage, targetId, msgId);
                    } else {
                        await this.chats.save(this.storage);
                    }
                }
            }
            else if (payload.type === "typing") {
                const targetId = payload.is_group ? payload.group_id : senderId;
                document.dispatchEvent(new CustomEvent("typing_indicator", {
                    detail: {
                        chatId: String(targetId),
                        username: senderId,
                        isGroup: !!payload.is_group
                    }
                }));
            }
            else if (payload.type === "contact_request") {
                await this.contacts.addReceivedRequest(this.storage, senderId);
                document.dispatchEvent(new Event("contacts_updated"));
                if (window._hermesShowToast) window._hermesShowToast(`⚡ Solicitud de contacto de @${senderId}`, false);
            } 
            else if (payload.type === "contact_accept") {
                await this.contacts.acceptRequest(this.storage, senderId, payload.shared_key);
                await this.registerRelationship('contact', senderId);
                document.dispatchEvent(new Event("contacts_updated"));
                if (window._hermesShowToast) window._hermesShowToast(`🎉 ¡@${senderId} aceptó tu solicitud de contacto!`, false);
            }
            else if (payload.type === "contact_reject") {
                await this.contacts.rejectRequest(this.storage, senderId);
                document.dispatchEvent(new Event("contacts_updated"));
                if (window._hermesShowToast) window._hermesShowToast(`ℹ️ @${senderId} declinó la solicitud`, false);
            }
            else if (payload.type === "resync_request") {
                // El servidor (blind relay) nunca tuvo el material criptográfico del
                // contacto — no hay forma de restaurarlo automáticamente. Lo único
                // honesto es avisar al humano para que reenvíe la invitación a mano.
                await this.chats.addMessage(this.storage, senderId, {
                    id: envelope.signature,
                    sender: 'system',
                    receiver: envelope.receiver_id,
                    plaintext: `⚠️ @${senderId} perdió sus datos locales y pide que le reenvíes tu invitación de contacto.`,
                    timestamp: formatTime(blob.timestamp),
                    type: 'system',
                    viewed_by: []
                });
                if (window._hermesShowToast) window._hermesShowToast(`⚠️ @${senderId} pide resincronizar el contacto`, false);
                if (window.renderContactSidebar) window.renderContactSidebar();
            }
            else if (payload.type === "oob_verify") {
                await this.contacts.setPeerVerifiedMe(this.storage, senderId, true);
                document.dispatchEvent(new Event("contacts_updated"));
                if (window._hermesShowToast) window._hermesShowToast(`🛡️ @${senderId} verificó tu huella de identidad OOB`, false);
                await this.chats.addMessage(this.storage, senderId, {
                    id: envelope.signature,
                    sender: 'system',
                    receiver: envelope.receiver_id,
                    plaintext: `🛡️ @${senderId} verificó tu huella de identidad OOB`,
                    timestamp: formatTime(blob.timestamp),
                    type: 'system',
                    viewed_by: []
                });
                if (window.renderContactSidebar) window.renderContactSidebar();
                if (window.state && window.state.activeContact === senderId && window.openChatWithContact) {
                    window.openChatWithContact();
                }
            }

            else if (payload.type === "screenshot_alert") {
                await this.chats.addMessage(this.storage, senderId, {
                    id: envelope.signature,
                    sender: 'system',
                    receiver: envelope.receiver_id,
                    plaintext: `⚠️ @${senderId} tomó una captura de pantalla de la imagen efímera!`,
                    timestamp: formatTime(blob.timestamp),
                    type: 'system',
                    viewed_by: []
                });
            }
            else if (payload.type === "group_invite") {
                await this.groups.createGroup(
                    this.storage,
                    payload.group_id,
                    payload.group_name,
                    payload.creator_id,
                    payload.members,
                    payload.symmetric_key
                );
                await this.registerRelationship('group', payload.group_id);
                await this.chats.addMessage(this.storage, payload.group_id, {
                    id: envelope.signature,
                    sender: 'system',
                    receiver: payload.group_id,
                    plaintext: `🎉 Te han invitado al grupo #${payload.group_name} creado por @${payload.creator_id}.`,
                    timestamp: formatTime(blob.timestamp),
                    type: 'system',
                    viewed_by: []
                });
            }
            else if (payload.type === "group_screenshot_alert") {
                await this.chats.addMessage(this.storage, payload.group_id, {
                    id: envelope.signature,
                    sender: 'system',
                    receiver: payload.group_id,
                    plaintext: `⚠️ @${senderId} tomó una captura de pantalla de la imagen efímera en el grupo!`,
                    timestamp: formatTime(blob.timestamp),
                    type: 'system',
                    viewed_by: []
                });
            }
            else if (payload.type === "group_chat" || payload.type === "group_ephemeral_image" || payload.type === "group_ephemeral_audio" || payload.type === "group_ephemeral_text" || payload.type === "group_ephemeral_image_ptr") {
                // group_ephemeral_image_ptr: la imagen no viaja en el payload E2E -- solo un
                // puntero. Se busca+descifra acá y se reescribe payload.text para que el resto
                // de esta rama (ephemeralStore, notificaciones, recibos) no necesite cambios.
                let ptrImageId = null;
                if (payload.type === "group_ephemeral_image_ptr") {
                    try {
                        payload.text = await this.fetchGroupEphemeralImage(payload.image_id);
                    } catch (e) {
                        console.error("[SyncManager] Error fetching group ephemeral image:", e);
                        return;
                    }
                    ptrImageId = payload.image_id;
                }

                const isAudio   = payload.msgType === 'audio' || payload.type === "group_ephemeral_audio";
                const localType = payload.type === "group_ephemeral_image" || payload.type === "group_ephemeral_image_ptr"
                    ? "ephemeral_image"
                    : payload.type === "group_ephemeral_audio" ? "ephemeral_audio"
                    : payload.type === "group_ephemeral_text" ? "ephemeral_text"
                    : isAudio ? "audio" : "chat";

                const incomingGroupMsg = {
                    id:            envelope.signature,
                    sender:        senderId,
                    receiver:      payload.group_id,
                    plaintext:     payload.text,
                    verified:      true,
                    timestamp:     formatTime(blob.timestamp),
                    type:          localType,
                    audioMime:     payload.audioMime     || null,
                    audioDuration: payload.audioDuration || 0,
                    viewed_by:     [],
                    unread:        (this.activeChatId !== payload.group_id && senderId !== this.currentUserAlias),
                    image_id:      ptrImageId,
                    raw:           envelope
                };
                if (isEphemeralType(localType)) {
                    ephemeralStore.add(payload.group_id, incomingGroupMsg);
                } else {
                    await this.chats.addMessage(this.storage, payload.group_id, incomingGroupMsg);
                }

                if (senderId !== this.currentUserAlias && (this.activeChatId !== payload.group_id || document.hidden) && "Notification" in window && Notification.permission === "granted") {
                    try {
                        let groupName = payload.group_id;
                        const grp = this.groups.userGroups.find(g => g.id === payload.group_id);
                        if (grp) groupName = grp.name;

                        const title = `Mensaje de @${senderId} en #${groupName}`;
                        const body = localType === 'ephemeral_image' ? '📷 Foto efímera' :
                                     localType === 'ephemeral_audio' ? '🎵 Audio efímero' :
                                     localType === 'ephemeral_text' ? '🤫 Mensaje efímero' :
                                     localType === 'audio' ? '🎵 Mensaje de voz' :
                                     (payload.text.substring(0, 40) + (payload.text.length > 40 ? '...' : ''));
                        new Notification(title, { body });
                    } catch (e) {}
                }

                // Recibos de entrega/lectura para mensajes de grupo -- antes nunca se
                // enviaban y el status quedaba pegado en "sent" para siempre (ver
                // BACKLOG.md #10). Van directo al remitente original, no a todo el grupo;
                // él agrega deliveredBy/readBy contra la membresía real (rama "receipt"
                // más abajo).
                if (senderId !== this.currentUserAlias) {
                    try {
                        await this.sendBlob(this.currentUserAlias, senderId, {
                            type: "receipt",
                            subtype: "delivered",
                            msg_id: envelope.signature,
                            group_id: payload.group_id
                        });

                        if (this.activeChatId === payload.group_id && window.state?.privacySettings?.readReceipts !== false && !window.disableReadReceipts) {
                            await this.sendBlob(this.currentUserAlias, senderId, {
                                type: "receipt",
                                subtype: "read",
                                msg_id: envelope.signature,
                                group_id: payload.group_id
                            });
                        }
                    } catch (e) {
                        console.error("[SyncManager] Error sending group receipts:", e);
                    }
                }
            }
            else if (payload.type === "group_rename") {
                await this.groups.updateGroupName(this.storage, payload.group_id, payload.new_name);
                await this.chats.addMessage(this.storage, payload.group_id, {
                    id: envelope.signature,
                    sender: 'system',
                    receiver: payload.group_id,
                    plaintext: `✏️ @${senderId} renombró el grupo a #${payload.new_name}.`,
                    timestamp: formatTime(blob.timestamp),
                    type: 'system',
                    viewed_by: []
                });
            }
            else if (payload.type === "group_add_member") {
                await this.groups.addMember(this.storage, payload.group_id, payload.user_id);
                await this.chats.addMessage(this.storage, payload.group_id, {
                    id: envelope.signature,
                    sender: 'system',
                    receiver: payload.group_id,
                    plaintext: `ℹ️ @${senderId} agregó a @${payload.user_id} al grupo.`,
                    timestamp: formatTime(blob.timestamp),
                    type: 'system',
                    viewed_by: []
                });
            }
            else if (payload.type === "group_rekey") {
                await this.groups.rotateGroupKey(this.storage, payload.group_id, payload.new_symmetric_key);
                await this.chats.addMessage(this.storage, payload.group_id, {
                    id: envelope.signature,
                    sender: 'system',
                    receiver: payload.group_id,
                    plaintext: `🔑 @${senderId} ha rotado la clave criptográfica del grupo por seguridad (Forward Secrecy).`,
                    timestamp: formatTime(blob.timestamp),
                    type: 'system',
                    viewed_by: []
                });
            }
            else if (payload.type === "group_remove_member" || payload.type === "group_member_leave") {
                const userToRemove = payload.type === "group_member_leave" ? senderId : payload.user_id;
                await this.groups.removeMember(this.storage, payload.group_id, userToRemove);
                if (userToRemove === this.currentUserAlias) {
                    // We were removed from the group, delete locally
                    this.groups.userGroups = this.groups.userGroups.filter(g => g.id !== payload.group_id);
                    await this.groups.save(this.storage);
                } else {
                    const actionText = payload.type === "group_member_leave"
                        ? `🚶 @${userToRemove} ha salido del grupo.`
                        : `🚫 @${senderId} ha eliminado a @${userToRemove} del grupo.`;
                    await this.chats.addMessage(this.storage, payload.group_id, {
                        id: envelope.signature,
                        sender: 'system',
                        receiver: payload.group_id,
                        plaintext: actionText,
                        timestamp: formatTime(blob.timestamp),
                        type: 'system',
                        viewed_by: []
                    });

                    // Auto-rekey: si alguien se fue del grupo por su cuenta (nadie más lo
                    // notifica), el admin es quien rota y redistribuye la clave simétrica a
                    // los miembros restantes -- sin esto, quien se fue conserva acceso a los
                    // mensajes futuros del grupo (ver BACKLOG.md #4). El caso de expulsión
                    // (group_remove_member) ya rota la clave del lado de quien expulsa.
                    if (payload.type === "group_member_leave") {
                        const grp = this.groups.userGroups.find(g => g.id === payload.group_id);
                        if (grp && grp.creator_id === this.currentUserAlias) {
                            const newKeyBytes = crypto.getRandomValues(new Uint8Array(32));
                            const newKeyHex = Array.from(newKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');
                            await this.groups.rotateGroupKey(this.storage, payload.group_id, newKeyHex);
                            for (const memberId of grp.members) {
                                if (memberId === this.currentUserAlias) continue;
                                this.sendBlob(this.currentUserAlias, memberId, {
                                    type: "group_rekey",
                                    group_id: payload.group_id,
                                    new_symmetric_key: newKeyHex
                                }).catch(() => {});
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.error("Error processing blob envelope:", e);
        }
    }

    // Sella un plaintext contra la clave pública ML-KEM-1024 real del receptor. Usado
    // para cualquier payload de bootstrap (lleva material de clave que el receptor todavía
    // no tiene, así que no puede haber ratchet ni sharedKey involucrados en protegerlo).
    _sealBootstrapEnvelope(plaintext, receiverKyberPk, senderId, receiverId) {
        const plaintextBytes = new TextEncoder().encode(plaintext);
        const sealedJson = hermesBridge.sealForContact(receiverKyberPk, plaintextBytes);
        const timestamp = Math.floor(Date.now() / 1000);
        const signatureHex = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join('');
        return {
            version: "sealed_v1",
            sealed: sealedJson,
            signature: signatureHex,
            timestamp: timestamp,
            sender_id: senderId || "",
            receiver_id: receiverId || ""
        };
    }

    async sendBlob(senderId, receiverId, payloadObj, routeToId = null) {
        // Resolve receiver hash and keys
        const receiverHash = await sha256(routeToId || receiverId);
        const senderHash = await sha256(senderId);
        const userKeys = await this.getOrRecoverUserKeys();

        // Check if group or DM
        const isGroup = this.groups.userGroups.some(g => g.id === receiverId);
        const groupObj = isGroup ? this.groups.userGroups.find(g => g.id === receiverId) : null;
        
        let receiverKyberPk = "none";
        let sessionKeyHex = "none";

        if (isGroup && groupObj) {
            sessionKeyHex = groupObj.symmetric_key;
        } else {
            const keysRes = await fetch(`/api/user/${receiverHash}`);
            if (!keysRes.ok) throw new Error("Receiver not registered");
            const keys = await keysRes.json();
            receiverKyberPk = keys.kyber_pk_hex;
            sessionKeyHex = this.contacts.sharedKeys[receiverId] || "0000000000000000000000000000000000000000000000000000000000000000";
        }

        // Encrypt the inner payload
        const plaintext = JSON.stringify(payloadObj);
        let envelope = null;

        // Cualquier payload que LLEVE material de clave (shared_key/symmetric_key/
        // new_symmetric_key: contact_accept, group_invite, group_rekey, y cualquier tipo
        // futuro con el mismo shape) no puede depender de un ratchet o sharedKey derivados
        // de ese mismo secreto — el receptor todavía no lo tiene, es circular. Tampoco puede
        // caer en el fallback genérico (clave AES fija y pública). Se sella con ML-KEM-1024
        // real contra la clave pública del receptor. contact_accept en particular NUNCA debe
        // pasar por el intento de ratchet de abajo (el emisor ya guardó localmente su propio
        // shared_key recién generado antes de llamar sendBlob, así que getOrInitRatchet
        // "encontraría" ese shared_key y cifraría con un ratchet que el receptor —que aún no
        // conoce ese secreto— no puede replicar).
        const carriesKeyMaterial = !isGroup && (
            'shared_key' in payloadObj || 'symmetric_key' in payloadObj || 'new_symmetric_key' in payloadObj
        );
        if (carriesKeyMaterial && payloadObj.type === "contact_accept" && receiverKyberPk && receiverKyberPk !== "none") {
            envelope = this._sealBootstrapEnvelope(plaintext, receiverKyberPk, senderId, receiverId);
        }

        if (!envelope && !isGroup && payloadObj.type !== "contact_accept" && payloadObj.type !== "contact_request" && payloadObj.type !== "oob_verify") {
            try {
                const ratchet = await this.getOrInitRatchet(receiverId);
                if (ratchet) {
                    const ratchetRes = await ratchet.encryptMessage(plaintext);
                    const ctHex = Array.from(new Uint8Array(ratchetRes.ciphertext)).map(b => b.toString(16).padStart(2, '0')).join('');
                    const ivHex = Array.from(new Uint8Array(ratchetRes.iv)).map(b => b.toString(16).padStart(2, '0')).join('');
                    const headerCipherHex = Array.from(new Uint8Array(ratchetRes.header.ciphertext)).map(b => b.toString(16).padStart(2, '0')).join('');
                    const headerIvHex = Array.from(new Uint8Array(ratchetRes.header.iv)).map(b => b.toString(16).padStart(2, '0')).join('');
                    const timestamp = Math.floor(Date.now() / 1000);
                    const signatureHex = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join('');

                    envelope = {
                        version: "v2",
                        ratchet_header: {
                            ciphertext: headerCipherHex,
                            iv: headerIvHex,
                            message_number: ratchetRes.message_number
                        },
                        ciphertext_kem: "",
                        wrapped_otp_key: ctHex,
                        stego_container: "",
                        audio_spectrum: null,
                        signature: signatureHex,
                        timestamp: timestamp,
                        aes_nonce: ivHex,
                        sender_id: senderId || "",
                        receiver_id: receiverId || ""
                    };
                    await this._saveRatchetStateToVault(receiverId, ratchet);
                }
            } catch (errRatchet) {
                console.warn(`[DoubleRatchet] v2 encryption failed for ${receiverId}, falling back to v1:`, errRatchet);
            }
        }

        // group_invite / group_rekey (u otro tipo futuro con material de clave) llegaron
        // hasta acá sin ratchet (p.ej. invitando a alguien que todavía no es contacto
        // directo). Mismo criterio que arriba: sellar, nunca clave AES fija.
        if (!envelope && carriesKeyMaterial && receiverKyberPk && receiverKyberPk !== "none") {
            envelope = this._sealBootstrapEnvelope(plaintext, receiverKyberPk, senderId, receiverId);
        }

        if (!envelope) {
            envelope = await CryptoClient.encryptPayload(
                plaintext,
                receiverKyberPk,
                userKeys.sphincs_sk,
                sessionKeyHex,
                senderId,
                receiverId
            );
        }

        // Convert envelope to hex blob
        const envelopeHex = stringToHex(JSON.stringify(envelope));
        // Per-message random nonce — prevents replay attacks without blocking subsequent messages.
        // DO NOT use sha256(sessionKeyHex): the shared key is fixed, so its hash is always
        // the same and the server would reject every message after the first as a replay.
        const sessionKeyHash = crypto.randomUUID().replace(/-/g, '');

        console.log(`[SyncManager] relaying blob from ${senderId} (${senderHash}) to ${receiverId} (${receiverHash})`);
        
        // Send to server blind relay
        let resJson = null;
        try {
            const headers = { "Content-Type": "application/json" };
            const token = sessionStorage.getItem('hermes_session_token');
            if (token) {
                headers["Authorization"] = `Bearer ${token}`;
            }

            const res = await fetch("/api/relay", {
                method: "POST",
                headers: headers,
                body: JSON.stringify({
                    sender_hash: senderHash,
                    receiver_hash: receiverHash,
                    encrypted_blob_hex: envelopeHex,
                    session_key_hash: sessionKeyHash,
                    ttl_seconds: window.privacySettings ? window.privacySettings.settings.pendingMessageTTL : 86400
                    // NOTE: timestamp/signature omitted intentionally — Bearer JWT authenticates the HTTP relay.
                    // SPHINCS+ signatures live inside the Double Ratchet encrypted envelope, not on the transport layer.
                })
            });

            if (!res.ok) {
                const errJson = await res.json().catch(() => ({}));
                throw new Error("Failed to relay blob: " + (errJson.detail || res.statusText));
            }
            resJson = await res.json();
        } catch (e) {
            console.warn(`[SyncManager] Red falló al enviar mensaje:`, e.message);
            // Si falla la red y no es una señal transitoria (typing/receipt -- reintentarlas
            // minutos después ya no tiene sentido), lo guardamos en el Outbox para reintento.
            // SEC/UX: esto SÍ incluye mensajes efímeros ("vista única") -- el outbox guarda
            // encrypted_blob_hex, el mismo blob cifrado que se hubiera mandado igual, nunca
            // texto plano, así que encolarlo no reintroduce el problema que ephemeral_store.js
            // resolvió (nunca tocar disco con contenido efímero en claro). "Vista única" es una
            // garantía sobre cuántas veces el RECEPTOR puede ver el mensaje después de
            // entregado, no sobre si vale la pena reintentar una entrega que nunca ocurrió --
            // antes, cortar la red a mitad de un envío efímero lo perdía en silencio para
            // siempre (BACKLOG.md), sin ningún aviso pese a que la UI mostraba "pending" igual
            // que un mensaje normal.
            if (payloadObj.type !== "typing" && payloadObj.type !== "receipt") {
                const outboxMsg = {
                    id: envelope.signature,
                    sender_hash: senderHash,
                    receiver_hash: receiverHash,
                    encrypted_blob_hex: envelopeHex,
                    session_key_hash: sessionKeyHash,
                    timestamp: Date.now()
                };
                if (window.hermesStore && typeof window.hermesStore.dispatch === 'function') {
                    await window.hermesStore.dispatch('OUTBOX_ADDED', outboxMsg);
                } else if (window.state && window.state.store && typeof window.state.store.dispatch === 'function') {
                    await window.state.store.dispatch('OUTBOX_ADDED', outboxMsg);
                }
                console.info(`[SyncManager] Mensaje guardado en Outbox para reintento automático.`);
            }
            
            // Retornamos un ID falso (la signature) para que la UI lo registre como "pending_send"
            resJson = { blob_id: "pending_" + envelope.signature };
        }

        return {
            blob_id: resJson.blob_id,
            signature: envelope.signature,
            envelope: envelope,
            is_pending: resJson.blob_id.startsWith("pending_")
        };
    }

    // Custodia temporal server-side de imágenes efímeras de GRUPO (EphemeralImageStore
    // / ImageEncryptor, ver BACKLOG.md) -- excepción consciente y acotada al modelo
    // zero-knowledge general, solo para este caso. El descifrado en sí siempre pasa
    // por WASM (hermesBridge), nunca crypto.subtle directo, por AGENTS.md.
    async uploadGroupEphemeralImage(groupId, memberAliases, imageDataUrl) {
        const userHash = await sha256(this.currentUserAlias);
        // El servidor identifica a los viewers por hash (mismo user_hash que se manda
        // en el fetch/viewed), no por alias -- si no, get_image() nunca reconoce al
        // requester como viewer autorizado.
        const memberHashes = await Promise.all(memberAliases.map(alias => sha256(alias)));
        const headers = { "Content-Type": "application/json" };
        const token = sessionStorage.getItem('hermes_session_token');
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch('/api/media/group-ephemeral-image', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                user_hash: userHash,
                group_id: groupId,
                member_ids: memberHashes,
                image_data_b64: imageDataUrl
            })
        });
        if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            throw new Error("Failed to upload group ephemeral image: " + (errJson.detail || res.statusText));
        }
        const data = await res.json();
        return data.image_id;
    }

    async fetchGroupEphemeralImage(imageId) {
        const userHash = await sha256(this.currentUserAlias);
        const headers = { "Content-Type": "application/json" };
        const token = sessionStorage.getItem('hermes_session_token');
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch('/api/media/group-ephemeral-image/fetch', {
            method: 'POST',
            headers,
            body: JSON.stringify({ user_hash: userHash, image_id: imageId })
        });
        if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            throw new Error("Failed to fetch group ephemeral image: " + (errJson.detail || res.statusText));
        }
        const { ciphertext_hex, nonce_hex, key_hex } = await res.json();
        const plaintextBytes = hermesBridge.decryptGroupEphemeralImage(key_hex, nonce_hex, ciphertext_hex);
        return new TextDecoder().decode(new Uint8Array(plaintextBytes));
    }

    async markGroupEphemeralImageViewed(imageId) {
        try {
            const userHash = await sha256(this.currentUserAlias);
            const headers = { "Content-Type": "application/json" };
            const token = sessionStorage.getItem('hermes_session_token');
            if (token) headers["Authorization"] = `Bearer ${token}`;

            await fetch('/api/media/group-ephemeral-image/viewed', {
                method: 'POST',
                headers,
                body: JSON.stringify({ user_hash: userHash, image_id: imageId })
            });
        } catch (e) {
            console.warn('[SyncManager] Error marking group ephemeral image viewed:', e);
        }
    }

    async sendGroupBlob(senderId, groupId, payloadObj) {
        const groupObj = this.groups.userGroups.find(g => g.id === groupId);
        if (!groupObj) throw new Error("Group not found");
        
        let lastRes = null;
        for (const memberId of groupObj.members) {
            if (memberId === senderId) continue; // No nos enviamos a nosotros mismos
            try {
                // Encriptamos para el grupo, pero enrutamos al memberId
                lastRes = await this.sendBlob(senderId, groupId, payloadObj, memberId);
            } catch (e) {
                console.warn(`[SyncManager] Fallo enviando a miembro del grupo ${memberId}:`, e);
            }
        }
        
        if (!lastRes) {
             // Fake response so UI doesn't crash if no members or all failed
             return { signature: "group_" + Date.now() };
        }
        return lastRes;
    }

    async checkContactStatus(contactAlias) {
        try {
            const hash = await sha256(contactAlias);
            const res = await fetch(`/api/status/${hash}`);
            if (res.ok) {
                const data = await res.json();
                return data.online === true;
            }
        } catch (e) {
            console.warn("Failed to check contact status:", e);
        }
        return false;
    }

    async _getSenderSphincsPk(senderId) {
        if (this.sphincsKeysCache[senderId]) {
            return this.sphincsKeysCache[senderId];
        }
        try {
            const senderHash = await sha256(senderId);
            const keysRes = await fetch(`/api/user/${senderHash}`);
            if (keysRes.ok) {
                const keys = await keysRes.json();
                this.sphincsKeysCache[senderId] = keys.sphincs_pk_hex;
                return keys.sphincs_pk_hex;
            }
        } catch (e) {
            console.warn("Failed to fetch sender keys:", e);
        }
        return "none";
    }

    async getContactPublicKey(contactId) {
        return await this._getSenderSphincsPk(contactId);
    }
}

// Helpers
let _lastTs = 0;
function intTimestamp() {
    let current = Math.floor(Date.now() / 1000);
    if (current <= _lastTs) {
        current = _lastTs + 1;
    }
    _lastTs = current;
    return current;
}

function logger(msg) {
    console.log(`[SyncManager] ${msg}`);
}

function hexToString(hex) {
    let str = '';
    for (let i = 0; i < hex.length; i += 2) {
        str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    }
    return str;
}

function stringToHex(str) {
    let hex = '';
    for (let i = 0; i < str.length; i++) {
        hex += str.charCodeAt(i).toString(16).padStart(2, '0');
    }
    return hex;
}

async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await hermesBridge.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function formatTime(ts) {
    return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
