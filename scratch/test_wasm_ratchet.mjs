import fs from 'fs';
import init, { WasmDoubleRatchet } from '../frontend/src/wasm/hermes_crypto_wasm.js';

async function main() {
    console.log('🔄 Inicializando módulo WASM con fs...');
    const wasmBuffer = fs.readFileSync(new URL('../frontend/src/wasm/hermes_crypto_wasm_bg.wasm', import.meta.url));
    await init(wasmBuffer);
    console.log('✅ Módulo WASM inicializado.');

    const secret = new Uint8Array(32);
    secret.fill(42);
    const remotePub = new Uint8Array(32);
    remotePub.fill(99);

    console.log('🔄 Instanciando WasmDoubleRatchet en Rust...');
    const ratchet = new WasmDoubleRatchet(secret, remotePub);
    console.log('✅ WasmDoubleRatchet creado correctamente en memoria Rust.');

    const plaintext = new TextEncoder().encode("¡Hola desde JS hacia Rust WASM Double Ratchet!");
    const aad = new TextEncoder().encode("header-aad");

    console.log('🔄 Cifrando mensaje en Rust WASM...');
    const envelope = ratchet.encrypt(plaintext, aad);
    console.log(`✅ Cifrado exitoso. Sobre serializado de ${envelope.length} bytes.`);

    console.log('🎉 Pruebas de WasmDoubleRatchet exitosas.');
}

main().catch(err => {
    console.error('❌ Error en test WASM:', err);
    process.exit(1);
});
