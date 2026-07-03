// frontend/src/js/storage/persistence_layer.js
import { persistenceManager } from '../persistence_manager.js';

export class PersistenceLayer {
    /**
     * Capa de persistencia TRANSPARENTE.
     * 
     * FUNCIONAMIENTO:
     * - Si IndexedDB está disponible → guarda AHÍ (persiste tras F5)
     * - Si no → fallback a sessionStorage (comportamiento actual)
     * - La lógica de negocio NO cambia
     * - La UI NO se modifica
     * 
     * ESQUEMA:
     * App → PersistenceLayer → IndexedDB (primario)
     *                        → sessionStorage (fallback)
     */
    
    constructor() {
        this.db = persistenceManager;
    }
    
    async save(key, data) {
        // 1. Guardar en sessionStorage para compatibilidad inmediata con memoria síncrona
        try {
            sessionStorage.setItem(key, JSON.stringify(data));
        } catch (e) {
            console.warn(`[PersistenceLayer] No se pudo guardar en sessionStorage (${key}):`, e);
        }
        
        // 2. Guardar en IndexedDB para supervivencia total al presionar F5
        try {
            await this.saveToIndexedDB(key, data);
        } catch (e) {
            console.error(`[PersistenceLayer] Error guardando en IndexedDB (${key}):`, e);
        }
    }
    
    async load(key) {
        // 1. Intentar cargar desde IndexedDB primero (más persistente tras recargar)
        try {
            const indexedData = await this.loadFromIndexedDB(key);
            if (indexedData !== null && indexedData !== undefined) {
                // Sincronizar hacia sessionStorage
                try {
                    sessionStorage.setItem(key, JSON.stringify(indexedData));
                } catch (e) {}
                return indexedData;
            }
        } catch (e) {
            console.warn(`[PersistenceLayer] No se pudo leer de IndexedDB (${key}):`, e);
        }
        
        // 2. Fallback a sessionStorage si IndexedDB está vacío o falló
        try {
            const sessionData = sessionStorage.getItem(key);
            if (sessionData !== null) {
                const parsed = JSON.parse(sessionData);
                // Migrar silenciosamente a IndexedDB para el futuro
                await this.saveToIndexedDB(key, parsed).catch(() => {});
                return parsed;
            }
        } catch (e) {
            console.warn(`[PersistenceLayer] Error leyendo sessionStorage (${key}):`, e);
        }
        
        return null;
    }
    
    async saveToIndexedDB(key, data) {
        await this.db.save('settings', { id: `persist_${key}`, value: data, updatedAt: Date.now() });
    }
    
    async loadFromIndexedDB(key) {
        const entry = await this.db.load('settings', `persist_${key}`);
        return entry ? entry.value : null;
    }
    
    async remove(key) {
        try {
            sessionStorage.removeItem(key);
        } catch (e) {}
        try {
            await this.db.delete('settings', `persist_${key}`);
        } catch (e) {}
    }
}

export const persistenceLayer = new PersistenceLayer();
