// fixes/FASE5_POST_AUDIT/fix_25_traffic_padding.js
import crypto from 'crypto';

export class TrafficPadder {
    /**
     * Motor de Padding Determinista en Bloques Fijos para HermesChat.
     * 
     * GARANTÍAS:
     * - Oculta la longitud original del texto plano ajustando el tamaño final
     *   a potencias de 2 o bloques fijos (256, 512, 1024, 4096 bytes).
     * - Previene ataques de análisis de tráfico por tamaño de paquete (Traffic Analysis Side-Channel).
     * - Inyecta bytes aleatorios en el relleno y empaca la longitud exacta al final (4 bytes BE).
     */
    constructor() {
        this.PADDING_BLOCKS = [256, 512, 1024, 4096];
    }

    padToFixedBlock(plaintextBuffer) {
        const originalLen = plaintextBuffer.length;
        
        // Encontrar el siguiente bloque mayor o igual a (originalLen + 4)
        let targetSize = this.PADDING_BLOCKS.find(size => size >= originalLen + 4);
        if (!targetSize) {
            // Si supera 4096, alinear a múltiplos de 4096
            targetSize = Math.ceil((originalLen + 4) / 4096) * 4096;
        }

        const paddingLen = targetSize - originalLen - 4;
        const paddingBuffer = crypto.randomBytes(paddingLen);
        const lenBuffer = Buffer.alloc(4);
        lenBuffer.writeUInt32BE(originalLen, 0);

        return Buffer.concat([plaintextBuffer, paddingBuffer, lenBuffer]);
    }

    unpadFromFixedBlock(paddedBuffer) {
        if (paddedBuffer.length < 4) {
            throw new Error('Búfer acolchado inválido (demasiado corto)');
        }

        const totalLen = paddedBuffer.length;
        const originalLen = paddedBuffer.readUInt32BE(totalLen - 4);

        if (originalLen > totalLen - 4) {
            throw new Error('Corrupción detectada: longitud desacolchada exceede el tamaño del bloque');
        }

        return paddedBuffer.slice(0, originalLen);
    }
}
