// tests/stress/ratchet_fragmentation_test.js
import { RatchetStateSynchronizer } from '../../fixes/FASE1_ROBUSTEZ/fix_02_ratchet_fragmentation.js';

export async function testRatchetFragmentation() {
    console.log('--- TEST: Ratchet Fragmentation ---');
    
    // Simular un estado inicial
    const stateA = {
        Ns: 10,
        Nr: 5,
        MKSKIPPED: new Map([
            ['k1', 'val1'],
            ['k2', 'val2']
        ])
    };
    
    const stateB = {
        Ns: 8,
        Nr: 7, // En B se recibieron 2 mensajes extras que A no ha visto
        MKSKIPPED: new Map([
            ['k1', 'val1'],
            ['k3', 'val3']
        ])
    };
    
    const sync = new RatchetStateSynchronizer();
    
    console.log('Merge stateA and stateB');
    const merged = await sync.mergeRatchetStates(stateA, stateB);
    
    // totalA = 15, totalB = 15. The merge logic favors A if >= B, but incorporates missing skipped keys.
    // So merged should have Ns: 10, Nr: 5, and MKSKIPPED should have k1, k2, k3.
    
    const hasK1 = merged.MKSKIPPED.has('k1');
    const hasK2 = merged.MKSKIPPED.has('k2');
    const hasK3 = merged.MKSKIPPED.has('k3');
    
    console.log(`Merged MKSKIPPED keys: k1=${hasK1}, k2=${hasK2}, k3=${hasK3}`);
    console.log(`Merged message counts: Ns=${merged.Ns}, Nr=${merged.Nr}`);
    
    const result = hasK1 && hasK2 && hasK3 && merged.Ns === 10 && merged.Nr === 5;
    console.log('[Ratchet Fragmentation]:', result ? '✅' : '❌');
    return result;
}
