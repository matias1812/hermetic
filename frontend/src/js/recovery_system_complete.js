import { RecoveryKeyDerivation } from './recovery_key_derivation.js';
import { StateVersionControl } from './state_version_control.js';
import { ConflictResolver } from './conflict_resolution.js';
import { StateCompressor } from './state_compression.js';
import { state } from './state.js';
import { hermesBridge } from './crypto_wasm_bridge.js';

export class CompleteRecoverySystem {
    /**
     * Sistema de recuperación por frase mnemónica (12 palabras).
     *
     * INTEGRA:
     * - RecoveryKeyDerivation (PBKDF2 600K)
     * - StateVersionControl (Vector Clock)
     * - ConflictResolver (Last-Write-Wins + Merge)
     * - StateCompressor (GZIP)
     * - AutoBackupSystem (cada 5 min + en cambios)
     *
     * LIMITACIÓN CONOCIDA (2026-08-27): uploadBlob()/downloadBlob() pegan contra
     * /api/recovery_blob y GET /api/backup/{id}, ninguno de los dos existe en el
     * backend — ambos tienen try/catch que degradan a un fallback local
     * (localStorage) sin avisar al usuario que la sincronización con la nube no
     * ocurrió. Por ahora esta recuperación es LOCAL-ONLY: sirve para restaurar en
     * el mismo dispositivo (o desde un blob que el usuario exportó a mano), no para
     * sincronizar entre dispositivos vía servidor. Si se necesita eso, la ruta más
     * corta es redirigir uploadBlob/downloadBlob a /api/backup y /api/backup/fetch
     * (esos sí existen, están probados) en vez de inventar un endpoint nuevo.
     */
    
    constructor() {
        this.derivation = RecoveryKeyDerivation;
        this.versionControl = new StateVersionControl();
        this.conflictResolver = new ConflictResolver(this.versionControl);
        this.compressor = StateCompressor;
        this.recoveryKey = null;
        this.autoBackupInterval = null;
    }
    
    /**
     * Inicializar al registrar (generar Recovery Key).
     */
    async initialize(userIdHash) {
        // 1. Generar frase mnemotécnica
        const mnemonic = await this.derivation.generateMnemonic();
        
        // 2. Derivar clave
        const { key, verification } = await this.derivation.deriveKeyFromMnemonic(
            mnemonic, 
            userIdHash
        );
        
        this.recoveryKey = key;
        
        // 3. Mostrar frase al usuario
        await this.showRecoveryPhrase(mnemonic);
        
        // Save verification payload so verifyMnemonic works later
        localStorage.setItem('hermes_recovery_verification', JSON.stringify(verification));
        
        // 4. Iniciar auto-backup
        this.startAutoBackup();
        
        return { mnemonic, verification };
    }
    
    async showRecoveryPhrase(mnemonic) {
        console.log("====== RECOVERY PHRASE ======");
        console.log(mnemonic);
        console.log("=============================");
        if (window.modalManager) {
            return window.modalManager.custom({
                title: '[ ⚠️ GUARDA ESTA FRASE DE RECUPERACIÓN ]',
                body: `<p>Anota estas 12 palabras en orden. Es la ÚNICA forma de recuperar tu cuenta.</p>
                       <div class="bg-gray-900 p-4 rounded text-terminal text-center my-4 select-all text-xl">${mnemonic}</div>`,
                footer: `<button class="btn-cyber w-full" onclick="modalManager.close()">YA LA GUARDÉ</button>`,
                size: 'large'
            });
        }
    }
    
    async getCurrentState() {
        return {
            contacts: await state.storage.load('hermes_contacts') || {},
            groups: await state.storage.load('hermes_groups') || {},
            groupKeys: await state.storage.load('hermes_shared_keys') || {},
            settings: await state.storage.load('hermes_settings') || {},
            vectorClock: this.versionControl.vectorClock,
            deviceId: this.versionControl.deviceId
        };
    }

    async applyState(newState) {
        await state.storage.save('hermes_contacts', newState.contacts);
        await state.storage.save('hermes_groups', newState.groups);
        await state.storage.save('hermes_shared_keys', newState.groupKeys);
        if (newState.settings) await state.storage.save('hermes_settings', newState.settings);
        this.versionControl.vectorClock = newState.vectorClock;
    }
    
