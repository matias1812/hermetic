// backup_manager.js
import { RecoveryKeyManager } from './recovery_key_manager.js';
import { hermesBridge } from './crypto_wasm_bridge.js';

export class BackupManager {
    /**
     * Sistema de backup/restore CIFRADO v7.2.
     *
     * FLUJO:
     * 1. Usuario ingresa contraseña
     * 2. Se exportan TODOS los datos (contactos, grupos, historial)
     * 3. Se incluyen imágenes permanentes y mensajes de audio de MediaStorage
     * 4. Se COMPRIMEN con GZIP (hasta 10x reducción)
     * 5. Se cifran con AES-256-GCM derivado de contraseña (PBKDF2 600K)
     * 6. Se descarga archivo .hermes (bytes aleatorios sin contraseña)
     * 7. Para restaurar: cargar archivo + ingresar contraseña
     *
     * Formato del índice interno (localStorage):
     *   hermes_backups → [ { id, timestamp, size, totalImages, totalAudio, totalMessages, checksum } ]
     *
     * NOVEDADES v7.2:
     *   - GZIP antes de cifrar (backward compatible con v7.1)
     *   - Vector Clock para control de versiones multi-dispositivo
     *   - Resolución de conflictos (Last-Write-Wins + merge automático)
     *   - Auto-backup periódico (cada 5 min + eventos de cambio)
     */

    constructor(storageManager, mediaStorage = null) {
        this.storage          = storageManager;
        this.mediaStorage     = mediaStorage;
        this.backupIndex      = 'hermes_backups';
        this._autoBackupTimer = null;   // setInterval handle
        this._autoBackupBound = [];     // event listener references
        this._recoveryKey     = null;   // CryptoKey para auto-backup remoto
    }

    // ─────────────────────────────────────────
    // CREAR BACKUP
    // ─────────────────────────────────────────

    async _collectAllData() {
        return {
            version:        '7.2',
            timestamp:      Date.now(),
            vectorClock:    await this._incrementClock(),
            deviceId:       this._getDeviceId(),
            contacts:       await this.storage.load('hermes_contacts'),
            contactData:    await this.storage.load('hermes_contact_data'),
            // EXCLUIR Double Ratchet State por seguridad (evitar desync multi-dispositivo)
            sharedKeys:     {}, 
            groups:         await this.storage.load('hermes_groups'),
            messageHistory: await this.storage.load('hermes_messages'),
            settings:       await this.storage.load('hermes_settings'),
            userKeys:       await this.storage.load('hermes_keys'),
            images:         await this._collectPermanentImages(),
            audio:          await this._collectAudio(),
            checksum: null
        };
    }

    _bufferToHex(buffer) {
        return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('');
    }

    async createBackup(password) {
        /**
         * Crea backup cifrado completo (texto + imágenes permanentes + audio).
         */
        const allData = await this._collectAllData();

        // 2. Calcular checksum
        allData.checksum = await this.calculateChecksum(allData);

        // 3. Cifrar con contraseña
        const encrypted = await this.encryptBackup(allData, password);

        // 4. Calcular metadata para el índice
        const metadata = {
            totalImages:   Object.keys(allData.images).length,
            totalAudio:    Object.keys(allData.audio).length,
            totalMessages: this._countMessages(allData.messageHistory),
            backupSize:    encrypted.byteLength,
        };

        // 5. Registrar en índice
        await this._registerBackup(metadata);

        // 6. Descargar archivo
        this.downloadBackupFile(encrypted);

        return {
            success:  true,
            metadata: metadata,
            message:  `✅ Backup v7.1 creado. ${metadata.totalImages} imágenes, ${metadata.totalAudio} audios, ${metadata.totalMessages} mensajes.`,
        };
    }

    // ─────────────────────────────────────────
    // RESTAURAR BACKUP
    // ─────────────────────────────────────────

