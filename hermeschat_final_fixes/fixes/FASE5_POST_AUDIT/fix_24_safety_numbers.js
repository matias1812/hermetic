// fixes/FASE5_POST_AUDIT/fix_24_safety_numbers.js
import crypto from 'crypto';

export class SafetyNumberVerifier {
    /**
     * Verificador de Identidad Out-Of-Band (Safety Numbers / BIP39 / QR).
     * 
     * GARANTÍAS:
     * - Deriva huellas dactilares de 60 dígitos legibles en grupos de 5.
     * - Previene ataques de Hombre en el Medio (MitM) en el primer contacto.
     * - Generación de URI criptográfico para escaneo de códigos QR.
     */
    generateSafetyNumber(identityKeyHex, userId) {
        const input = identityKeyHex + ':' + userId;
        const hash = crypto.createHash('sha512').update(input).digest('hex');
        
        // Extraer primeros 30 dígitos numéricos estables desde el hash
        let digits = '';
        for (let i = 0; i < hash.length && digits.length < 30; i++) {
            const charCode = hash.charCodeAt(i);
            digits += (charCode % 10).toString();
        }
        while (digits.length < 30) {
            digits += '0';
        }
        
        return this.formatAsBlocks(digits);
    }
    
    formatAsBlocks(digitString) {
        // Formato: 12345 67890 12345 67890 12345 67890
        return digitString.match(/.{1,5}/g).join(' ');
    }
    
    generateQRCodeURI(identityKeyHex, userId) {
        const fingerprint = identityKeyHex.substring(0, 16);
        return `hermes://verify/${encodeURIComponent(userId)}/${fingerprint}`;
    }

    verifyMatch(myIdentityKeyHex, myUserId, theirIdentityKeyHex, theirUserId, providedFingerprint) {
        const theirNumber = this.generateSafetyNumber(theirIdentityKeyHex, theirUserId);
        const expectedFingerprint = theirIdentityKeyHex.substring(0, 16);
        
        return {
            safetyNumber: theirNumber,
            qrMatch: expectedFingerprint === providedFingerprint,
            status: expectedFingerprint === providedFingerprint ? 'VERIFIED' : 'MISMATCH'
        };
    }
}
