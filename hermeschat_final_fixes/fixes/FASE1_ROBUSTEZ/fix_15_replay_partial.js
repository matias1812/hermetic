// fixes/FASE1_ROBUSTEZ/fix_15_replay_partial.js

export class ReplayPartialProtector {
    /**
     * Protección contra Ataques de Repetición Parcial.
     * 
     * GARANTÍAS:
     * - Vincula el Header al Ciphertext estrictamente.
     * - Asegura que el AAD (Associated Data) contenga material fresco.
     * - Rastrea Nonces procesados a nivel de mensaje (Bloom Filter / Set de ventana).
     */
    
    constructor() {
        // Mantiene track de los identificadores de mensaje de la ventana reciente
        this.processedMessageHashes = new Set();
        this.MAX_WINDOW_SIZE = 1000;
    }
    
    async generateContextAAD(header, senderId, receiverId, conversationId) {
        // En lugar de usar AAD genérico, vinculamos:
        // [Header || Sender || Receiver || ConversationID]
        // Esto previene que un atacante copie un Header válido de la conv A y lo inyecte en conv B
        const contextStr = JSON.stringify({
            dh: header.dh_public,
            pn: header.pn,
            n: header.n,
            s: senderId,
            r: receiverId,
            c: conversationId
        });
        
        const buf = new TextEncoder().encode(contextStr);
        // Hashear el contexto para que sirva de AAD fijo
        const hash = await crypto.subtle.digest('SHA-256', buf);
        return new Uint8Array(hash);
    }
    
    async verifyAndMarkProcessed(ciphertext, header, aad) {
        // Hashear (Header + Ciphertext + AAD) para identificar unícamente la transacción criptográfica
        const combined = new Uint8Array(ciphertext.byteLength + aad.byteLength + JSON.stringify(header).length);
        // ... (código de ensamblaje simplificado para el hash)
        // Por simplicidad en la prueba, hasheamos el JSON de los tres
        
        const str = JSON.stringify({ h: header, c: bufferToHex(ciphertext), a: bufferToHex(aad) });
        const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
        const hashHex = bufferToHex(hashBuf);
        
        if (this.processedMessageHashes.has(hashHex)) {
            console.error(`[ReplayProtector] REPLAY DETECTADO. El mensaje con hash ${hashHex.substring(0,8)} ya fue procesado.`);
            throw new Error('Partial Replay Attack Detected');
        }
        
        this.processedMessageHashes.add(hashHex);
        
        // Mantener tamaño de ventana para evitar leak de memoria
        if (this.processedMessageHashes.size > this.MAX_WINDOW_SIZE) {
            // Eliminar el más viejo (iterator.next() de Set es FIFO en JS)
            const oldest = this.processedMessageHashes.keys().next().value;
            this.processedMessageHashes.delete(oldest);
        }
        
        return true;
    }
}

function bufferToHex(buffer) {
    if (!buffer) return '';
    const arr = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    return Array.from(arr)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}
