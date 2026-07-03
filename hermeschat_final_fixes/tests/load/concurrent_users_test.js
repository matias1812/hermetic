// tests/load/concurrent_users_test.js

import { EnumerationProtector } from '../../fixes/FASE2_BACKEND/fix_12_user_enumeration.js';
import { AvailabilityDoSMitigator } from '../../fixes/FASE2_BACKEND/fix_16_dos_availability.js';

export async function testConcurrentUsers() {
    console.log('--- TEST: Concurrent Users & Timing Attacks ---');
    
    // Mock DB para enumeración
    const dbMock = {
        findUser: async (username) => {
            if (username === 'alice') return { passwordHash: 'hash', salt: 'salt' };
            return null;
        }
    };
    
    const protector = new EnumerationProtector(dbMock);
    
    console.log('1. Testing User Enumeration Constant Time (Target 250ms)');
    
    const startAlice = Date.now();
    const existsAlice = await protector.checkUserExistsConstTime('alice');
    const timeAlice = Date.now() - startAlice;
    
    const startBob = Date.now();
    const existsBob = await protector.checkUserExistsConstTime('bob_not_exist');
    const timeBob = Date.now() - startBob;
    
    console.log(`Time for existing user: ${timeAlice}ms`);
    console.log(`Time for non-existing user: ${timeBob}ms`);
    
    const diff = Math.abs(timeAlice - timeBob);
    console.log(`Time difference: ${diff}ms`);
    
    const timingSuccess = diff <= 20; // Aceptamos 20ms de varianza en Node JS event loop
    
    console.log('\n2. Testing Availability DoS (Token Bucket)');
    const dosMitigator = new AvailabilityDoSMitigator();
    const attackerIp = '192.168.1.100';
    
    let allowedReqs = 0;
    let blockedReqs = 0;
    
    // El bucket tiene 50 tokens inicialmente. Vamos a lanzar 100 requests simultáneos.
    for (let i = 0; i < 100; i++) {
        if (dosMitigator.consumeToken(attackerIp)) {
            allowedReqs++;
        } else {
            blockedReqs++;
        }
    }
    
    console.log(`Requests allowed (max 50): ${allowedReqs}`);
    console.log(`Requests blocked: ${blockedReqs}`);
    
    const dosSuccess = allowedReqs === 50 && blockedReqs === 50;
    
    const result = timingSuccess && dosSuccess;
    console.log('[Concurrent Users Test]:', result ? '✅' : '❌');
    return result;
}