    async restoreBackup(file, password) {
        /**
         * Restaura desde archivo de backup cifrado.
         */
        try {
            // 1. Leer archivo
            const encrypted = await this.readFile(file);

            // 2. Descifrar
            const data = await this.decryptBackup(encrypted, password);

            // 3. Verificar checksum
            const calculatedChecksum = await this.calculateChecksum(data);
            if (calculatedChecksum !== data.checksum) {
                throw new Error('Backup corrupto o manipulado');
            }

            // 4. Restaurar datos de texto en storage
            await this.storage.save('hermes_contacts',     data.contacts        || []);
            await this.storage.save('hermes_contact_data', data.contactData     || []);
            await this.storage.save('hermes_shared_keys',  data.sharedKeys      || {});
            await this.storage.save('hermes_groups',       data.groups          || []);
            await this.storage.save('hermes_messages',     data.messageHistory  || {});
            await this.storage.save('hermes_settings',     data.settings        || {});
            await this.storage.save('hermes_keys',         data.userKeys        || null);

            // 5. Restaurar multimedia en IndexedDB (si hay MediaStorage disponible)
            let restoredImages = 0;
            let restoredAudio  = 0;

            if (this.mediaStorage) {
                if (data.images && typeof data.images === 'object') {
                    for (const [id, img] of Object.entries(data.images)) {
                        try {
                            await this.mediaStorage.saveImage({
                                id:           id,
                                base64Data:   img.encryptedData || img.base64Data,
                                mimeType:     img.mimeType,
                                timestamp:    img.timestamp,
                                sender:       img.sender,
                                chatId:       img.chatId,
                                isPermanent:  true,
                                isEphemeral:  false,
                            });
                            restoredImages++;
                        } catch (e) {
                            console.warn(`[BackupManager] Error restaurando imagen ${id}:`, e);
                        }
                    }
                }

                if (data.audio && typeof data.audio === 'object') {
                    for (const [id, aud] of Object.entries(data.audio)) {
                        try {
                            await this.mediaStorage.saveAudio({
                                id:          id,
                                base64Data:  aud.encryptedData || aud.base64Data,
                                duration:    aud.duration,
                                mimeType:    aud.mimeType,
                                timestamp:   aud.timestamp,
                                sender:      aud.sender,
                                chatId:      aud.chatId,
                            });
                            restoredAudio++;
                        } catch (e) {
                            console.warn(`[BackupManager] Error restaurando audio ${id}:`, e);
                        }
                    }
                }
            }

            return {
                success: true,
                message: `✅ Backup restaurado: ${restoredImages} imágenes, ${restoredAudio} audios, mensajes y contactos.`,
            };

        } catch (error) {
            console.error('[BackupManager] Error restoring backup:', error);
            return {
                success: false,
                message: '❌ Contraseña incorrecta o archivo dañado',
            };
        }
    }

    // ─────────────────────────────────────────
    // ÍNDICE DE BACKUPS (localStorage)
    // ─────────────────────────────────────────

    async listBackups() {
        const index = await this._getIndex();
        return index.map(b => ({
            id:            b.id,
            timestamp:     b.timestamp,
            date:          new Date(b.timestamp).toLocaleString(),
            size:          this._formatSize(b.size || 0),
            totalImages:   b.totalImages   || 0,
            totalAudio:    b.totalAudio    || 0,
            totalMessages: b.totalMessages || 0,
            checksum:      b.checksum ? b.checksum.substring(0, 8) + '…' : '—',
        }));
    }

    async deleteBackupFromIndex(backupId) {
        const index   = await this._getIndex();
        const updated = index.filter(b => b.id !== backupId);
        await this._saveIndex(updated);
        return true;
    }

    // ─────────────────────────────────────────
    // CIFRADO / DESCIFRADO
    // ─────────────────────────────────────────

    async encryptBackup(data, password) {
        /**
         * Cifra backup con AES-256-GCM + PBKDF2.
         * v7.2: comprime con GZIP antes de cifrar.
         *
         * Formato del archivo:
         * [1B version_flag] + salt(16B) + iv(12B) + ciphertext + tag(16B)
         *   version_flag: 0x01 = gzip comprimido (v7.2+)
         *                 0x00 = sin compresión (v7.1 legacy)
         *
         * Totalmente indistinguible de bytes aleatorios para un adversario
         * (el flag está cifrado dentro del contenido autenticado).
         */
        return hermesBridge.encryptBackupData(data, password);
    }

