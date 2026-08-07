// tests/test_cross_boundary.js
import { hermesBridge } from '../crypto_wasm_bridge.js';

export async function runCrossBoundaryTests() {
    console.log("[Test] Running Cross-Boundary Integration Tests");
    
    // Ensure hermesBridge is initialized
    await hermesBridge.init();
    
    let hasKeysExposed = false;
    let hasGetters = false;

    // Reflection test on hermesBridge
    for (const key in hermesBridge) {
        if (typeof hermesBridge[key] !== 'function') {
            const val = hermesBridge[key];
            if (typeof val === 'string' && val.length > 30) {
                // Suspicious raw key string exposed
                console.error(`[Test Failed] Suspicious long string property exposed on hermesBridge: ${key}`);
                hasKeysExposed = true;
            }
        }
    }
    
    // Check getters or prototypes exposing internals
    const proto = Object.getPrototypeOf(hermesBridge);
    const descriptors = Object.getOwnPropertyDescriptors(proto);
    for (const key in descriptors) {
        if (descriptors[key].get) {
            console.error(`[Test Failed] Getter exposed on hermesBridge prototype: ${key}`);
            hasGetters = true;
        }
    }
    
    // Ensure the rustCrypto instance doesn't expose memory buffers directly
    if (hermesBridge.rustCrypto) {
        for (const key in hermesBridge.rustCrypto) {
            const val = hermesBridge.rustCrypto[key];
            if (val instanceof Uint8Array || val instanceof ArrayBuffer) {
                console.error(`[Test Failed] Memory buffer exposed on rustCrypto: ${key}`);
                hasKeysExposed = true;
            }
        }
    }

    if (hasKeysExposed || hasGetters) {
        console.error("[Test] Cross-Boundary Integration Tests FAILED: Raw keys or memory might be accessible to JS.");
        return false;
    }

    console.log("[Test] Cross-Boundary Integration Tests PASSED: No raw keys exposed.");
    return true;
}
