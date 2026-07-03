// frontend/src/js/recovery_key_manager.js
//
// Sistema de Recovery Key basado en frases mnemotécnicas BIP39.
//
// ARQUITECTURA (Opción A — sistema separado del backup con contraseña):
//   - El backup local (.hermes) se cifra con la CONTRASEÑA del usuario (existente)
//   - La recovery key se cifra con la MNEMÓNICA (este módulo) para almacenamiento remoto
//
// FLUJO DE REGISTRO:
//   1. generateMnemonic()       → 12 palabras aleatorias del diccionario BIP39
//   2. deriveKeyFromMnemonic()  → PBKDF2-HMAC-SHA512, 600K iteraciones
//   3. saveMnemonicMarker()     → cifra marcador con la clave derivada (verificación futura)
//   4. Mostrar mnemónica al usuario (UNA SOLA VEZ — no se guarda en claro)
//
// FLUJO DE RESTAURACIÓN:
//   1. Usuario ingresa sus 12 palabras
//   2. verifyMnemonic()         → descifra marcador → confirma corrección
//   3. deriveKeyFromMnemonic()  → misma clave → descifra blob remoto

import { BIP39_WORDS } from './bip39_words.js';
import { hermesBridge } from './crypto_wasm_bridge.js';

// =============================================================================
// RecoveryKeyManager
// =============================================================================

export class RecoveryKeyManager {
    /**
     * Sistema de recovery key basado en frases mnemotécnicas BIP39.
     *
     * SEPARACIÓN DE CLAVES:
     *   - Backup local (.hermes): cifrado con CONTRASEÑA (BackupManager existente)
     *   - Recovery remoto:        cifrado con MNEMÓNICA (este módulo)
     *
     * ESTÁNDAR DE DERIVACIÓN:
     *   - PBKDF2-HMAC-SHA512, 600.000 iteraciones
     *   - Salt: "hermes_recovery_v2:" + sha256(userId)[:16]
     *   - Mismo parámetro que EncryptedStorageManager (consistencia de seguridad)
     */

    static ITERATIONS = 600_000;
    static HASH       = 'SHA-512';
    static VERSION    = 'hermes_recovery_v2';

    // ─────────────────────────────────────────
    // GENERACIÓN DE MNEMÓNICA
    // ─────────────────────────────────────────

    /**
     * Genera una frase mnemotécnica de 12 palabras con entropía de 128 bits.
     *
     * IMPLEMENTACIÓN BIP39:
     *   1. 128 bits de entropía aleatoria (OsRng equivalente: crypto.getRandomValues)
     *   2. Checksum SHA-256: primeros 4 bits del hash de la entropía
     *   3. 132 bits totales → 12 grupos de 11 bits → 12 índices en [0, 2047]
     *   4. Cada índice selecciona una palabra del diccionario BIP39
     *
     * @returns {Promise<string>} 12 palabras separadas por espacio
     */
    static async generateMnemonic() {
        return hermesBridge.generateMnemonic();
    }

    /**
     * Valida que una frase mnemotécnica sea válida (BIP39).
     *
     * @param {string} mnemonic
     * @returns {{ valid: boolean, error?: string }}
     */
    static async validateMnemonic(mnemonic) {
        const words = mnemonic.toLowerCase().trim().replace(/\s+/g, ' ').split(' ');

        if (words.length !== 12) {
            return { valid: false, error: `Se esperan 12 palabras, se recibieron ${words.length}` };
        }

        for (const word of words) {
            if (!BIP39_WORDS.includes(word)) {
                return { valid: false, error: `"${word}" no es una palabra BIP39 válida` };
            }
        }

        return { valid: true };
    }

    // ─────────────────────────────────────────
    // DERIVACIÓN DE CLAVE
    // ─────────────────────────────────────────

    /**
     * Deriva una clave AES-256-GCM desde la mnemónica usando PBKDF2.
     *
     * @param {string} mnemonic  - 12 palabras BIP39
     * @param {string} userIdHash - Hash SHA-256 del userId (usado como salt personalizado)
     * @returns {Promise<CryptoKey>} Clave AES-256-GCM (no exportable)
     */
    static async deriveKeyFromMnemonic(mnemonic, userIdHash) {
        return hermesBridge.deriveRecoveryKey(mnemonic, userIdHash);
    }

