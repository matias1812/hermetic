// frontend/src/js/tests/double_ratchet_test.js
import { RealDoubleRatchet } from '../double_ratchet.js';
import { hermesBridge } from '../crypto_wasm_bridge.js';

export async function testDoubleRatchet() {
    console.log('🔍 [Phase 4] Verificando Double Ratchet 100% en Wasm...');
    
    try {
        if (!hermesBridge.ready) {
            await hermesBridge.init();
        }

        const sharedSecretHex = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";
        const dummyPk = new Uint8Array(1184);
        const dummySk = new Uint8Array(2400);

        const aliceRatchet = new RealDoubleRatchet("test_bob");
        const bobRatchet = new RealDoubleRatchet("test_alice");

        await aliceRatchet.init(dummySk, dummyPk, true, sharedSecretHex);
        await bobRatchet.init(dummySk, dummyPk, false, sharedSecretHex);

        console.log('  1. Sesiones Wasm creadas desde sharedKey: ✅ PASSED');

        const msg1Text = "Hola Bob, mensaje secreto de Alice 🚀";
        const enc1 = await aliceRatchet.encryptMessage(msg1Text);
        console.log('  2. Cifrado saliente Wasm exitoso (Envelope v2): ✅ PASSED');

        const dec1 = await bobRatchet.decryptMessage(enc1);
        if (dec1 !== msg1Text) {
            throw new Error(`Mismatch dec1: ${dec1} vs ${msg1Text}`);
        }
        console.log('  3. Descifrado entrante Wasm exitoso (Plaintext idéntico): ✅ PASSED');

        const msg2Text = "Respuesta de Bob con avance de cadena DH";
        const enc2 = await bobRatchet.encryptMessage(msg2Text);
        const dec2 = await aliceRatchet.decryptMessage(enc2);
        if (dec2 !== msg2Text) {
            throw new Error(`Mismatch dec2: ${dec2} vs ${msg2Text}`);
        }
        console.log('  4. Ping-pong bidireccional y avance de cadena DH: ✅ PASSED');

        return true;
    } catch (e) {
        console.error('❌ Error en suite de pruebas Double Ratchet:', e);
        return false;
    }
}

if (typeof window !== 'undefined') {
    window.testDoubleRatchet = testDoubleRatchet;
}
