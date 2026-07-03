// tests/security/csp_validation_test.js
import { CSPHeadersGenerator } from '../../fixes/FASE3_SUPPLY_CHAIN/fix_10_csp_headers.js';

export async function testCSPValidation() {
    console.log('--- TEST: CSP Validation ---');
    
    const generator = new CSPHeadersGenerator();
    const nonce = generator.generateNonce();
    const headerString = generator.generateHeader(nonce);
    
    // Asertos de seguridad
    const noUnsafeInline = !headerString.includes("'unsafe-inline'");
    const noUnsafeEvalScript = !headerString.includes("script-src 'unsafe-eval'");
    const hasNonce = headerString.includes(`'nonce-${nonce}'`);
    const isWasmIsolated = headerString.includes("wasm-unsafe-eval 'self'"); // O algo similar según lo definido
    
    console.log(`CSP contains 'unsafe-inline': ${!noUnsafeInline}`);
    console.log(`CSP contains 'unsafe-eval' for scripts: ${!noUnsafeEvalScript}`);
    console.log(`CSP contains correct Nonce: ${hasNonce}`);
    
    const result = noUnsafeInline && noUnsafeEvalScript && hasNonce;
    console.log('[CSP Validation]:', result ? '✅' : '❌');
    return result;
}