    async decryptBackup(encrypted, password) {
        /**
         * Descifra backup.
         * BACKWARD COMPATIBLE: soporta v7.1 (sin gzip) y v7.2+ (con gzip).
         */
        return hermesBridge.decryptBackupData(encrypted, password);
    }

    downloadBackupFile(data) {
        /**
         * Descarga archivo .hermes
         */
        const blob = new Blob([data], { type: 'application/octet-stream' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `hermes_backup_${Date.now()}.hermes`;
        a.click();
        URL.revokeObjectURL(url);
    }

    readFile(file) {
        /**
         * Lee archivo de backup.
         */
        return new Promise((resolve, reject) => {
            const reader    = new FileReader();
            reader.onload   = () => resolve(new Uint8Array(reader.result));
            reader.onerror  = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    async calculateChecksum(data) {
        /**
         * Calcula checksum SHA-256 de los datos (excluye el propio checksum).
         */
        const encoder = new TextEncoder();
        const temp    = { ...data, checksum: null };
        const msgBuffer = encoder.encode(JSON.stringify(temp));
        const hash = await hermesBridge.digest('SHA-256', msgBuffer);
        return Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    // ─────────────────────────────────────────
    // HELPERS PRIVADOS
    // ─────────────────────────────────────────

    async _collectPermanentImages() {
        if (!this.mediaStorage) return {};
        try {
            const images = await this.mediaStorage.listAllPermanentImages();
            const result = {};
            for (const img of images) {
                result[img.id] = {
                    encryptedData: img.encryptedData,
                    mimeType:      img.mimeType,
                    timestamp:     img.timestamp,
                    sender:        img.sender,
                    chatId:        img.chatId,
                };
            }
            return result;
        } catch (e) {
            console.warn('[BackupManager] No se pudieron recolectar imágenes:', e);
            return {};
        }
    }

    async _collectAudio() {
        if (!this.mediaStorage) return {};
        try {
            const audios = await this.mediaStorage.listAllAudio();
            const result = {};
            for (const aud of audios) {
                result[aud.id] = {
                    encryptedData: aud.encryptedData,
                    duration:      aud.duration,
                    mimeType:      aud.mimeType,
                    timestamp:     aud.timestamp,
                    sender:        aud.sender,
                    chatId:        aud.chatId,
                };
            }
            return result;
        } catch (e) {
            console.warn('[BackupManager] No se pudieron recolectar audios:', e);
            return {};
        }
    }

    _countMessages(messageHistory) {
        if (!messageHistory || typeof messageHistory !== 'object') return 0;
        return Object.values(messageHistory).reduce((sum, msgs) => {
            return sum + (Array.isArray(msgs) ? msgs.length : 0);
        }, 0);
    }

    async _registerBackup(metadata) {
        const index = await this._getIndex();
        const entry = {
            id:            `backup_${Date.now()}`,
            timestamp:     Date.now(),
            size:          metadata.backupSize    || 0,
            totalImages:   metadata.totalImages   || 0,
            totalAudio:    metadata.totalAudio    || 0,
            totalMessages: metadata.totalMessages || 0,
            checksum:      await this.calculateChecksum(metadata),
        };
        index.push(entry);

        // Mantener solo los últimos 10 backups en el índice
        const trimmed = index.slice(-10);
        await this._saveIndex(trimmed);
    }

    async _getIndex() {
        try {
            return await this.storage.load(this.backupIndex) || [];
        } catch {
            return [];
        }
    }

    async _saveIndex(index) {
        try {
            await this.storage.save(this.backupIndex, index);
        } catch (e) {
            console.warn('[BackupManager] No se pudo guardar índice de backups:', e);
        }
    }

    _formatSize(bytes) {
        if (bytes < 1024)             return `${bytes} B`;
        if (bytes < 1024 * 1024)      return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    // ─────────────────────────────────────────
    // GZIP COMPRESIÓN (Fase 4)
    // ─────────────────────────────────────────

    /**
     * Comprime bytes con GZIP usando CompressionStream nativo del browser.
     * Disponible en Chrome 80+, Firefox 113+, Safari 16.4+.
     *
     * @param {Uint8Array} data
     * @returns {Promise<Uint8Array>}
     */
    static async _compressGzip(data) {
        try {
            const stream     = new Blob([data]).stream();
            const compressed = stream.pipeThrough(new CompressionStream('gzip'));
            const blob       = await new Response(compressed).blob();
            return new Uint8Array(await blob.arrayBuffer());
        } catch (e) {
            // Fallback: si CompressionStream no está disponible, retornar sin comprimir
            console.warn('[BackupManager] GZIP no disponible, usando sin compresión:', e.message);
            return data;
        }
    }

    /**
     * Descomprime bytes GZIP.
     *
     * @param {Uint8Array} data
     * @returns {Promise<Uint8Array>}
     */
    static async _decompressGzip(data) {
        const stream       = new Blob([data]).stream();
        const decompressed = stream.pipeThrough(new DecompressionStream('gzip'));
        const blob         = await new Response(decompressed).blob();
        return new Uint8Array(await blob.arrayBuffer());
    }

    // ─────────────────────────────────────────
    // VECTOR CLOCK (Fase 2)
    // ─────────────────────────────────────────

    /**
     * Obtiene o genera el ID único de este dispositivo.
     * @returns {string}
     */
    _getDeviceId() {
        let id = localStorage.getItem('_hermes_device_id');
        if (!id) {
            id = crypto.randomUUID();
            localStorage.setItem('_hermes_device_id', id);
        }
        return id;
    }

    /**
     * Carga el Vector Clock actual.
     * @returns {Promise<Record<string, number>>}
     */
    async _getVectorClock() {
        try {
            const raw = await this.storage.load('_hermes_vector_clock');
            return raw || {};
        } catch {
            return {};
        }
    }

    /**
     * Incrementa el contador local del Vector Clock y guarda.
     * @returns {Promise<Record<string, number>>}
     */
    async _incrementClock() {
        const clock    = await this._getVectorClock();
        const deviceId = this._getDeviceId();
        clock[deviceId] = (clock[deviceId] || 0) + 1;
        await this.storage.save('_hermes_vector_clock', clock);
        return { ...clock };
    }

    /**
     * Compara dos vector clocks.
     *
     * @param {Record<string, number>} a
     * @param {Record<string, number>} b
     * @returns {'before'|'after'|'equal'|'concurrent'}
     */
    _compareClocks(a, b) {
        a = a || {};
        b = b || {};
        const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
        let aLeadsInSome = false;
        let bLeadsInSome = false;

        for (const k of allKeys) {
            const va = a[k] || 0;
            const vb = b[k] || 0;
            if (va > vb) aLeadsInSome = true;
            if (vb > va) bLeadsInSome = true;
        }

        if (!aLeadsInSome && !bLeadsInSome) return 'equal';
        if (aLeadsInSome  && !bLeadsInSome) return 'after';   // a es más reciente
        if (!aLeadsInSome && bLeadsInSome)  return 'before';  // b es más reciente
        return 'concurrent'; // Ambos tienen cambios que el otro no tiene
    }

    /**
     * Merge de dos vector clocks (max de cada entry).
     * @param {Record<string, number>} a
     * @param {Record<string, number>} b
     * @returns {Record<string, number>}
     */
    _mergeClocks(a, b) {
        const merged  = {};
        const allKeys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
        for (const k of allKeys) {
            merged[k] = Math.max(a?.[k] || 0, b?.[k] || 0);
        }
        return merged;
    }

    // ─────────────────────────────────────────
    // RESOLUCIÓN DE CONFLICTOS (Fase 3)
    // ─────────────────────────────────────────

    /**
     * Compara y resuelve el conflicto entre estado local y remoto.
     *
     * ESTRATEGIA:
     *   - equal     → mantener local (ya está actualizado)
     *   - after     → subir local (local es más reciente)
     *   - before    → bajar remoto (remoto es más reciente)
     *   - concurrent → merge automático por timestamp (Last-Write-Wins por item)
     *
     * @param {object} localState   - Estado del backup local
     * @param {object} remoteState  - Estado del backup remoto descargado
     * @returns {{ action: string, state: object, conflicts: object[] }}
     */
    resolveConflict(localState, remoteState) {
        const localClock  = localState?.vectorClock  || {};
        const remoteClock = remoteState?.vectorClock || {};
        const comparison  = this._compareClocks(localClock, remoteClock);

        switch (comparison) {
            case 'equal':
                return { action: 'keep_local', state: localState, conflicts: [] };

            case 'after':
                // Local es más reciente → no hay nada que descargar
                return { action: 'upload_local', state: localState, conflicts: [] };

            case 'before':
                // Remoto es más reciente → usar remoto
                return { action: 'use_remote', state: remoteState, conflicts: [] };

            case 'concurrent': {
                // Merge automático — Last-Write-Wins por item individual
                const merged    = this._mergeStates(localState, remoteState);
                const conflicts = this._detectConflicts(localState, remoteState);
                return { action: 'merged', state: merged, conflicts };
            }

            default:
                return { action: 'keep_local', state: localState, conflicts: [] };
        }
    }

    /**
     * Merge de dos estados por Last-Write-Wins (timestamp más reciente gana).
     */
    _mergeStates(local, remote) {
        return {
            ...local,
            contacts:       this._mergeMapsLWW(local.contacts,       remote.contacts),
            groups:         this._mergeMapsLWW(local.groups,         remote.groups),
            sharedKeys:     this._mergeMapsLWW(local.sharedKeys,     remote.sharedKeys),
            images:         this._mergeMapsLWW(local.images,         remote.images),
            audio:          this._mergeMapsLWW(local.audio,          remote.audio),
            vectorClock:    this._mergeClocks(local.vectorClock,     remote.vectorClock),
            timestamp:      Math.max(local.timestamp || 0, remote.timestamp || 0),
            version:        '7.2',
        };
    }

    /**
     * Merge de dos mapas {id → item} con Last-Write-Wins por timestamp.
     * Si un item no tiene timestamp, prevalece el del estado con timestamp general más reciente.
     */
    _mergeMapsLWW(localMap, remoteMap) {
        if (!localMap  && !remoteMap)  return {};
        if (!localMap)  return remoteMap;
        if (!remoteMap) return localMap;

        // Los contactos/grupos pueden ser arrays o objetos según el manager
        if (Array.isArray(localMap) || Array.isArray(remoteMap)) {
            // Para arrays: union sin duplicados por id/alias/pk
            const local  = Array.isArray(localMap)  ? localMap  : Object.values(localMap);
            const remote = Array.isArray(remoteMap) ? remoteMap : Object.values(remoteMap);
            const seen   = new Set();
            const merged = [];
            for (const item of [...local, ...remote]) {
                const key = item?.id || item?.alias || item?.pk || JSON.stringify(item);
                if (!seen.has(key)) { seen.add(key); merged.push(item); }
            }
            return merged;
        }

        // Para objetos: LWW por timestamp
        const merged = { ...localMap };
        for (const [id, remoteItem] of Object.entries(remoteMap)) {
            const localItem = merged[id];
            if (!localItem || (remoteItem?.timestamp || 0) > (localItem?.timestamp || 0)) {
                merged[id] = remoteItem;
            }
        }
        return merged;
    }

    /**
     * Detecta conflictos que el merge automático no pudo resolver sin ambigüedad.
     * @returns {object[]} Lista de conflictos detectados (informativa)
     */
    _detectConflicts(local, remote) {
        const conflicts = [];

        // Detectar grupos con miembros divergentes
        const localGroups  = Array.isArray(local.groups)  ? local.groups  : Object.values(local.groups  || {});
        const remoteGroups = Array.isArray(remote.groups) ? remote.groups : Object.values(remote.groups || {});

        for (const lg of localGroups) {
            const rg = remoteGroups.find(g => g.id === lg.id || g.name === lg.name);
            if (rg && JSON.stringify(lg.members) !== JSON.stringify(rg.members)) {
                conflicts.push({
                    type:       'group_members_diverged',
                    id:         lg.id,
                    name:       lg.name,
                    resolution: 'merged_union',
                });
            }
        }

        return conflicts;
    }

    // ─────────────────────────────────────────
    // AUTO-BACKUP PERIÓDICO (Fase 5)
    // ─────────────────────────────────────────

    /**
     * Inicia el sistema de auto-backup.
     *
     * @param {string}    password   - Contraseña para cifrar los backups locales
     * @param {CryptoKey} [recoveryKey] - CryptoKey opcional para backup remoto cifrado con mnemónica
     */
    startAutoBackup(password, recoveryKey = null) {
        if (this._autoBackupTimer) return; // Ya activo

        this._recoveryKey = recoveryKey;

        // Backup inmediato
        this._doAutoBackup(password).catch(e =>
            console.warn('[BackupManager] Auto-backup inicial falló:', e)
        );

        // Backup cada 5 minutos
        this._autoBackupTimer = setInterval(() => {
            this._doAutoBackup(password).catch(e =>
                console.warn('[BackupManager] Auto-backup periódico falló:', e)
            );
        }, 5 * 60 * 1000);

        // Backup en cambios de contactos
        const onContacts = () => this._doAutoBackup(password).catch(() => {});
        const onGroups   = () => this._doAutoBackup(password).catch(() => {});

        document.addEventListener('hermes:contacts_updated', onContacts);
        document.addEventListener('hermes:groups_updated',   onGroups);

        this._autoBackupBound = [
            { event: 'hermes:contacts_updated', fn: onContacts },
            { event: 'hermes:groups_updated',   fn: onGroups },
        ];

        console.log('[BackupManager] Auto-backup iniciado (cada 5 min + eventos de cambio)');
    }

    /**
     * Detiene el auto-backup y limpia listeners.
     */
    stopAutoBackup() {
        if (this._autoBackupTimer) {
            clearInterval(this._autoBackupTimer);
            this._autoBackupTimer = null;
        }
        for (const { event, fn } of this._autoBackupBound) {
            document.removeEventListener(event, fn);
        }
        this._autoBackupBound = [];
        this._recoveryKey     = null;
        console.log('[BackupManager] Auto-backup detenido');
    }

    /**
     * Ejecuta un backup automático (silencioso, sin descarga de archivo).
     * Actualiza el índice local y opcionalmente sube al servidor con recovery key.
     *
     * @param {string} password
     */
    async _doAutoBackup(password) {
        try {
            // 1. Recolectar estado actual
            const allData = {
                version:        '7.2',
                timestamp:      Date.now(),
                vectorClock:    await this._incrementClock(),
                deviceId:       this._getDeviceId(),
                contacts:       await this.storage.load('hermes_contacts'),
                contactData:    await this.storage.load('hermes_contact_data'),
                sharedKeys:     await this.storage.load('hermes_shared_keys'),
                groups:         await this.storage.load('hermes_groups'),
                messageHistory: await this.storage.load('hermes_messages'),
                settings:       await this.storage.load('hermes_settings'),
                userKeys:       await this.storage.load('hermes_keys'),
                images:         {},  // Auto-backup omite multimedia (demasiado grande)
                audio:          {},
                checksum:       null,
            };

            allData.checksum = await this.calculateChecksum(allData);

            // 2. Si hay recovery key → cifrar y subir al servidor (remoto)
            if (this._recoveryKey) {
                const jsonBytes  = new TextEncoder().encode(JSON.stringify(allData));
                const compressed = await BackupManager._compressGzip(jsonBytes);
                const encrypted  = await RecoveryKeyManager.encryptWithRecoveryKey(
                    this._recoveryKey, compressed
                );

                // Subir al endpoint de recovery blobs
                await fetch('/api/recovery_blob', {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({
                        userHash:    this.storage.getUserId(),
                        blob:        encrypted,
                        vectorClock: allData.vectorClock,
                        timestamp:   allData.timestamp,
                        version:     '7.2',
                    }),
                }).catch(e => console.warn('[BackupManager] Upload remoto falló:', e.message));
            }

            // 3. Registrar en índice local
            const metadata = {
                backupSize:    0,  // Sin archivo descargado
                totalImages:   0,
                totalAudio:    0,
                totalMessages: this._countMessages(allData.messageHistory),
            };
            await this._registerBackup(metadata);

        } catch (e) {
            console.warn('[BackupManager] _doAutoBackup error:', e);
        }
    }
}
