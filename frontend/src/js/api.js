import { modalManager } from './ui/modal_manager.js';
import { showToast } from './state.js';

/**
 * Wrapper centralizado para fetch con timeout y manejo de errores estandarizado.
 */
const originalFetch = window.fetch;

export async function apiFetch(url, options = {}) {
    const timeout = options.timeout || 15000;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await originalFetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (err) {
        clearTimeout(id);
        
        let title = '[ ERROR DE RED ]';
        let msg = err.message;
        
        if (err.name === 'AbortError') {
            title = '[ TIEMPO AGOTADO ]';
            msg = `La petición tardó más de ${timeout / 1000}s en responder.`;
        } else if (err.message === 'Failed to fetch') {
            title = '[ SIN CONEXIÓN ]';
            msg = 'No se pudo contactar con el servidor. Verifica tu conexión a internet o si el backend está en línea.';
        }
        
        if (!options.suppressErrorAlert && typeof url === 'string' && !url.endsWith('.wasm')) {
            showToast(`${title} ${msg}`, true);
        }
        
        throw err;
    }
}
