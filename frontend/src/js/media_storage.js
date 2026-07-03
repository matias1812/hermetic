// media_storage.js
// Almacenamiento de archivos multimedia en IndexedDB (cifrado AES-GCM).
// Ventajas sobre localStorage: soporta archivos grandes, no bloquea el hilo principal.
import { hermesBridge } from './crypto_wasm_bridge.js';

export class MediaStorage {
    /**
     * Gestor de almacenamiento multimedia basado en IndexedDB.
     *
     * Los datos se almacenan cifrados (misma clave que EncryptedStorageManager).
     * La clave debe inyectarse con setKey() tras el desbloqueo del usuario.
     *
     * Stores:
     *   images  — imágenes permanentes y referencias de efímeras
     *   audio   — mensajes de audio grabados
     */

    constructor() {
        this.dbName    = 'hermes_media';
        this.dbVersion = 1;
        this.db        = null;
        this._key      = null;   // CryptoKey AES-GCM (inyectada desde EncryptedStorageManager)
    }

    /** Inyectar la CryptoKey derivada de la contraseña del usuario. */
    setKey(cryptoKey) {
        this._key = cryptoKey;
    }

    /** Abrir / crear la base de datos IndexedDB. */
    async open() {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Store para imágenes
                if (!db.objectStoreNames.contains('images')) {
                    const imgStore = db.createObjectStore('images', { keyPath: 'id' });
                    imgStore.createIndex('chatId',      'chatId',      { unique: false });
                    imgStore.createIndex('timestamp',   'timestamp',   { unique: false });
                    imgStore.createIndex('isEphemeral', 'isEphemeral', { unique: false });
                    imgStore.createIndex('isPermanent', 'isPermanent', { unique: false });
                }

                // Store para audio
                if (!db.objectStoreNames.contains('audio')) {
                    const audStore = db.createObjectStore('audio', { keyPath: 'id' });
                    audStore.createIndex('chatId',    'chatId',    { unique: false });
                    audStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };

            request.onsuccess  = (e) => { this.db = e.target.result; resolve(this.db); };
            request.onerror    = (e) => reject(e.target.error);
        });
    }

    // ─────────────────────────────────────────
    // IMÁGENES
    // ─────────────────────────────────────────

    /**
     * Guardar imagen (con cifrado si hay clave disponible).
     * @param {Object} imageData
     *   id, base64Data, mimeType, chatId, sender, isEphemeral, isPermanent,
     *   expiresAt (ms epoch, solo efímeras)
     */
    async saveImage(imageData, maybeData) {
        await this._ensureDB();

        let obj = imageData;
        if (typeof imageData === 'string') {
            obj = { id: imageData, base64Data: maybeData };
        }

        const encryptedData = this._key
            ? await this._encrypt(obj.base64Data || obj.data)
            : (obj.base64Data || obj.data);

        const record = {
            id:            obj.id || ('img_' + Date.now()),
            encryptedData: encryptedData,
            mimeType:      obj.mimeType   || 'image/png',
            timestamp:     obj.timestamp  || Date.now(),
            sender:        obj.sender     || '',
            chatId:        obj.chatId     || '',
            isEphemeral:   obj.isEphemeral || false,
            isPermanent:   obj.isPermanent || false,
            expiresAt:     obj.expiresAt  || null,
            size:          obj.base64Data ? obj.base64Data.length : 0,
        };

        return this._put('images', record);
    }

    /** Recuperar imagen por ID (descifra si hay clave). */
    async getImage(id) {
        await this._ensureDB();
        const record = await this._get('images', id);
        if (!record) return null;

        if (this._key && record.encryptedData) {
            try {
                record.base64Data = await this._decrypt(record.encryptedData);
            } catch {
                record.base64Data = null;   // clave incorrecta o dato corrupto
            }
        } else {
            record.base64Data = record.encryptedData;
        }

        return record;
    }

    /** Eliminar imagen por ID. */
    async deleteImage(id) {
        await this._ensureDB();
        return this._delete('images', id);
    }

    /** Listar imágenes permanentes de un chatId. */
    async listPermanentImages(chatId) {
        await this._ensureDB();
        const all = await this._getAll('images');
        return all.filter(img => img.chatId === chatId && img.isPermanent);
    }

    /** Listar TODAS las imágenes permanentes (para backup). */
    async listAllPermanentImages() {
        await this._ensureDB();
        const all = await this._getAll('images');
        return all.filter(img => img.isPermanent);
    }

    /** Eliminar imágenes efímeras cuyo expiresAt ya pasó. */
    async cleanupEphemeral() {
        await this._ensureDB();
        const now = Date.now();
        const all = await this._getAll('images');
        const expired = all.filter(img => img.isEphemeral && img.expiresAt && img.expiresAt < now);
        for (const img of expired) {
            await this._delete('images', img.id);
        }
        return expired.length;
    }

    // ─────────────────────────────────────────
    // AUDIO
    // ─────────────────────────────────────────

    /**
     * Guardar mensaje de audio (cifrado).
     * @param {Object} audioData
     *   id, base64Data, duration, mimeType, chatId, sender
     */
    async saveAudio(audioData, maybeData) {
        await this._ensureDB();

        let obj = audioData;
        if (typeof audioData === 'string') {
            obj = { id: audioData, base64Data: maybeData };
        }

        const encryptedData = this._key
            ? await this._encrypt(obj.base64Data || obj.data)
            : (obj.base64Data || obj.data);

        const record = {
            id:            obj.id || ('aud_' + Date.now()),
            encryptedData: encryptedData,
            duration:      obj.duration  || 0,
            mimeType:      obj.mimeType  || 'audio/webm',
            timestamp:     audioData.timestamp || Date.now(),
            sender:        audioData.sender    || '',
            chatId:        audioData.chatId    || '',
            size:          audioData.base64Data ? audioData.base64Data.length : 0,
        };

        return this._put('audio', record);
    }

    /** Recuperar audio por ID (descifra). */
    async getAudio(id) {
        await this._ensureDB();
        const record = await this._get('audio', id);
        if (!record) return null;

        if (this._key && record.encryptedData) {
            try {
                record.base64Data = await this._decrypt(record.encryptedData);
            } catch {
                record.base64Data = null;
            }
        } else {
            record.base64Data = record.encryptedData;
        }

        return record;
    }

    /** Eliminar audio por ID. */
    async deleteAudio(id) {
        await this._ensureDB();
        return this._delete('audio', id);
    }

    /** Listar todos los audios de un chatId. */
    async listAudio(chatId) {
        await this._ensureDB();
        const all = await this._getAll('audio');
        return all.filter(a => a.chatId === chatId);
    }

    /** Listar todos los audios (para backup). */
    async listAllAudio() {
        await this._ensureDB();
        return this._getAll('audio');
    }

    // ─────────────────────────────────────────
    // ESTADÍSTICAS
    // ─────────────────────────────────────────

    async getStats() {
        await this._ensureDB();
        const images = await this._getAll('images');
        const audio  = await this._getAll('audio');

        const permanentImages = images.filter(i => i.isPermanent);
        const totalImageSize  = permanentImages.reduce((s, i) => s + (i.size || 0), 0);
        const totalAudioSize  = audio.reduce((s, a) => s + (a.size || 0), 0);

        return {
            totalPermanentImages: permanentImages.length,
            totalAudio:           audio.length,
            totalSizeBytes:       totalImageSize + totalAudioSize,
        };
    }

    /** Borrar todo (usado en wipe/logout). */
    async clearAll() {
        await this._ensureDB();
        await this._clear('images');
        await this._clear('audio');
    }

    // ─────────────────────────────────────────
    // CIFRADO AES-GCM (helpers)
    // ─────────────────────────────────────────

    async _encrypt(plaintext) {
        if (!this._key) return plaintext;
        const encoded = JSON.stringify(plaintext);
        return hermesBridge.encryptLocalDatabaseChunk(encoded);
    }

    async _decrypt(base64) {
        if (!this._key) return base64;
        const decryptedStr = hermesBridge.decryptLocalDatabaseChunk(base64);
        return JSON.parse(decryptedStr);
    }

    // ─────────────────────────────────────────
    // HELPERS IndexedDB
    // ─────────────────────────────────────────

    async _ensureDB() {
        if (!this.db) await this.open();
    }

    _put(store, record) {
        return new Promise((resolve, reject) => {
            const tx  = this.db.transaction([store], 'readwrite');
            const req = tx.objectStore(store).put(record);
            req.onsuccess = () => resolve(record);
            req.onerror   = () => reject(req.error);
        });
    }

    _get(store, key) {
        return new Promise((resolve, reject) => {
            const tx  = this.db.transaction([store], 'readonly');
            const req = tx.objectStore(store).get(key);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror   = () => reject(req.error);
        });
    }

    _delete(store, key) {
        return new Promise((resolve, reject) => {
            const tx  = this.db.transaction([store], 'readwrite');
            const req = tx.objectStore(store).delete(key);
            req.onsuccess = () => resolve(true);
            req.onerror   = () => reject(req.error);
        });
    }

    _getAll(store) {
        return new Promise((resolve, reject) => {
            const tx  = this.db.transaction([store], 'readonly');
            const req = tx.objectStore(store).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror   = () => reject(req.error);
        });
    }

    _clear(store) {
        return new Promise((resolve, reject) => {
            const tx  = this.db.transaction([store], 'readwrite');
            const req = tx.objectStore(store).clear();
            req.onsuccess = () => resolve(true);
            req.onerror   = () => reject(req.error);
        });
    }
}
