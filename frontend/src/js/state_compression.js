export class StateCompressor {
    /**
     * Compresión de estado antes de cifrar.
     * 
     * MOTIVACION:
     * - JSON de estado puede crecer con muchos contactos/grupos
     * - Comprimir reduce tamaño del blob (hasta 10x)
     * - Menos datos = backup más rápido = menos consumo de red
     */
    
    /**
     * Comprimir estado antes de cifrar.
     */
    static async compressState(state) {
        // 1. Serializar a JSON
        const json = JSON.stringify(state);
        
        // 2. Convertir a bytes
        const encoder = new TextEncoder();
        const bytes = encoder.encode(json);
        
        // 3. Comprimir con CompressionStream (gzip)
        const compressedStream = new Blob([bytes])
            .stream()
            .pipeThrough(new CompressionStream('gzip'));
        
        const compressedBlob = await new Response(compressedStream).blob();
        const compressedBytes = new Uint8Array(await compressedBlob.arrayBuffer());
        
        console.log(
            `Compresión: ${bytes.length}B -> ${compressedBytes.length}B ` +
            `(${((1 - compressedBytes.length / bytes.length) * 100).toFixed(1)}% reducción)`
        );
        
        return compressedBytes;
    }
    
    /**
     * Descomprimir después de descifrar.
     */
    static async decompressState(compressedBytes) {
        // 1. Descomprimir con DecompressionStream
        const decompressedStream = new Blob([compressedBytes])
            .stream()
            .pipeThrough(new DecompressionStream('gzip'));
        
        const decompressedBlob = await new Response(decompressedStream).blob();
        const bytes = new Uint8Array(await decompressedBlob.arrayBuffer());
        
        // 2. Convertir a string
        const decoder = new TextDecoder();
        const json = decoder.decode(bytes);
        
        // 3. Parsear JSON
        return JSON.parse(json);
    }
}
