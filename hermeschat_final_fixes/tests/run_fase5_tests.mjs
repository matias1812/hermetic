// tests/run_fase5_tests.mjs
import { XChaCha20Poly1305Engine } from '../fixes/FASE5_POST_AUDIT/fix_23_xchacha20_poly1305.js';
import { SafetyNumberVerifier } from '../fixes/FASE5_POST_AUDIT/fix_24_safety_numbers.js';
import { TrafficPadder } from '../fixes/FASE5_POST_AUDIT/fix_25_traffic_padding.js';

async function testXChaCha20Poly1305() {
    console.log('--- Test P1: XChaCha20-Poly1305 AEAD Engine ---');
    try {
        const key = Buffer.alloc(32, 0x42);
        const engine = new XChaCha20Poly1305Engine(key);
        const plaintext = Buffer.from('Mensaje confidencial post-cuántico con XChaCha20', 'utf8');
        const aad = Buffer.from('header-aad', 'utf8');

        const encrypted = engine.encrypt(plaintext, aad);
        const decrypted = engine.decrypt(encrypted.combined, aad);

        const passed = decrypted.equals(plaintext) && encrypted.nonce.length === 24;
        console.log(`XChaCha20-Poly1305 (24B Nonce) passed: ${passed ? '✅' : '❌'}`);
        return { passed };
    } catch (e) {
        console.error(e.message);
        return { passed: false };
    }
}

async function testSafetyNumbers() {
    console.log('--- Test P2: Safety Numbers Verifier (OOB) ---');
    try {
        const verifier = new SafetyNumberVerifier();
        const idKey = '04a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef';
        const userId = 'alice@hermes.io';

        const number = verifier.generateSafetyNumber(idKey, userId);
        const qr = verifier.generateQRCodeURI(idKey, userId);

        // Debe tener 6 bloques de 5 dígitos separados por espacios
        const blocks = number.split(' ');
        const passed = blocks.length === 6 && blocks.every(b => b.length === 5) && qr.startsWith('hermes://verify/');
        console.log(`Safety Number generated: ${number}`);
        console.log(`Safety Numbers OOB passed: ${passed ? '✅' : '❌'}`);
        return { passed };
    } catch (e) {
        console.error(e.message);
        return { passed: false };
    }
}

async function testTrafficPadding() {
    console.log('--- Test P3: Fixed Block Traffic Padding ---');
    try {
        const padder = new TrafficPadder();
        const shortMsg = Buffer.from('Hola mundo', 'utf8');
        const padded = padder.padToFixedBlock(shortMsg);

        // Como originalLen=10 + 4 = 14, debe ser acolchado a 256 bytes
        const sizePassed = padded.length === 256;
        const unpadded = padder.unpadFromFixedBlock(padded);
        const contentPassed = unpadded.equals(shortMsg);

        const passed = sizePassed && contentPassed;
        console.log(`Padded 10 bytes to ${padded.length} bytes fixed block.`);
        console.log(`Fixed Block Traffic Padding passed: ${passed ? '✅' : '❌'}`);
        return { passed };
    } catch (e) {
        console.error(e.message);
        return { passed: false };
    }
}

async function runFase5Tests() {
    console.log('='.repeat(60));
    console.log('🧪 FASE 5: MEJORAS POST-AUDITORÍA (P1, P2, P3)');
    console.log('='.repeat(60));

    const results = [
        await testXChaCha20Poly1305(),
        await testSafetyNumbers(),
        await testTrafficPadding()
    ];

    const passed = results.filter(r => r.passed).length;
    console.log('\n' + '='.repeat(60));
    console.log(`FASE 5: ${passed}/${results.length} tests pasados`);
    console.log('='.repeat(60));
}

runFase5Tests();
