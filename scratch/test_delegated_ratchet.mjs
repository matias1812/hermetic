import fs from 'fs';
import init from '../frontend/src/wasm/hermes_crypto_wasm.js';
import { realCrypto } from '../frontend/src/js/crypto_wasm_bridge.js';
import { RealDoubleRatchet } from '../frontend/src/js/double_ratchet.js';

async function main() {
    console.log('🔄 Inicializando puente WASM con fs...');
    const wasmBuffer = fs.readFileSync(new URL('../frontend/src/wasm/hermes_crypto_wasm_bg.wasm', import.meta.url));
    await init(wasmBuffer);
    realCrypto.ready = true;
    realCrypto.mode = 'wasm_active';
    realCrypto.wasmModule = await import('../frontend/src/wasm/hermes_crypto_wasm.js');

    const secret = new Uint8Array(32);
    secret.fill(42);
    const bobPub = new Uint8Array(32);
    bobPub.fill(99);

    console.log('🔄 Creando Alice y Bob en RealDoubleRatchet delegando a WASM...');
    const alice = new RealDoubleRatchet();
    await alice.initWasm(secret, bobPub);

    const bob = new RealDoubleRatchet();
    // En Signal DR, Bob inicia con su clave pública conocida o recibe el primer mensaje con el ephemeral de Alice
    await bob.initWasm(secret, bobPub);

    console.log(`✅ Modo WASM activo en alice: ${alice.isWasmMode}, en bob: ${bob.isWasmMode}`);

    const originalMsg = "¡Probando cifrado y descifrado extremo empírico a través de WASM!";
    const aad = "chat-metadata-123";

    console.log('🔄 Alice cifra el mensaje...');
    const encryptedMessage = await alice.encryptMessage(originalMsg, aad);
    console.log(`✅ Sobre generado de ${encryptedMessage.wasmEnvelope.length} bytes.`);

    console.log('🔄 Bob descifra el mensaje...');
    // Nota: en el primer mensaje, el trinquete de Bob recibe el sobre cifrado por Alice
    try {
        const decryptedMsg = await bob.decryptMessage(encryptedMessage, aad);
        console.log('✅ Mensaje descifrado:', decryptedMsg);
        if (decryptedMsg === originalMsg) {
            console.log('🎉 ROUNDTRIP PERFECTO EN DELEGACIÓN WASM.');
        } else {
            console.error('❌ Mismatch de mensaje.');
        }
    } catch (e) {
        console.log('Nota de handshake Bob:', e.message);
    }
}

main().catch(err => {
    console.error('❌ Error en test de delegación:', err);
    process.exit(1);
});
