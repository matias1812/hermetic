// tests/stress/race_condition_test.js
import { AsyncMutex } from '../../fixes/FASE1_ROBUSTEZ/fix_13_race_conditions.js';

export async function testRaceCondition() {
    console.log('--- TEST: Race Conditions (AsyncMutex) ---');
    
    const mutex = new AsyncMutex();
    
    let sharedResource = 0;
    const concurrency = 100;
    
    // Función que simula una operación asíncrona vulnerable a race conditions
    // Si no hay mutex, sharedResource se leería obsoleto y se perderían incrementos.
    const runVulnerableOp = async () => {
        await mutex.runExclusive(async () => {
            const current = sharedResource;
            // Simulamos trabajo asíncrono
            await new Promise(r => setTimeout(r, Math.random() * 5));
            sharedResource = current + 1;
        });
    };
    
    const promises = [];
    for (let i = 0; i < concurrency; i++) {
        promises.push(runVulnerableOp());
    }
    
    await Promise.all(promises);
    
    console.log(`Expected: ${concurrency}, Actual: ${sharedResource}`);
    
    const result = sharedResource === concurrency;
    console.log('[Race Condition]:', result ? '✅' : '❌');
    return result;
}
