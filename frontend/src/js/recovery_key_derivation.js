import { BIP39_WORDS } from './bip39_words.js';
import { hermesBridge } from './crypto_wasm_bridge.js';

export class RecoveryKeyDerivation {
    /**
     * Derivación de clave AES-256 desde frase mnemotécnica.
     * 
     * ESTÁNDAR: BIP39 -> PBKDF2-HMAC-SHA512 -> AES-256-GCM
     * ITERACIONES: 600,000 (OWASP 2024 recomendado)
     * SALT: "hermes_recovery_v2" + user_id_hash
     */
    
    static async deriveKeyFromMnemonic(mnemonic, userIdHash) {
        // 1. Normalizar frase
        const normalized = mnemonic
            .toLowerCase()
            .trim()
            .replace(/\s+/g, ' ');
        
        // 2. Validar entropía mínima
        if (normalized.split(' ').length < 12) {
            throw new Error('Se requieren al menos 12 palabras');
        }
        
        // 3. Derivar con PBKDF2        // Delegado a hermesBridge
        return hermesBridge.deriveRecoveryKey(mnemonic, userIdHash);
    }
    
    static async verifyMnemonic(mnemonic, userIdHash) {
        try {
            const { key } = await this.deriveKeyFromMnemonic(mnemonic, userIdHash);
            
            const verificationStr = localStorage.getItem('hermes_recovery_verification');
            if (!verificationStr) {
                return false;
            }
            
            const verification = JSON.parse(verificationStr);
            
            const iv = new Uint8Array(verification.iv);
            const ciphertext = new Uint8Array(verification.ciphertext);
            
            if (!mnemonic) throw new Error("Mnemonic missing");
        return hermesBridge.decryptWithRecoveryKey(mnemonic, ciphertext);
            
        } catch (error) {
            return false;
        }
    }
    
    static async generateMnemonic() {
        return hermesBridge.generateMnemonic();
    }
}