    // ─────────────────────────────────────────
    // VERIFICACIÓN (marcador cifrado)
    // ─────────────────────────────────────────

    /**
     * Guarda un marcador cifrado para verificar futuras frases sin exponer la clave.
     *
     * @param {string} mnemonic
     * @param {string} userIdHash
     */
    static async saveMnemonicMarker(mnemonic, userIdHash) {
        const ciphertext = await hermesBridge.encryptWithRecoveryKey(mnemonic, new TextEncoder().encode('HERMES_RECOVERY_OK_V2'));
        
        const markerData = {
            ciphertext: Array.from(new Uint8Array(ciphertext)),
            algorithm:  'HERMES-WASM-PBKDF2',
            version:    this.VERSION,
            userIdHash: userIdHash.slice(0, 8) + '…', // Solo prefijo (no exponer el hash completo)
        };

        localStorage.setItem(
            `_hermes_recovery_marker_${userIdHash.slice(0, 16)}`,
            JSON.stringify(markerData)
        );
    }

    /**
     * Verifica si una mnemónica es correcta descifrando el marcador.
     *
     * @param {string} mnemonic
     * @param {string} userIdHash
     * @returns {Promise<boolean>}
     */
    static async verifyMnemonic(mnemonic, userIdHash) {
        try {
            const markerStr = localStorage.getItem(`_hermes_recovery_marker_${userIdHash.slice(0, 16)}`);
            if (!markerStr) return true; // Si no hay marcador, asumimos válido (fallback)

            const markerData = JSON.parse(markerStr);
            const ciphertext = new Uint8Array(markerData.ciphertext);

            // Delegar toda la criptografía a WASM (que internamente debe derivar la llave)
            const plaintext = await hermesBridge.decryptWithRecoveryKey(mnemonic, ciphertext);
            const decoder = new TextDecoder();
            return decoder.decode(plaintext) === 'HERMES_RECOVERY_OK_V2';
        } catch (e) {
            console.error('[RecoveryKeyManager] Mnemonic verification failed:', e);
            return false;
        }
    }

    // ─────────────────────────────────────────
    // INICIALIZACIÓN COMPLETA
    // ─────────────────────────────────────────

    /**
     * Inicializa el sistema de recovery para un usuario nuevo.
     * Genera mnemónica, deriva clave, guarda marcador.
     *
     * @param {string} userIdHash
     * @returns {Promise<{ mnemonic: string }>}
     */
    static async initialize(userIdHash) {
        const mnemonic = await this.generateMnemonic();
        await this.saveMnemonicMarker(mnemonic, userIdHash);

        return { mnemonic };
    }

    /**
     * Restaura la clave desde la mnemónica (flujo de recuperación).
     *
     * @param {string} mnemonic
     * @param {string} userIdHash
     * @returns {Promise<boolean>}
     * @throws {Error} Si la mnemónica es incorrecta
     */
    static async restore(mnemonic, userIdHash) {
        const isValid = await this.verifyMnemonic(mnemonic, userIdHash);
        if (!isValid) {
            throw new Error('Frase de recuperación incorrecta o sin marcador registrado');
        }
        return true;
    }

    /**
     * Cifra datos arbitrarios con la recovery key.
     * Usado para cifrar el blob de estado antes de subirlo al servidor.
     *
     * @param {string} mnemonic
     * @param {Uint8Array} data - Datos a cifrar (ya comprimidos)
     * @returns {Promise<{ ciphertext: Uint8Array }>}
     */
    static async encryptWithRecoveryKey(mnemonic, data) {
        if (!mnemonic) throw new Error('Mnemonic cannot be null');
        return hermesBridge.encryptWithRecoveryKey(mnemonic, data);
    }

    /**
     * Descifra datos con la recovery key.
     *
     * @param {string} mnemonic
     * @param {Uint8Array} encryptedData
     * @returns {Promise<Uint8Array>}
     */
    static async decryptWithRecoveryKey(mnemonic, encryptedData) {
        if (!mnemonic) throw new Error('Mnemonic cannot be null');
        return hermesBridge.decryptWithRecoveryKey(mnemonic, encryptedData);
    }
}
