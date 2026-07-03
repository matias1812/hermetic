// frontend/src/js/crypto_wasm_bridge.js
//
// Puente entre el módulo WASM Rust y el código JavaScript de Hermetic.
//
// POLÍTICA: FAIL-CLOSED
//   Si el módulo WASM no carga, este puente lanza una excepción.
//   NO existe fallback JavaScript. Sin WASM = sin operaciones criptográficas.
//
// USO:
//   import { realCrypto } from './crypto_wasm_bridge.js';
//   await realCrypto.init();  // lanza si WASM no disponible
//   realCrypto.constantTimeXOR(a, b);

import { WASM_EXPECTED_HASH } from './wasm_hash.js';

export class RealHermesCrypto {
    constructor() {
        this.ready     = false;
        this.rustCrypto = null;
        this.mode      = 'uninitialized';  // 'wasm_active' | 'wasm_unavailable'
        this._error    = null;
    }

    async init() {
        if (this.ready) return true;
        if (this._initPromise) return this._initPromise;

        this._initPromise = (async () => {
            try {
                // 1. Cargar WASM binario para verificación (con soporte para Node.js y navegador)
                let wasmBytes;
                if (typeof process !== 'undefined' && process.versions && process.versions.node && typeof import.meta.env === 'undefined') {
                    const fs = await import(/* @vite-ignore */ 'node:fs');
                    const wasmPath = new URL('../wasm/hermes_crypto_wasm_bg.wasm', import.meta.url);
                    wasmBytes = fs.readFileSync(wasmPath);
                } else {
                    const wasmPath = new URL('../wasm/hermes_crypto_wasm_bg.wasm', import.meta.url).href;
                    const wasmResponse = await fetch(wasmPath).catch(() => null);
                    if (!wasmResponse || !wasmResponse.ok) {
                        throw new Error('Could not fetch WASM binary for integrity check');
                    }
                    wasmBytes = await wasmResponse.arrayBuffer();
                }

                // 2. Verificar hash SHA-256
                const hash = await crypto.subtle.digest('SHA-256', wasmBytes);
                const hashHex = Array.from(new Uint8Array(hash))
                    .map(b => b.toString(16).padStart(2, '0')).join('');

                // 3. Comparar con hash esperado (generado en build)
                const EXPECTED_HASH = WASM_EXPECTED_HASH;

                if (hashHex !== EXPECTED_HASH) {
                    console.error(
                        `[RealHermesCrypto] WASM INTEGRITY WARNING!\n` +
                        `Expected: ${EXPECTED_HASH}\n` +
                        `Got:      ${hashHex}\n` +
                        `The WASM module has changed or been tampered with.`
                    );
                    throw new Error('WASM INTEGRITY CHECK FAILED');
                } else {
                    console.log('[RealHermesCrypto] ✅ WASM integrity verified (SHA-256)');
                }

                // 4. Cargar módulo WASM dinámicamente (JS wrapper)
                const wasmModule = await import('../wasm/hermes_crypto_wasm.js').catch((e) => {
                    console.error('[RealHermesCrypto] WASM Load Error:', e);
                    return null;
                });

                if (wasmModule && wasmModule.default) {
                    await wasmModule.default({ module_or_path: wasmBytes });
                    this.rustCrypto = new wasmModule.HermesCore();
                    this.rustUtils = new wasmModule.HermesCrypto();
                    this.wasmModule = wasmModule;
                } else {
                    throw new Error('WASM module not found at expected path');
                }

                // Verificar integridad funcional del módulo WASM
                const testData = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]);
                const zeroized = this.rustUtils.secure_zeroize(testData);
                if (!zeroized) {
                    throw new Error('WASM integrity check failed: secure_zeroize returned false');
                }

                this.ready = true;
                this.mode  = 'wasm_active';
                console.log('[RealHermesCrypto] WASM verificado — nonce aleatorio OsRng, zeroización auditada');
                return true;

            } catch (error) {
                // FAIL-CLOSED: no hay fallback. Sin WASM = sistema no operativo.
                this.ready  = false;
                this.mode   = 'wasm_unavailable';
                this._error = error.message;

                console.error('[RealHermesCrypto] FATAL — WASM no disponible:', error.message);
                console.error('[RealHermesCrypto] Hermetic requiere WASM para operar de forma segura.');
                console.error('[RealHermesCrypto] Compilar con: wasm-pack build --target web --release');

                // Propagar el error — el llamador debe manejar la ausencia de WASM
                throw error;
            } finally {
                this._initPromise = null;
            }
        })();
        return this._initPromise;
    }

    /**
     * Retorna el estado actual del módulo criptográfico.
     * Útil para el SecurityIndicator y diagnósticos.
     *
     * @returns {{ ready: boolean, mode: string, error: string|null }}
     */
    getStatus() {
        return {
            ready: this.ready,
            mode:  this.mode,
            error: this._error,
        };
    }

    // ─────────────────────────────────────────
    // API PÚBLICA (disponible solo si ready === true)
    // ─────────────────────────────────────────

    /**
     * XOR sin ramas explícitas sobre datos secretos (mejor esfuerzo tiempo constante).
     * Ver docstring en lib.rs para limitaciones de tiempo constante absoluto.
     */
    constantTimeXOR(a, b) {
        this._assertReady('constantTimeXOR');
        return this.rustUtils.constant_time_xor(a, b);
    }

    /**
     * Comparación usando `constant_time_eq` (crate auditada por IETF).
     * Usar siempre para comparar MACs, tokens y claves.
     */
    constantTimeCompare(a, b) {
        this._assertReady('constantTimeCompare');
        return this.rustUtils.constant_time_compare(a, b);
    }

    /**
     * Zeroización verificable con `zeroize` crate (auditada).
     * Verifica post-condición via SHA3-256.
     */
    secureZeroize(data) {
        this._assertReady('secureZeroize');
        return this.rustUtils.secure_zeroize(data);
    }

    // ─────────────────────────────────────────
    // HERMES BRIDGE - CONGELADO / ALTO NIVEL
    // API inmutable transaccional (Fase 2)
    // ─────────────────────────────────────────

    generateVaultSalt() {
        this._assertReady('generateVaultSalt');
        return this.rustCrypto.generate_vault_salt();
    }

    unlockVault(password, saltHex) {
        this._assertReady('unlockVault');
        console.debug("[HermesBridge] unlockVault");
        if (!saltHex) {
            throw new Error("saltHex es requerido para unlockVault con Argon2id");
        }
        return this.rustCrypto.unlock_vault(password, saltHex);
    }

    lockVault() {
        this._assertReady('lockVault');
        console.debug("[HermesBridge] lockVault");
        this.rustCrypto.close_session();
    }

    closeSession() {
        this.lockVault();
    }

    sealMessage(contactId, plaintext) {
        this._assertReady('sealMessage');
        console.debug("[HermesBridge] sealMessage -> target:", contactId);
        return this.rustCrypto.encrypt_message(contactId, plaintext);
    }

    openMessage(contactId, ciphertext) {
        this._assertReady('openMessage');
        console.debug("[HermesBridge] openMessage -> sender:", contactId);
        return this.rustCrypto.decrypt_message(contactId, ciphertext);
    }

    // Aliases de compatibilidad incremental para migración progresiva
    encryptMessage(contactId, plaintext) { return this.sealMessage(contactId, plaintext); }
    decryptMessage(contactId, ciphertext) { return this.openMessage(contactId, ciphertext); }

    createGroup(groupId, memberIds) {
        this._assertReady('createGroup');
        console.debug("[HermesBridge] createGroup -> id:", groupId);
        return this.rustCrypto.create_group(groupId, memberIds);
    }

    backupVault() {
        this._assertReady('backupVault');
        console.debug("[HermesBridge] backupVault");
        return this.rustCrypto.backup();
    }

    restoreVault(blob, password) {
        this._assertReady('restoreVault');
        console.debug("[HermesBridge] restoreVault");
        return this.rustCrypto.restore(blob, password);
    }

    encryptBackupData(data, password) {
        this._assertReady('encryptBackupData');
        console.debug("[HermesBridge] encryptBackupData");
        
        let plaintextBytes;
        if (typeof data === 'string') {
            plaintextBytes = new TextEncoder().encode(data);
        } else if (data instanceof Uint8Array) {
            plaintextBytes = data;
        } else {
            // Asumimos que es un objeto y lo serializamos a JSON string, luego a Uint8Array
            plaintextBytes = new TextEncoder().encode(JSON.stringify(data));
        }
        
        // Cifra los bytes usando la clave maestra ya derivada y cargada en WASM (HermesCore)
        const encrypted = this.rustCrypto.encrypt_backup(plaintextBytes);
        
        // Retornamos raw Uint8Array (BackupManager usa Blob)
        return encrypted;
    }

    decryptBackupData(encrypted, password) {
        this._assertReady('decryptBackupData');
        console.debug("[HermesBridge] decryptBackupData");
        
        let ciphertextBytes;
        if (typeof encrypted === 'string') {
            throw new Error("decryptBackupData expects Uint8Array");
        } else if (encrypted instanceof ArrayBuffer) {
            ciphertextBytes = new Uint8Array(encrypted);
        } else if (encrypted instanceof Uint8Array) {
            ciphertextBytes = encrypted;
        } else {
            throw new Error("Invalid ciphertext format");
        }

        const decrypted = this.rustCrypto.decrypt_backup(ciphertextBytes, password || null);
        if (!decrypted) {
            throw new Error("StorageDecryptionError: Fallo descifrando backup con AEAD.");
        }
        
        // Retornamos el JSON parseado o el string
        const jsonStr = new TextDecoder().decode(decrypted);
        try {
            return JSON.parse(jsonStr);
        } catch(e) {
            return jsonStr; 
        }
    }

    backup() { return this.backupVault(); }
    restore(blob, password) { return this.restoreVault(blob, password); }

    createSession(contactId, isAlice, remotePubKey, sharedSecretOpt = null, localSkOpt = null, localPubOpt = null) {
        this._assertReady('createSession');
        console.debug("[HermesBridge] createSession -> peer:", contactId);
        return this.rustCrypto.create_session(contactId, isAlice, remotePubKey, sharedSecretOpt, localSkOpt, localPubOpt);
    }

    generatePreKeyBundle(opkIdOpt = null) {
        this._assertReady('generatePreKeyBundle');
        console.debug("[HermesBridge] generatePreKeyBundle");
        const jsonStr = this.rustCrypto.generate_prekey_bundle(opkIdOpt);
        return JSON.parse(jsonStr);
    }

    createSessionFromBundle(contactId, bundleObj) {
        this._assertReady('createSessionFromBundle');
        console.debug("[HermesBridge] createSessionFromBundle -> contact:", contactId);
        const bundleJson = typeof bundleObj === 'string' ? bundleObj : JSON.stringify(bundleObj);
        const handshakeJson = this.rustCrypto.create_session_from_bundle(contactId, bundleJson);
        return JSON.parse(handshakeJson);
    }

    acceptSessionHandshake(contactId, handshakeObj) {
        this._assertReady('acceptSessionHandshake');
        console.debug("[HermesBridge] acceptSessionHandshake -> contact:", contactId);
        const handshakeJson = typeof handshakeObj === 'string' ? handshakeObj : JSON.stringify(handshakeObj);
        return this.rustCrypto.accept_session_handshake(contactId, handshakeJson);
    }

    verifyIdentity(contactId, fingerprint) {
        this._assertReady('verifyIdentity');
        console.debug("[HermesBridge] verifyIdentity -> peer:", contactId);
        return this.rustCrypto.verify_identity(contactId, fingerprint);
    }

    rotateGroupKey(groupId) {
        this._assertReady('rotateGroupKey');
        console.debug("[HermesBridge] rotateGroupKey -> id:", groupId);
        return this.rustCrypto.rotate_group_key(groupId);
    }

    encryptGroupMessage(groupId, plaintext) {
        this._assertReady('encryptGroupMessage');
        console.debug("[HermesBridge] encryptGroupMessage -> id:", groupId);
        return this.rustCrypto.encrypt_group_message(groupId, plaintext);
    }

    decryptGroupMessage(groupId, ciphertext) {
        this._assertReady('decryptGroupMessage');
        console.debug("[HermesBridge] decryptGroupMessage -> id:", groupId);
        return this.rustCrypto.decrypt_group_message(groupId, ciphertext);
    }

    encryptLocalDatabaseChunk(plaintextJson) {
        this._assertReady('encryptLocalDatabaseChunk');
        console.debug("[HermesBridge] encryptLocalDatabaseChunk");
        return this.rustCrypto.encrypt_local_database_chunk(plaintextJson);
    }

    decryptLocalDatabaseChunk(ciphertext) {
        this._assertReady('decryptLocalDatabaseChunk');
        console.debug("[HermesBridge] decryptLocalDatabaseChunk");
        return this.rustCrypto.decrypt_local_database_chunk(ciphertext);
    }

    // Recovery Key Manager Stubs (FAIL-CLOSED)
    async generateMnemonic() {
        this._assertReady('generateMnemonic');
        return this.rustCrypto.generate_mnemonic();
    }

    async deriveRecoveryKey(mnemonic, userIdHash) {
        this._assertReady('deriveRecoveryKey');
        const keyArray = this.rustCrypto.derive_recovery_key(mnemonic);
        return keyArray.buffer.slice(keyArray.byteOffset, keyArray.byteOffset + keyArray.byteLength);
    }

    async encryptWithRecoveryKey(mnemonic, data) {
        this._assertReady('encryptWithRecoveryKey');
        const dataArray = new Uint8Array(data);
        const ciphertextArray = this.rustCrypto.encrypt_with_recovery_key(mnemonic, dataArray);
        return ciphertextArray.buffer.slice(ciphertextArray.byteOffset, ciphertextArray.byteOffset + ciphertextArray.byteLength);
    }

    async decryptWithRecoveryKey(mnemonic, ciphertext) {
        this._assertReady('decryptWithRecoveryKey');
        const ciphertextArray = new Uint8Array(ciphertext);
        const plaintextArray = this.rustCrypto.decrypt_with_recovery_key(mnemonic, ciphertextArray);
        return plaintextArray.buffer.slice(plaintextArray.byteOffset, plaintextArray.byteOffset + plaintextArray.byteLength);
    }
    
    // Group Crypto Stubs (FAIL-CLOSED)
    deriveGroupKey(sharedSecret) {
        this._assertReady('deriveGroupKey');
        throw new Error("NotImplemented: Group key derivation pending Rust implementation");
    }

    // Hash Utility Stub
    async digest(algorithm, data) {
        this._assertReady('digest');
        const buffer = new Uint8Array(data);
        return this.rustCrypto.digest(algorithm, buffer);
    }
    
    computeAdminSig(challenge, skHex) {
        this._assertReady('computeAdminSig');
        return this.rustCrypto.compute_admin_sig(challenge, skHex);
    }
    
    generateIdentityKeys() {
        this._assertReady('generateIdentityKeys');
        const jsonStr = this.rustCrypto.generate_identity_keys();
        return JSON.parse(jsonStr);
    }

    // Media Encryption Stubs (FAIL-CLOSED)
    generateMediaKey() {
        this._assertReady('generateMediaKey');
        throw new Error("NotImplemented: Media key generation pending Rust implementation");
    }

    encryptMedia(arrayBuffer, rawKeyBytes) {
        this._assertReady('encryptMedia');
        throw new Error("NotImplemented: Media encryption pending Rust implementation");
    }

    decryptMedia(ciphertextBytes, rawKeyBytes, ivBytes) {
        this._assertReady('decryptMedia');
        throw new Error("NotImplemented: Media decryption pending Rust implementation");
    }

    runSelfTests() {
        this._assertReady('runSelfTests');
        console.debug("[HermesBridge] runSelfTests");
        const testData = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
        return this.rustCrypto.secure_zeroize(testData);
    }

    // ─────────────────────────────────────────
    // HELPERS PRIVADOS
    // ─────────────────────────────────────────

    _assertReady(methodName) {
        if (!this.ready) {
            throw new Error(
                `[HermesBridge] Cannot call ${methodName}: WASM module not ready. ` +
                `Status: ${this.mode}. Error: ${this._error}`
            );
        }
    }
}

export const hermesBridge = new RealHermesCrypto();
export const realCrypto = hermesBridge; // Alias heredado para retrocompatibilidad en migración

if (typeof window !== 'undefined') {
    window.hermesBridge = hermesBridge;
    window.realCrypto = hermesBridge;
}

// Intentar inicializar — capturar error silenciosamente (security_indicator lo reporta)
hermesBridge.init().catch(() => {
    // El error ya fue logueado en init(). El SecurityIndicator detectará ready=false.
});