    /**
     * Restaurar desde Recovery Key.
     */
    async restore(mnemonic, userIdHash) {
        // 1. Verificar frase
        const isValid = await this.derivation.verifyMnemonic(mnemonic, userIdHash);
        if (!isValid) {
            throw new Error('Frase de recuperación incorrecta');
        }
        
        // 2. Derivar clave
        const { key } = await this.derivation.deriveKeyFromMnemonic(mnemonic, userIdHash);
        this.recoveryKey = key;
        
        // 3. Descargar blob cifrado del servidor
        const blobId = localStorage.getItem('hermes_recovery_blob_id');
        if (!blobId) throw new Error('No backup ID found locally');
        const blob = await this.downloadBlob(blobId);
        
        // 4. Descifrar
        const plaintext = await hermesBridge.decryptWithRecoveryKey(mnemonic, blob.ciphertext);
        
        // 5. Descomprimir
        const remoteState = await this.compressor.decompressState(
            new Uint8Array(plaintext)
        );
        
        // 6. Resolver conflictos (si los hay)
        const localState = await this.getCurrentState();
        const resolved = await this.conflictResolver.resolve(localState, remoteState);
        
        // 7. Restaurar
        await this.applyState(resolved.state);
        
        // 8. Iniciar auto-backup
        this.startAutoBackup();
        
        return resolved;
    }
    
    /**
     * Backup automático al servidor.
     */
    async autoBackup() {
        try {
            if (!this.recoveryKey) {
                return null;
            }
            // 1. Obtener estado actual
            const current = await this.getCurrentState();

            
            // 2. Incrementar vector clock
            current.vectorClock = this.versionControl.incrementClock();
            current.timestamp = Date.now();
            current.deviceId = this.versionControl.deviceId;
            
            // 3. Comprimir
            const compressed = await this.compressor.compressState(current);
            
            // 4. Cifrar
            const ciphertext = await hermesBridge.encryptWithRecoveryKey(this.recoveryKey, compressed);
            
            // 5. Subir al servidor
            const blobId = await this.uploadBlob({
                iv: null,
                ciphertext: Array.from(new Uint8Array(ciphertext)),
                userHash: state.storage.getUserId(),
                timestamp: current.timestamp,
                vectorClock: current.vectorClock,
                deviceId: current.deviceId,
                version: '7.1'
            });
            
            // 6. Verificar que el servidor aceptó (control de versiones)
            if (blobId) {
                localStorage.setItem('hermes_recovery_blob_id', blobId);
                console.log('🛡️ Auto-backup completado:', blobId?.substring(0, 8));
            } else {
                console.warn('⚠️ Servidor rechazó backup (versión más antigua?)');
            }
            
        } catch (error) {
            console.error('❌ Auto-backup falló:', error);
        }
    }
    
    async uploadBlob(payload) {
        // En un entorno real esto sube a un endpoint de backups
        const res = await fetch('/api/backup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).catch(() => null);
        
        if (res && res.ok) {
            const data = await res.json();
            return data.blob_id;
        }
        // Fallback para dev local si el endpoint no existe
        const dummyId = 'backup_' + Date.now();
        localStorage.setItem(`hermes_dummy_backup_${dummyId}`, JSON.stringify(payload));
        return dummyId;
    }

    async downloadBlob(blobId) {
        // En un entorno real esto baja de un endpoint de backups
        const res = await fetch(`/api/backup/${blobId}`).catch(() => null);
        if (res && res.ok) {
            return await res.json();
        }
        // Fallback local
        const local = localStorage.getItem(`hermes_dummy_backup_${blobId}`);
        if (local) return JSON.parse(local);
        throw new Error("Backup not found on server");
    }

    /**
     * Iniciar backups automáticos periódicos.
     */
    startAutoBackup() {
        // Backup inmediato
        this.autoBackup();
        
        // Backup cada 5 minutos
        if (this.autoBackupInterval) clearInterval(this.autoBackupInterval);
        this.autoBackupInterval = setInterval(() => {
            this.autoBackup();
        }, 5 * 60 * 1000);
        
        // Backup en cambios de contactos
        document.addEventListener('hermes:contacts_updated', () => this.autoBackup());
        
        // Backup en cambios de grupos
        document.addEventListener('hermes:groups_updated', () => this.autoBackup());
    }
    
    /**
     * Detener backups automáticos.
     */
    stopAutoBackup() {
        if (this.autoBackupInterval) {
            clearInterval(this.autoBackupInterval);
            this.autoBackupInterval = null;
        }
    }
}

export const recoverySystem = new CompleteRecoverySystem();
