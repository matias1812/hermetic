// tests/run_fase2_tests.mjs
import { KeyRotationManager } from '../fixes/FASE2_BACKEND/fix_05_key_rotation.js';
import { ConsistentStorage } from '../fixes/FASE2_BACKEND/fix_06_storage_consistency.js';
import { PushNotificationSanitizer } from '../fixes/FASE2_BACKEND/fix_11_push_notifications.js';
import { EnumerationProtector } from '../fixes/FASE2_BACKEND/fix_12_user_enumeration.js';
import { AvailabilityDoSMitigator } from '../fixes/FASE2_BACKEND/fix_16_dos_availability.js';
import { PrivacyPreservingLogger } from '../fixes/FASE2_BACKEND/fix_19_observability.js';
import { WebSocketFanout } from '../fixes/FASE2_BACKEND/fix_20_scalability.js';
import { DisasterRecoveryManager } from '../fixes/FASE2_BACKEND/fix_21_disaster_recovery.js';

async function testKeyRotation() {
    console.log('--- Test 1: Key Rotation ---');
    const storageMock = {
        key: null,
        graceKey: null,
        async getActiveKey() { return this.key; },
        async getGraceKey() { return this.graceKey; },
        async saveKey(k, status) { this.key = k; },
        async updateKey(k) { if(k.status==='grace') this.graceKey=k; }
    };
    const manager = new KeyRotationManager(storageMock);
    await manager.initialize();
    const version1 = manager.currentKey.version;
    await manager.rotateKey();
    const version2 = manager.currentKey.version;
    manager.scheduleNextRotation = () => {}; // clear timeout for tests
    if (manager.rotationTimer) clearTimeout(manager.rotationTimer);
    const passed = (version2 === version1 + 1) && (manager.previousKey !== null);
    console.log(passed ? '✅ Passed' : '❌ Failed');
    return { passed };
}

async function testStorageConsistency() {
    console.log('--- Test 2: Storage Consistency (Outbox) ---');
    const storageMock = {
        outbox: new Map(),
        async saveOutboxMessage(m) { this.outbox.set(m.id, m); },
        async updateOutboxStatus(id, s) { this.outbox.get(id).status = s; }
    };
    const consistent = new ConsistentStorage(storageMock);
    // Mock WebSocket connection
    consistent.getClientConnection = async () => ({ readyState: 1, send: () => {} });
    const res = await consistent.saveAndDeliver({ text: 'hi' }, 'alice');
    const passed = res.success === true && storageMock.outbox.get(res.messageId).status === 'sent';
    console.log(passed ? '✅ Passed' : '❌ Failed');
    return { passed };
}

async function testPushSanitizer() {
    console.log('--- Test 3: Push Notification Sanitizer ---');
    const sanitizer = new PushNotificationSanitizer();
    const res1 = await sanitizer.sendSanitizedPush('user1', 'token1');
    const res2 = await sanitizer.sendSanitizedPush('user1', 'token1');
    const passed = res1.sent === true && res2.sent === false && res2.reason === 'rate_limited';
    console.log(passed ? '✅ Passed' : '❌ Failed');
    return { passed };
}

async function testEnumerationProtection() {
    console.log('--- Test 4: User Enumeration Protection ---');
    const storageMock = { async findUser(u) { return u === 'real_user' ? {id:1} : null; } };
    const protector = new EnumerationProtector(storageMock);
    const start1 = Date.now();
    await protector.checkUserExists('real_user', '127.0.0.1');
    const t1 = Date.now() - start1;
    
    const start2 = Date.now();
    await protector.checkUserExists('fake_user', '127.0.0.2');
    const t2 = Date.now() - start2;
    
    const passed = Math.abs(t1 - t2) < 30; // Max 30ms diff
    console.log(passed ? '✅ Passed' : '❌ Failed');
    return { passed };
}

async function testDoSMitigator() {
    console.log('--- Test 5: Availability DoS Mitigator ---');
    const mitigator = new AvailabilityDoSMitigator();
    const results = [];
    for (let i = 0; i < 150; i++) {
        const res = await mitigator.canAcceptConnection('10.0.0.1', false);
        results.push(res.accepted);
    }
    const passed = results.filter(r => r).length === 100;
    console.log(passed ? '✅ Passed' : '❌ Failed');
    return { passed };
}

async function testPrivacyLogger() {
    console.log('--- Test 6: Privacy Preserving Logger ---');
    const logger = new PrivacyPreservingLogger();
    const originalLog = console.log;
    let loggedData = null;
    console.log = (data) => {
        if (data.includes('level')) loggedData = JSON.parse(data);
    };
    logger.log('INFO', 'User 192.168.1.1 logged in with token abcdef1234567890abcdef1234567890abcdef1234567890', { ip: '192.168.1.1', userId: 'user123' });
    console.log = originalLog;
    
    const msgSanitized = loggedData.message.includes('[IP]') && loggedData.message.includes('[TOKEN]');
    const ipHashed = loggedData.ip_hash.length === 16;
    const passed = msgSanitized && ipHashed;
    console.log(passed ? '✅ Passed' : '❌ Failed');
    return { passed };
}

async function testWebSocketFanout() {
    console.log('--- Test 7: WebSocket Fanout ---');
    const pubSubMock = {
        cbs: new Map(),
        async subscribe(c, fn) { this.cbs.set(c, fn); },
        async publish(c, data) { if(this.cbs.has(c)) this.cbs.get(c)(data); }
    };
    const fanout = new WebSocketFanout('node1', pubSubMock);
    await fanout.initialize();
    await fanout.registerClient('alice', { readyState: 1, send: () => {} });
    const passed = fanout.localClients.has('alice');
    console.log(passed ? '✅ Passed' : '❌ Failed');
    return { passed };
}

async function testDisasterRecovery() {
    console.log('--- Test 8: Disaster Recovery ---');
    const storageMock = {
        async getLastShutdownStatus() { return { graceful: false }; },
        async getLatestSnapshot() { return { key_state: 'key1', pending_messages: [] }; },
        async getPendingOutboxMessages() { return []; },
        async restoreKeyState() {},
        async saveSnapshot() {},
        getSnapshotCount() { return 1; }
    };
    const dr = new DisasterRecoveryManager(storageMock, null);
    await dr.initialize();
    const passed = dr.recoveryStartTime !== null;
    console.log(passed ? '✅ Passed' : '❌ Failed');
    return { passed };
}

async function runAllFase2Tests() {
    console.log('='.repeat(60));
    console.log('🧪 FASE 2: BACKEND - TESTS DE CARGA');
    console.log('='.repeat(60));
    
    const results = [];
    
    results.push(await testKeyRotation());
    results.push(await testStorageConsistency());
    results.push(await testPushSanitizer());
    results.push(await testEnumerationProtection());
    results.push(await testDoSMitigator());
    results.push(await testPrivacyLogger());
    results.push(await testWebSocketFanout());
    results.push(await testDisasterRecovery());
    
    const passed = results.filter(r => r.passed).length;
    console.log('\n' + '='.repeat(60));
    console.log(`FASE 2: ${passed}/${results.length} tests pasados`);
    console.log('='.repeat(60));

    if (passed < results.length) process.exit(1);
    else process.exit(0);
}

runAllFase2Tests();
