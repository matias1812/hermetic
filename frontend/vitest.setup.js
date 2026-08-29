// vitest.setup.js
//
// crypto_wasm_bridge.js detecta Node vs navegador mirando `typeof import.meta.env ===
// 'undefined'` -- bajo Vitest (que corre sobre Vite) `import.meta.env` SIEMPRE está
// definido, incluso con `environment: 'node'`, así que el bridge toma la rama de
// navegador y hace `fetch(new URL(...).href)` sobre una URL `file://`. El `fetch` nativo
// de Node (undici) no soporta el esquema `file://` -- por diseño, no es un bug de Node.
// Este shim solo enseña a `fetch` a resolver `file://` leyendo del disco, únicamente
// dentro de los tests; no modifica crypto_wasm_bridge.js ni su lógica de producción.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import 'fake-indexeddb/auto';

const originalFetch = globalThis.fetch;

globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url;
    if (url && url.startsWith('file://')) {
        const bytes = await readFile(fileURLToPath(url));
        return new Response(bytes, { status: 200, statusText: 'OK' });
    }
    return originalFetch(input, init);
};

// storage_manager.js (EncryptedStorageManager) usa sessionStorage para el user_id de la
// sesión activa -- no existe en `environment: 'node'` (a propósito: 'jsdom' resuelve
// `import.meta.url` como http://localhost:3000/... en vez de file://, lo que rompe la
// carga del WASM real de arriba). Polyfill mínimo Map-backed, suficiente para
// getItem/setItem/removeItem/clear -- no es la Storage API completa del DOM.
class MemoryStorage {
    #map = new Map();
    getItem(key) { return this.#map.has(key) ? this.#map.get(key) : null; }
    setItem(key, value) { this.#map.set(key, String(value)); }
    removeItem(key) { this.#map.delete(key); }
    clear() { this.#map.clear(); }
}
globalThis.sessionStorage = new MemoryStorage();
globalThis.localStorage = new MemoryStorage();
