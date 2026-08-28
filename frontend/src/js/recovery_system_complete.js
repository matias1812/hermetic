import { RecoveryKeyDerivation } from './recovery_key_derivation.js';
import { StateVersionControl } from './state_version_control.js';
import { ConflictResolver } from './conflict_resolution.js';
import { StateCompressor } from './state_compression.js';
import { state } from './state.js';
import { hermesBridge } from './crypto_wasm_bridge.js';
import { CryptoClient } from './crypto_client.js';

function bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
function hexToBytes(hex) {
    return new Uint8Array((hex || '').match(/.{1,2}/g)?.map(b => parseInt(b, 16)) || []);
}
function getSessionAuthHeaders() {
    const token = sessionStorage.getItem('hermes_session_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
}

export class CompleteRecoverySystem {
    /**
     * Sistema de recuperación por frase mnemónica (12 palabras).
     *
     * INTEGRA:
     * - RecoveryKeyDerivation (HKDF-SHA256 vía WASM, namespaced por user_id_hash)
     * - StateVersionControl (Vector Clock)
     * - ConflictResolver (Last-Write-Wins + Merge)
     * - StateCompressor (GZIP)
     * - AutoBackupSystem (cada 5 min + en cambios)
     *
     * Zero-knowledge: el servidor solo guarda el "proof" derivado (HKDF, info
     * label distinto de la clave de cifrado) y el blob ya cifrado — nunca la
     * mnemónica ni la clave que descifra el backup. Eso es lo que permite
     * /api/recovery/fetch autenticar una recuperación SIN sesión previa (caso
     * "perdí el dispositivo"), ver restorePreAuth().
     */

    constructor() {
        this.derivation = RecoveryKeyDerivation;
        this.versionControl = new StateVersionControl();
        this.conflictResolver = new ConflictResolver(this.versionControl);
        this.compressor = StateCompressor;
        this.mnemonic = null;
        this.userIdHash = null;
        this.recoveryKey = null; // flag: true una vez que hay mnemonic+userIdHash listos para autoBackup
        this.autoBackupInterval = null;
    }

    /**
     * Inicializar al registrar (generar la frase y registrar su proof en el
     * servidor). Lanza si el registro del proof falla — sin eso, la frase
     * mostrada al usuario nunca podría usarse para recuperar la cuenta, así
     * que no es aceptable degradar en silencio (ver auth_ui.js, que bloquea
     * el registro si esto lanza).
     */
    async initialize(userIdHash) {
        // 1. Generar frase mnemotécnica
        const mnemonic = await this.derivation.generateMnemonic();

        // 2. Crear marcador de verificación local (namespaced por usuario)
        await this.derivation.createVerificationMarker(mnemonic, userIdHash);

        // 3. Mostrar frase al usuario
        await this.showRecoveryPhrase(mnemonic);

        // 4. Registrar el proof en el servidor — sin esto /api/recovery/fetch
        // nunca podrá autenticar una recuperación futura con esta frase.
        const proofHex = await this.derivation.deriveProof(mnemonic, userIdHash);
        await this.registerRecoveryProof(userIdHash, proofHex);

        this.mnemonic = mnemonic;
        this.userIdHash = userIdHash;
        this.recoveryKey = true;

        // 5. Iniciar auto-backup
        this.startAutoBackup();

        return { mnemonic };
    }

    async registerRecoveryProof(userIdHash, proofHex) {
        const res = await fetch('/api/recovery/register-proof', {
            method: 'POST',
            headers: getSessionAuthHeaders(),
            body: JSON.stringify({ user_hash: userIdHash, proof_hex: proofHex })
        });
        if (!res.ok) {
            throw new Error('El servidor rechazó el registro de recuperación (status ' + res.status + ')');
        }
    }
    
    async showRecoveryPhrase(mnemonic) {
        if (!window.modalManager) {
            throw new Error('No se pudo mostrar el modal de la frase de recuperación (modalManager no disponible)');
        }
        const confirmed = await window.modalManager.mandatoryRecoveryPhrase(mnemonic);
        if (!confirmed) {
            throw new Error('Confirmación de la frase de recuperación cancelada');
        }
    }
    
    async getCurrentState() {
        return {
            contacts: await state.storage.load('hermes_contacts') || {},
            groups: await state.storage.load('hermes_groups') || {},
            groupKeys: await state.storage.load('hermes_shared_keys') || {},
            settings: await state.storage.load('hermes_settings') || {},
            keys: await state.storage.load('hermes_keys') || null,
            vectorClock: this.versionControl.vectorClock,
            deviceId: this.versionControl.deviceId
        };
    }

    async applyState(newState) {
        await state.storage.save('hermes_contacts', newState.contacts);
        await state.storage.save('hermes_groups', newState.groups);
        await state.storage.save('hermes_shared_keys', newState.groupKeys);
        if (newState.settings) await state.storage.save('hermes_settings', newState.settings);
        if (newState.keys) await state.storage.save('hermes_keys', newState.keys);
        this.versionControl.vectorClock = newState.vectorClock;
    }

    /**
     * Restaurar desde Recovery Key con sesión YA activa (importar un backup
     * más nuevo/de otro dispositivo mientras la cuenta sigue logueada acá).
     * Para el caso "perdí el dispositivo y no tengo sesión", ver restorePreAuth().
     */
    async restore(mnemonic, userIdHash) {
        const normalized = (mnemonic || '').toLowerCase().trim().replace(/\s+/g, ' ');

        // 1. Verificar frase contra el marcador local
        const isValid = await this.derivation.verifyMnemonic(normalized, userIdHash);
        if (!isValid) {
            throw new Error('Frase de recuperación incorrecta');
        }

        this.mnemonic = normalized;
        this.userIdHash = userIdHash;
        this.recoveryKey = true;

        // 2. Descargar el backup más reciente (sesión activa → /api/backup/fetch)
        const blob = await this.downloadBlob('latest');

        // 3. Descifrar
        const plaintext = await hermesBridge.decryptWithRecoveryKey(
            normalized, userIdHash, new Uint8Array(blob.ciphertext)
        );

        // 4. Descomprimir
        const remoteState = await this.compressor.decompressState(
            new Uint8Array(plaintext)
        );

        // 5. Resolver conflictos (si los hay)
        const localState = await this.getCurrentState();
        const resolved = await this.conflictResolver.resolve(localState, remoteState);

        // 6. Restaurar
        await this.applyState(resolved.state);

        // 7. Iniciar auto-backup
        this.startAutoBackup();

        return resolved;
    }

    /**
     * Restaurar SIN sesión previa ("perdí el dispositivo"): autentica ante
     * /api/recovery/fetch con el proof derivado de las 12 palabras (el
     * servidor nunca ve la mnemónica). Devuelve el estado descifrado en vez
     * de aplicarlo directamente — quien llama (auth_ui.js) todavía tiene que
     * crear una vault local nueva (setUserId + unlock con una contraseña
     * nueva) antes de poder guardar nada en state.storage.
     */
    async restorePreAuth(mnemonic, userIdHash) {
        const normalized = (mnemonic || '').toLowerCase().trim().replace(/\s+/g, ' ');
        if (normalized.split(' ').length < 12) {
            throw new Error('Se requieren las 12 palabras completas');
        }

        const proofHex = await this.derivation.deriveProof(normalized, userIdHash);

        const res = await fetch('/api/recovery/fetch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id_hash: userIdHash, proof_hex: proofHex })
        });
        if (!res.ok) {
            if (res.status === 401) throw new Error('Frase de recuperación incorrecta');
            if (res.status === 429) throw new Error('Demasiados intentos, espera unos minutos');
            throw new Error('No se pudo contactar al servidor de recuperación');
        }

        const { backups } = await res.json();
        if (!backups || backups.length === 0) {
            throw new Error('Esta cuenta no tiene respaldos de recuperación guardados');
        }
        const latest = backups[backups.length - 1];
        const ciphertext = hexToBytes(latest.encrypted_data);

        const plaintext = await hermesBridge.decryptWithRecoveryKey(normalized, userIdHash, ciphertext);
        const remoteState = await this.compressor.decompressState(new Uint8Array(plaintext));

        this.mnemonic = normalized;
        this.userIdHash = userIdHash;
        this.recoveryKey = true;

        return remoteState;
    }
    
    /**
     * Backup automático al servidor.
     */
    async autoBackup() {
        try {
            if (!this.mnemonic || !this.userIdHash) {
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
            const ciphertext = await hermesBridge.encryptWithRecoveryKey(this.mnemonic, this.userIdHash, compressed);

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
        // Usa /api/backup real (mismo endpoint que backup_manager.js/auto_backup_trigger.js),
        // no un /api/recovery_blob aparte que nunca existió en el backend.
        const userHash = payload.userHash || state.storage.getUserId();
        const timestamp = Math.floor(Date.now() / 1000);
        const backupId = crypto.randomUUID();

        try {
            const signature = await CryptoClient.signTimestamp(timestamp, state.userKeys?.sphincs_sk);
            const res = await fetch('/api/backup', {
                method: 'POST',
                headers: getSessionAuthHeaders(),
                body: JSON.stringify({
                    user_hash: userHash,
                    encrypted_data_hex: bytesToHex(payload.ciphertext || []),
                    backup_id: backupId,
                    backup_type: 'recovery',
                    parent_id: null,
                    timestamp,
                    signature,
                    version: 1,
                    algorithm: 'AES-GCM/RecoveryKey',
                })
            });
            if (res.ok) return backupId;
            console.warn('[Recovery] El servidor rechazó el backup:', res.status);
        } catch (e) {
            console.warn('[Recovery] No se pudo subir el backup a la nube:', e);
        }
        // Fallback local si el servidor no está disponible (mismo dispositivo únicamente)
        localStorage.setItem(`hermes_dummy_backup_${backupId}`, JSON.stringify(payload));
        return backupId;
    }

    async downloadBlob(blobId) {
        // Usa /api/backup/fetch real. Ese endpoint devuelve TODOS los backups del
        // usuario (no hay lookup por ID individual en el backend) — si blobId no
        // coincide con ninguno (o es 'latest'), toma el más reciente.
        try {
            const userHash = state.storage.getUserId();
            const timestamp = Math.floor(Date.now() / 1000);
            const signature = await CryptoClient.signTimestamp(timestamp, state.userKeys?.sphincs_sk);
            const res = await fetch('/api/backup/fetch', {
                method: 'POST',
                headers: getSessionAuthHeaders(),
                body: JSON.stringify({ user_hash: userHash, timestamp, signature })
            });
            if (res.ok) {
                const { backups } = await res.json();
                if (backups && backups.length > 0) {
                    const match = (blobId && blobId !== 'latest')
                        ? backups.find(b => b.backup_id === blobId)
                        : backups[backups.length - 1];
                    if (match) {
                        return { ciphertext: Array.from(hexToBytes(match.encrypted_data)) };
                    }
                }
            }
        } catch (e) {
            console.warn('[Recovery] No se pudo bajar el backup de la nube:', e);
        }
        // Fallback local (mismo dispositivo que hizo el backup)
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
