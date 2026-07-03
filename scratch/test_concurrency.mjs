import { persistenceManager } from '../frontend/src/js/persistence_manager.js';

// Simulamos indexedDB en memoria para testear el mecanismo de locks de PersistenceManager en Node
class MockIDB {
    constructor() {
        this.stores = new Map();
    }
    transaction() {
        return {
            objectStore: (name) => {
                if (!this.stores.has(name)) this.stores.set(name, new Map());
                const map = this.stores.get(name);
                return {
                    put: (data) => ({ onsuccess: null, onerror: null, ...(() => setTimeout(() => this.onsuccess?.(), 2))() }),
                    get: (id) => ({ result: map.get(id), onsuccess: null, onerror: null }),
                    getAll: () => ({ result: Array.from(map.values()), onsuccess: null, onerror: null }),
                    delete: (id) => ({ onsuccess: null, onerror: null })
                };
            }
        };
    }
}

async function main() {
    console.log('🔄 Probando mecanismo de Atomic Web Locks / fallback en PersistenceManager...');
    persistenceManager.db = new MockIDB();

    let concurrentCounter = 0;
    let maxConcurrency = 0;

    const runLockedOp = async (id) => {
        return await persistenceManager.withLock('hermes_test_lock', 'exclusive', async () => {
            concurrentCounter++;
            if (concurrentCounter > maxConcurrency) {
                maxConcurrency = concurrentCounter;
            }
            await new Promise(r => setTimeout(r, 10)); // Operación asíncrona simulada
            concurrentCounter--;
        });
    };

    console.log('🚀 Lanzando 50 operaciones asíncronas concurrentes competitivas...');
    const tasks = [];
    for (let i = 0; i < 50; i++) {
        tasks.push(runLockedOp(i));
    }

    await Promise.all(tasks);

    console.log(`📊 Máxima concurrencia detectada dentro de la sección crítica: ${maxConcurrency}`);
    if (maxConcurrency === 1) {
        console.log('✅ EXCELENTE: Atomicidad 100% garantizada. Cero race conditions.');
    } else {
        console.error('❌ FALLO DE ATOMICIDAD.');
        process.exit(1);
    }
}

main().catch(err => {
    console.error('❌ Error en test de concurrencia:', err);
    process.exit(1);
});
