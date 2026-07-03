import { hermesBridge } from './crypto_wasm_bridge.js';
import { MemorySanitizer } from './memory_sanitizer.js';

export class StorageDecryptionError extends Error {
    constructor(message, originalError) {
        super(message);
        this.name = 'StorageDecryptionError';
        this.originalError = originalError;
    }
}

export class EncryptedStorageManager {
    /**
     * Gestor de almacenamiento local CIFRADO delegado al puente FFI Rust.
     */
    constructor() {
        this.isUnlocked = false;
        this.currentUserIdHash = null;
    }
    
    setUserId(idHash) {
        this.currentUserIdHash = idHash;
        sessionStorage.setItem('session_user_id_hash', idHash);
    }

    getUserId() {
        return this.currentUserIdHash
            || sessionStorage.getItem('session_user_id_hash')
            || '';
    }

    async unlock(password) {
        if (this._unlockPromise) {
            return this._unlockPromise;
        }
        this._unlockPromise = this._doUnlock(password);
        try {
            return await this._unlockPromise;
        } finally {
            this._unlockPromise = null;
        }
    }

    async _doUnlock(password) {
        if (!this.getUserId()) {
            throw new Error("No se ha definido un ID de usuario antes de desbloquear el almacenamiento.");
        }
        
        await hermesBridge.init();
        hermesBridge.unlockVault(password);
        
        const testData = localStorage.getItem('_hermes_lock_test_' + this.getUserId());
        if (testData) {
            try {
                await this.decrypt(testData);
                this.isUnlocked = true;
                return true;
            } catch (e) {
                if (String(e).includes('NotImplemented')) {
                    console.warn("[StorageManager] Cifrado local FFI pendiente (Fail-Closed en FASE 3).");
                }
            }
        }
        
        try {
            const marker = await this.encrypt('HERMES_LOCK_OK');
            localStorage.setItem('_hermes_lock_test_' + this.getUserId(), marker);
        } catch (e) {
            if (String(e).includes('NotImplemented')) {
                console.warn("[StorageManager] Cifrado local FFI pendiente (Fail-Closed en FASE 3). Bóveda desbloqueada en puente.");
            } else {
                throw e;
            }
        }
        this.isUnlocked = true;
        return true;
    }

