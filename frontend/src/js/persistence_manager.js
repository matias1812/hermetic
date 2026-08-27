// frontend/src/js/persistence_manager.js
import { hermesBridge } from './crypto_wasm_bridge.js';

export class PersistenceManager {
    /**
     * Gestor de persistencia en IndexedDB.
     *
     * AUDITORÍA (2026-08-27): esta clase resultó estar más "viva" de lo que parecía —
     * hermes_store.js (su único consumidor) SÍ se instancia e inicializa en cada boot
     * (app_initializer.js), y reconciliation_manager.js llama a
     * hermesStore.dispatch('GROUP_CREATED'/'CONTACT_ADDED', ...) en cada login real
     * (evento hermes:logged_in) cuando detecta discordancia con el servidor. Hoy ese
     * camino queda cortado porque /api/user/state (del que depende) no existe en el
     * backend — pero es una feature a medio construir, no código abandonado; el día
     * que se agregue ese endpoint esto se activa solo. save()/load()/loadAll() cifran
     * todo el payload salvo `id` (lo exige keyPath: 'id' de cada objectStore) vía
     * hermesBridge.encryptLocalDatabaseChunk — mismo mecanismo que storage_manager.js /
     * media_storage.js, que ya falla cerrado si la bóveda no está desbloqueada.
     */
    
    constructor() {
        this.db = null;
        this._locks = new Map();
        this.DB_NAME = 'hermeschat_persistent';
        this.DB_VERSION = 3;
        this.STORES = [
            'messages',
            'contacts',
            'groups',
            'keys',
            'settings',
            'ephemeral_state',
            'ratchet_state',
            'outbox'
        ];
    }
    
    async initialize() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                for (const storeName of this.STORES) {
                    if (!db.objectStoreNames.contains(storeName)) {
                        db.createObjectStore(storeName, { keyPath: 'id' });
                    }
                }
            };
            
            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log('✅ IndexedDB PersistenceManager initialized');
                resolve();
            };
            
            request.onerror = (event) => {
                console.error('❌ IndexedDB PersistenceManager failed:', event.target.error);
                reject(event.target.error);
            };
        });
    }
    
    // ============================================
    // GUARDAR (persiste automáticamente)
    // ============================================
    
    async saveMessage(message) {
        await this.save('messages', {
            id: message.id || crypto.randomUUID(),
            conversationId: message.conversationId,
            senderId: message.senderId,
            encryptedText: message.encryptedText || message.text,
            timestamp: message.timestamp || Date.now(),
            type: message.type || 'text',
            ephemeral: message.ephemeral || false,
            status: message.status || 'sent'
        });
    }
    
    async saveContact(contact) {
        await this.save('contacts', {
            id: contact.id || contact.alias,
            alias: contact.alias,
            publicKey: contact.publicKey,
            addedAt: contact.addedAt || Date.now(),
            verified: contact.verified || false
        });
    }
    
    async saveGroup(group) {
        await this.save('groups', {
            id: group.id,
            name: group.name,
            description: group.description,
            members: group.members,
            groupKey: group.groupKey,
            createdAt: group.createdAt || Date.now()
        });
    }
    
    async saveKey(keyData) {
        await this.save('keys', {
            id: keyData.id,
            type: keyData.type,
            privateKey: keyData.privateKey,
            publicKey: keyData.publicKey,
            createdAt: Date.now()
        });
    }
    
    async saveRatchetState(state) {
        await this.save('ratchet_state', {
            id: state.conversationId,
            state: state,
            updatedAt: Date.now()
        });
    }
    
    async saveOutboxMessage(messageData) {
        await this.save('outbox', {
            id: messageData.id,
            payload: messageData,
            createdAt: Date.now()
        });
    }
    
    async removeOutboxMessage(messageId) {
        await this.delete('outbox', messageId);
    }
    
    // ============================================
    // CARGAR (restaura al iniciar)
    // ============================================
    
    async loadAllMessages(conversationId) {
        const allMessages = await this.loadAll('messages');
        if (!conversationId) return allMessages;
        return allMessages
            .filter(m => m.conversationId === conversationId)
            .sort((a, b) => a.timestamp - b.timestamp);
    }
    
    async loadAllContacts() {
        return await this.loadAll('contacts');
    }
    
    async loadAllGroups() {
        return await this.loadAll('groups');
    }
    
    async loadKey(keyId) {
        return await this.load('keys', keyId);
    }
    
    async loadAllKeys() {
        return await this.loadAll('keys');
    }
    
    async loadAllOutboxMessages() {
        return await this.loadAll('outbox');
    }
    
    async loadRatchetState(conversationId) {
        return await this.load('ratchet_state', conversationId);
    }
    
    // ============================================
    // OPERACIONES GENÉRICAS
    // ============================================
    
    async withLock(lockName, mode, fn) {
        if (typeof navigator !== 'undefined' && navigator.locks && typeof navigator.locks.request === 'function') {
            return await navigator.locks.request(lockName, { mode }, fn);
        } else {
            if (!this._locks) this._locks = new Map();
            while (this._locks.get(lockName)) {
                await new Promise(r => setTimeout(r, 5));
            }
            this._locks.set(lockName, true);
            try {
                return await fn();
            } finally {
                this._locks.delete(lockName);
            }
        }
    }

    // Cifra todo el registro salvo `id` (clave del objectStore) vía la vault_key real.
    // Lanza si la bóveda está bloqueada — mismo fail-closed que storage_manager.js.
    _seal(data) {
        const { id, ...rest } = data;
        const sealed = hermesBridge.encryptLocalDatabaseChunk(JSON.stringify(rest));
        return { id, _sealed: sealed };
    }

    _unseal(record) {
        if (!record) return record;
        if (!record._sealed) return record; // registro legado sin cifrar — no debería existir en uso real
        const rest = JSON.parse(hermesBridge.decryptLocalDatabaseChunk(record._sealed));
        return { id: record.id, ...rest };
    }

    async save(storeName, data) {
        if (!this.db) await this.initialize();
        const record = this._seal(data);
        return await this.withLock(`hermes_db_${storeName}`, 'exclusive', async () => {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.put(record);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        });
    }

    async load(storeName, id) {
        if (!this.db) await this.initialize();
        const record = await this.withLock(`hermes_db_${storeName}`, 'shared', async () => {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.get(id);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        });
        return this._unseal(record);
    }

    async loadAll(storeName) {
        if (!this.db) await this.initialize();
        const records = await this.withLock(`hermes_db_${storeName}`, 'shared', async () => {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(request.error);
            });
        });
        return records.map(r => this._unseal(r));
    }
    
    async delete(storeName, id) {
        if (!this.db) await this.initialize();
        return await this.withLock(`hermes_db_${storeName}`, 'exclusive', async () => {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.delete(id);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        });
    }
}

export const persistenceManager = new PersistenceManager();
