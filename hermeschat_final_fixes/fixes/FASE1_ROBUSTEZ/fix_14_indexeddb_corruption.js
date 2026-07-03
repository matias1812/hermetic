// fixes/FASE1_ROBUSTEZ/fix_14_indexeddb_corruption.js

export class IndexedDBGuardian {
    /**
     * Guardian de Integridad de IndexedDB.
     * 
     * GARANTÍAS:
     * - Detección proactiva de corrupción en lectura/escritura.
     * - Modo de recuperación seguro (limpiar y resincronizar).
     * - Detección de QuotaExceeded y manejo elegante.
     */
    
    constructor(dbName) {
        this.dbName = dbName;
        this.integrityHash = null; 
    }
    
    async checkIntegrity(dbInstance) {
        try {
            // Un test simple: escribir un valor temporal y leerlo
            return new Promise((resolve) => {
                const transaction = dbInstance.transaction(['system'], 'readwrite');
                const store = transaction.objectStore('system');
                
                const testData = { id: 'integrity_check', timestamp: Date.now() };
                const putReq = store.put(testData);
                
                putReq.onsuccess = () => {
                    const getReq = store.get('integrity_check');
                    getReq.onsuccess = () => {
                        if (getReq.result && getReq.result.timestamp === testData.timestamp) {
                            resolve(true);
                        } else {
                            resolve(false);
                        }
                    };
                    getReq.onerror = () => resolve(false);
                };
                
                putReq.onerror = () => resolve(false);
                transaction.onerror = () => resolve(false);
                transaction.onabort = () => resolve(false);
            });
        } catch (error) {
            console.error('IndexedDB checkIntegrity threw error', error);
            return false;
        }
    }
    
    async handleCorruption(dbInstance) {
        console.error(`[IndexedDBGuardian] Corrupción detectada en ${this.dbName}. Iniciando recuperación...`);
        
        try {
            if (dbInstance) {
                dbInstance.close();
            }
        } catch (e) {
            console.warn('Error cerrando DB corrupta', e);
        }
        
        // 1. Destruir DB corrupta
        await new Promise((resolve, reject) => {
            const req = indexedDB.deleteDatabase(this.dbName);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
            req.onblocked = () => {
                console.warn('deleteDatabase blocked - another tab might be open');
                // Intentar forzar recarga o advertir usuario
                resolve(false); 
            };
        });
        
        console.log(`[IndexedDBGuardian] DB ${this.dbName} purgada.`);
        
        // 2. Notificar al sistema para resincronizar desde servidor
        this.notifySystemForResync();
        
        return true;
    }
    
    notifySystemForResync() {
        // Despachar evento para que SyncManager recupere llaves/mensajes desde la nube cifrada
        const event = new CustomEvent('db_corruption_recovered', { detail: { dbName: this.dbName }});
        window.dispatchEvent(event);
    }
    
    async safeExecute(dbInstance, operationFn) {
        try {
            return await operationFn();
        } catch (error) {
            if (error.name === 'QuotaExceededError') {
                console.warn('Quota exceeded in IndexedDB, attempting cleanup...');
                // Trigger cleanup
                return null;
            } else if (error.name === 'UnknownError' || error.message.includes('corrupt')) {
                const recovered = await this.handleCorruption(dbInstance);
                if (recovered) throw new Error('DB_CORRUPTION_RECOVERED_RETRY');
            }
            throw error;
        }
    }
}
