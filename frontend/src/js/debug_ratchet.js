import crypto from 'crypto';
if (!globalThis.crypto) {
    globalThis.crypto = crypto.webcrypto;
}
globalThis.window = globalThis;
import { testDoubleRatchet } from './tests/double_ratchet_test.js';

testDoubleRatchet().then(res => {
    if (res) {
        console.log("🏆 SUITE DOUBLE RATCHET WASM: TODO PASÓ.");
        process.exit(0);
    } else {
        console.error("❌ SUITE DOUBLE RATCHET WASM: FALLÓ ALGÚN TEST.");
        process.exit(1);
    }
});
