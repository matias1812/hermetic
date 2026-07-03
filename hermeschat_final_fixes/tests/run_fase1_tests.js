// tests/run_fase1_tests.js

import { testOPKExhaustion } from './stress/opk_exhaustion_test.js';
import { testRatchetFragmentation } from './stress/ratchet_fragmentation_test.js';
import { testRaceCondition } from './stress/race_condition_test.js';
import { testReplayAttack } from './stress/replay_attack_test.js';

async function runAll() {
    console.log('=============================================');
    console.log('🚀 INICIANDO PRUEBAS DE ESTRÉS FASE 1 (ROBUSTEZ)');
    console.log('=============================================\n');

    let passed = 0;
    let total = 4;

    if (await testOPKExhaustion()) passed++;
    console.log('');
    if (await testRatchetFragmentation()) passed++;
    console.log('');
    if (await testRaceCondition()) passed++;
    console.log('');
    if (await testReplayAttack()) passed++;
    console.log('');

    console.log('=============================================');
    console.log(`📊 RESULTADOS: ${passed}/${total} PASADOS`);
    console.log('=============================================');
    
    if (passed === total) {
        console.log('✅ FASE 1 COMPLETADA CON ÉXITO');
    } else {
        console.error('❌ SE DETECTARON FALLOS EN LA FASE 1');
    }
}

runAll().catch(console.error);
