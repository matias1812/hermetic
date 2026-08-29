// frontend/src/js/utils/image_validation.js
//
// SEC: `file.type.startsWith('image/')` (usado hasta ahora en chat_input.js) solo lee el
// MIME que el navegador REPORTA a partir de la extensión/metadata del archivo -- no dice
// nada sobre los bytes reales. `image/svg+xml` pasa ese chequeo, y un SVG es XML: puede
// llevar <script>/manejadores de evento embebidos. Esto valida la firma real de los
// primeros bytes contra los formatos raster que la app realmente necesita mostrar
// (PNG/JPEG/GIF/WebP), y rechaza todo lo demás -- incluido SVG explícitamente, sin
// importar qué extensión o Content-Type diga el archivo.

const SIGNATURES = [
    { name: 'PNG', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
    { name: 'JPEG', bytes: [0xff, 0xd8, 0xff] },
    { name: 'GIF', bytes: [0x47, 0x49, 0x46, 0x38] }, // "GIF8" (87a u 89a)
];

function matchesSignature(bytes, signature) {
    if (bytes.length < signature.length) return false;
    for (let i = 0; i < signature.length; i++) {
        if (bytes[i] !== signature[i]) return false;
    }
    return true;
}

function isWebP(bytes) {
    // RIFF....WEBP: "RIFF" en 0-3, tamaño en 4-7, "WEBP" en 8-11.
    if (bytes.length < 12) return false;
    const riff = [0x52, 0x49, 0x46, 0x46];
    const webp = [0x57, 0x45, 0x42, 0x50];
    for (let i = 0; i < 4; i++) {
        if (bytes[i] !== riff[i]) return false;
        if (bytes[8 + i] !== webp[i]) return false;
    }
    return true;
}

/**
 * @param {Uint8Array} bytes Primeros bytes (basta con ~16) del archivo/blob.
 * @returns {boolean} true solo si matchea un formato raster real conocido.
 */
export function isKnownRasterImage(bytes) {
    if (!bytes || bytes.length === 0) return false;
    if (isWebP(bytes)) return true;
    return SIGNATURES.some((sig) => matchesSignature(bytes, sig.bytes));
}

/**
 * Lee los primeros bytes de un File/Blob sin cargarlo entero en memoria.
 * @param {File|Blob} file
 * @returns {Promise<Uint8Array>}
 */
export function readHeaderBytes(file, length = 16) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result));
        reader.onerror = reject;
        reader.readAsArrayBuffer(file.slice(0, length));
    });
}

/**
 * Valida que un File sea realmente un raster conocido, leyendo su firma de bytes real.
 * @param {File} file
 * @returns {Promise<boolean>}
 */
export async function isFileRealImage(file) {
    try {
        const header = await readHeaderBytes(file);
        return isKnownRasterImage(header);
    } catch {
        return false;
    }
}
