import { hermesBridge } from './crypto_wasm_bridge.js';

const VERIFY_PLAINTEXT = 'hermes-recovery-verify-v1';

function bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
function hexToBytes(hex) {
    return new Uint8Array((hex || '').match(/.{1,2}/g)?.map(b => parseInt(b, 16)) || []);
}
function normalize(mnemonic) {
    return (mnemonic || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

export class RecoveryKeyDerivation {
    /**
     * Derivación de clave desde frase mnemotécnica BIP39 (12 palabras).
     * Todo el KDF real (HKDF-SHA256, namespaced por user_id_hash) vive en
     * hermes_crypto_wasm/src/core_api.rs — este módulo solo normaliza input
     * y orquesta el marcador de verificación local.
     */

    static async deriveKeyFromMnemonic(mnemonic, userIdHash) {
        const normalized = normalize(mnemonic);
        if (normalized.split(' ').length < 12) {
            throw new Error('Se requieren al menos 12 palabras');
        }
        return hermesBridge.deriveRecoveryKey(normalized, userIdHash);
    }

    /**
     * Deriva el "proof" (HKDF, info label separado de la clave de cifrado)
     * que el backend guarda para autenticar /api/recovery/fetch sin sesión —
     * el servidor nunca ve la mnemónica ni la clave que descifra el backup.
     */
    static async deriveProof(mnemonic, userIdHash) {
        const normalized = normalize(mnemonic);
        return hermesBridge.deriveRecoveryProof(normalized, userIdHash);
    }

    /**
     * Crea y persiste (namespaced por usuario) un marcador cifrado con la
     * propia clave de recuperación, para poder verificar localmente que el
     * usuario transcribió bien la frase sin volver a pegar contra el server.
     */
    static async createVerificationMarker(mnemonic, userIdHash) {
        const normalized = normalize(mnemonic);
        const plaintext = new TextEncoder().encode(VERIFY_PLAINTEXT);
        const ciphertext = await hermesBridge.encryptWithRecoveryKey(normalized, userIdHash, plaintext);
        const markerHex = bytesToHex(new Uint8Array(ciphertext));
        localStorage.setItem('hermes_recovery_verification_' + userIdHash, markerHex);
        return markerHex;
    }

    static async verifyMnemonic(mnemonic, userIdHash) {
        try {
            const normalized = normalize(mnemonic);
            if (normalized.split(' ').length < 12) return false;

            const markerHex = localStorage.getItem('hermes_recovery_verification_' + userIdHash);
            if (!markerHex) return false;

            const plaintext = await hermesBridge.decryptWithRecoveryKey(normalized, userIdHash, hexToBytes(markerHex));
            return new TextDecoder().decode(new Uint8Array(plaintext)) === VERIFY_PLAINTEXT;
        } catch (error) {
            return false;
        }
    }

    static async generateMnemonic() {
        return hermesBridge.generateMnemonic();
    }
}
