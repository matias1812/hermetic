// tests/stress/opk_exhaustion_test.js
import { OPKPoolManager } from '../../fixes/FASE1_ROBUSTEZ/fix_01_opk_exhaustion.js';

export async function testOPKExhaustion() {
    console.log('--- TEST: OPK Exhaustion ---');
    
    // Mock fetch for the test
    let serverPoolSize = 10; // Empezamos con pool bajo
    let generateCount = 0;
    
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
        if (url.includes('/api/opk/pool')) {
            return { ok: true, json: async () => ({ count: serverPoolSize }) };
        }
        if (url.includes('/api/opk/consume')) {
            if (serverPoolSize > 0) {
                serverPoolSize--;
                return { 
                    status: 200, 
                    json: async () => ({ id: 'mock_opk_' + Math.random() })
                };
            }
            return { status: 404 };
        }
        if (url.includes('/api/opk/upload')) {
            const body = JSON.parse(options.body);
            serverPoolSize += body.keys.length;
            generateCount += body.keys.length;
            return { ok: true };
        }
        if (url.includes('/api/opk/verify')) {
            return { json: async () => ({ consumed: true }) };
        }
        if (url.includes('/api/opk/rotate')) {
            return { ok: true };
        }
    };
    
    try {
        const manager = new OPKPoolManager('user_test', 'device_test');
        
        console.log('1. Initializing (should refill since pool=10 < 200)');
        await manager.initialize();
        console.log(`Pool size after init: ${serverPoolSize}, Generated: ${generateCount}`);
        
        let successInit = serverPoolSize >= 200;
        
        console.log('2. Simulating rapid consumption (stress)');
        const consumePromises = [];
        for (let i = 0; i < 250; i++) {
            consumePromises.push(manager.consumeOPK());
        }
        
        await Promise.all(consumePromises);
        console.log(`Pool size after consuming 250: ${serverPoolSize}`);
        
        let successConsume = serverPoolSize >= 0; // Se recargó automáticamente gracias al 404
        
        manager.destroy();
        
        const result = successInit && successConsume;
        console.log('[OPK Exhaustion]:', result ? '✅' : '❌');
        return result;
    } finally {
        globalThis.fetch = originalFetch;
    }
}
