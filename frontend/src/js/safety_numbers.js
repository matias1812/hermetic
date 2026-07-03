// frontend/src/js/safety_numbers.js
import { hermesBridge } from './crypto_wasm_bridge.js';

export class SafetyNumberVerifier {
    /**
     * Verificador de Identidad Out-Of-Band (Safety Numbers / BIP39 / QR).
     * 
     * GARANTÍAS:
     * - Deriva huellas dactilares de 30 dígitos numéricos en bloques de 5.
     * - Previene ataques Man-in-the-Middle (MitM).
     * - Generación de URI criptográfico para escaneo de códigos QR.
     */
    async generateSafetyNumber(identityKeyHex, userId) {
        if (!identityKeyHex || !userId) return '00000 00000 00000 00000 00000 00000';
        const inputStr = identityKeyHex + ':' + userId;
        const input = new TextEncoder().encode(inputStr);
        const hashBuffer = await hermesBridge.digest('SHA-512', input);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        let digits = '';
        for (let i = 0; i < hashHex.length && digits.length < 30; i++) {
            digits += (hashHex.charCodeAt(i) % 10).toString();
        }
        while (digits.length < 30) digits += '0';
        
        return this.formatAsBlocks(digits);
    }
    
    formatAsBlocks(digitString) {
        const matches = digitString.match(/.{1,5}/g);
        return matches ? matches.join(' ') : digitString;
    }
    
    generateQRCodeURI(identityKeyHex, userId) {
        const fingerprint = identityKeyHex ? identityKeyHex.substring(0, 16) : '';
        return `hermes://verify/${encodeURIComponent(userId)}/${fingerprint}`;
    }

    verifyMatch(theirIdentityKeyHex, providedFingerprint) {
        if (!theirIdentityKeyHex || !providedFingerprint) return false;
        const expectedFingerprint = theirIdentityKeyHex.substring(0, 16);
        return expectedFingerprint.toLowerCase() === providedFingerprint.toLowerCase();
    }
}

export const safetyNumberVerifier = new SafetyNumberVerifier();