    async _migrateVault(password, rawSaltStr, base64Salt) {
        // En este punto, this.wasmStorage podría estar con PBKDF2
        const oldStorage = new WasmStorageEngine();
        oldStorage.unlock_pbkdf2(password, rawSaltStr);
        
        const userId = this.getUserId();
        const testKey = '_hermes_lock_test_' + userId;
        const prefix = userId + '_';
        
        const lsMigrate = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key === testKey || key.startsWith(prefix) || (key.startsWith('_hermes_') && key.endsWith('_' + userId)))) {
                try {
                    const oldCipher = localStorage.getItem(key);
                    // Use old storage to decrypt
                    const buf = this.base64ToArrayBuffer(oldCipher);
                    const plainStr = oldStorage.decrypt(new Uint8Array(buf));
                    const plain = JSON.parse(plainStr);
                    lsMigrate.push({ key, plain });
                } catch(e) {
                    // Ignore if already migrated or corrupted
                }
            }
        }
        
        let idbMigrate = [];
        try {
            const db = await this._getDb();
            idbMigrate = await new Promise((resolve, reject) => {
                const tx = db.transaction('kv', 'readonly');
                const store = tx.objectStore('kv');
                const req = store.getAllKeys();
                req.onsuccess = async () => {
                    const keys = req.result;
                    const items = [];
                    for (const k of keys) {
                        if (k.startsWith(prefix)) {
                            try {
                                const valReq = store.get(k);
                                const val = await new Promise((r, rej) => {
                                    valReq.onsuccess = () => r(valReq.result);
                                    valReq.onerror = () => rej(valReq.error);
                                });
                                // Use old storage to decrypt
                                const buf = this.base64ToArrayBuffer(val);
                                const plainStr = oldStorage.decrypt(new Uint8Array(buf));
                                const plain = JSON.parse(plainStr);
                                items.push({ key: k, plain });
                            } catch(e) {}
                        }
                    }
                    resolve(items);
                };
                req.onerror = () => reject(req.error);
            });
        } catch(e) {
            console.warn("Error migrando IndexedDB:", e);
        }

        // Lock the legacy storage to zeroize the PBKDF2 key immediately
        oldStorage.lock();

        // Cambiamos a la llave nueva
        this.wasmStorage.unlock_argon2(password, base64Salt);
        
        // Re-cifrar todo en localStorage
        for (const item of lsMigrate) {
            const newCipher = await this.encrypt(item.plain);
            localStorage.setItem(item.key, newCipher);
        }
        
        // Re-cifrar todo en IndexedDB
        if (idbMigrate.length > 0) {
            const encryptedIDB = [];
            for (const item of idbMigrate) {
                const newCipher = await this.encrypt(item.plain);
                encryptedIDB.push({ key: item.key, cipher: newCipher });
            }

            try {
                const db = await this._getDb();
                await new Promise((resolve, reject) => {
                    const tx = db.transaction('kv', 'readwrite');
                    const store = tx.objectStore('kv');
                    
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error);
                    
                    for (const item of encryptedIDB) {
                        store.put(item.cipher, item.key);
                    }
                });
            } catch(e) {
                console.warn("Error guardando IndexedDB migrado:", e);
            }
        }
        
        console.log(`[StorageManager] Successfully migrated ${lsMigrate.length} LS items and ${idbMigrate.length} IDB items to Argon2.`);
    }
    
    async encrypt(plaintext) {
        /**
         * Delegado al puente FFI Rust/WASM.
         */
        const jsonStr = JSON.stringify(plaintext);
        const bytes = hermesBridge.encryptLocalDatabaseChunk(jsonStr);
        return this.arrayBufferToBase64(bytes);
    }
    
    async decrypt(encryptedData) {
        /**
         * Delegado al puente FFI Rust/WASM.
         */
        try {
            const bytes = this.base64ToArrayBuffer(encryptedData);
            const jsonStr = hermesBridge.decryptLocalDatabaseChunk(bytes);
            return JSON.parse(jsonStr);
        } catch (e) {
            throw new StorageDecryptionError("StorageDecryptionError: fallo descifrando en WASM o no implementado", e);
        }
    }
    
    async _getDb() {
        if (this._db) return this._db;
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('hermes_kv_store', 1);
            req.onupgradeneeded = e => {
                e.target.result.createObjectStore('kv');
            };
            req.onsuccess = e => {
                this._db = e.target.result;
                resolve(this._db);
            };
            req.onerror = () => reject(req.error);
        });
    }

    async save(key, data) {
        /**
         * Guarda datos cifrados en IndexedDB (sin límite de 5MB).
         */
        if (!this.isUnlocked) {
            const success = await this.unlock('hermes_default_session_key');
            if (!success) {
                console.error("[StorageManager] No se pudo desbloquear. Abortando guardado.");
                return;
            }
        }
        const prefixedKey = this.getUserId() + '_' + key;
        const encrypted = await this.encrypt(data);
        
        try {
            const db = await this._getDb();
            return new Promise((resolve, reject) => {
                const tx = db.transaction('kv', 'readwrite');
                const store = tx.objectStore('kv');
                const req = store.put(encrypted, prefixedKey);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        } catch (e) {
            console.error("[StorageManager] Error IndexedDB, cayendo a localStorage", e);
            localStorage.setItem(prefixedKey, encrypted);
        }
    }
    
    async load(key) {
        /**
         * Carga datos cifrados de IndexedDB o localStorage (migración).
         */
        if (!this.isUnlocked) {
            const success = await this.unlock('hermes_default_session_key');
            if (!success) {
                // Silenciamos este warning porque es normal que falle si el usuario
                // aún no se ha logueado y PrivacySettings intenta cargar en background.
                return null;
            }
        }
        const prefixedKey = this.getUserId() + '_' + key;
        
        try {
            const db = await this._getDb();
            const encryptedDB = await new Promise((resolve, reject) => {
                const tx = db.transaction('kv', 'readonly');
                const store = tx.objectStore('kv');
                const req = store.get(prefixedKey);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
            
            if (encryptedDB) {
                return await this.decrypt(encryptedDB);
            }
        } catch (e) {
            if (e.name === 'StorageDecryptionError') throw e;
            console.warn("[StorageManager] Error IndexedDB al cargar", e);
        }

        // Migración / Fallback de localStorage
        const encrypted = localStorage.getItem(prefixedKey);
        if (!encrypted) return null;
        try {
            const parsed = await this.decrypt(encrypted);
            // Migrar a IndexedDB silenciomente para limpiar localStorage
            await this.save(key, parsed);
            localStorage.removeItem(prefixedKey); // Liberar cuota
            return parsed;
        } catch (e) {
            if (e.name === 'StorageDecryptionError') throw e;
            console.error("Failed to decrypt data for key:", key);
            return null;
        }
    }

    async delete(key) {
        /**
         * Elimina datos de IndexedDB y localStorage con zeroización manual.
         */
        const prefixedKey = this.getUserId() + '_' + key;
        
        // Zeroize in localStorage
        if (localStorage.getItem(prefixedKey)) {
            const dataLen = localStorage.getItem(prefixedKey).length;
            const zeroData = new Array(dataLen).join('0');
            localStorage.setItem(prefixedKey, zeroData);
            localStorage.removeItem(prefixedKey);
        }

        // Remove from IndexedDB
        try {
            const db = await this._getDb();
            await new Promise((resolve, reject) => {
                const tx = db.transaction('kv', 'readwrite');
                const store = tx.objectStore('kv');
                const req = store.delete(prefixedKey);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        } catch (e) {
            console.warn("[StorageManager] Error deleting from IndexedDB", e);
        }
    }
    
    lock() {
        if (hermesBridge && hermesBridge.ready) {
            hermesBridge.lockVault();
        }
        this.isUnlocked = false;
    }
    
    // Utilidades
    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }
    
    base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }
}
