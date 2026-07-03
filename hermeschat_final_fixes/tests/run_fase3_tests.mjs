// tests/run_fase3_tests.mjs
import { MigrationManager } from '../fixes/FASE3_SUPPLY_CHAIN/fix_07_migrations.js';
import { CSPConfigurator } from '../fixes/FASE3_SUPPLY_CHAIN/fix_10_csp_headers.js';
import { SBOMGenerator } from '../fixes/FASE3_SUPPLY_CHAIN/fix_17_sbom_generator.js';
import { ProtocolGovernance } from '../fixes/FASE3_SUPPLY_CHAIN/fix_22_protocol_governance.js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

async function testMigrationManager() {
    console.log('--- Test 1: Migration Manager ---');
    const storageMock = {
        dataVersion: '1.0.0',
        async getDataVersion() { return this.dataVersion; },
        async setDataVersion(v) { this.dataVersion = v; },
        async getAllContacts() { return [{ name: 'Alice' }]; },
        async updateContact(c) {},
        async getAllUsers() { return [{ name: 'Bob', key_algorithm: 'P-256' }]; },
        async updateUser(u) {},
        async exportAll() { return { mock: 'state' }; },
        async importAll(state) {}
    };
    const manager = new MigrationManager(storageMock);
    manager.currentDataVersion = '2.0.0'; // Target version
    await manager.initialize(); // Runs pending
    
    // Check if it reached current version
    const finalVersion = await storageMock.getDataVersion();
    const passed = finalVersion === '2.0.0';
    console.log(`Migration passed: ${passed ? '✅' : '❌'}`);
    return { passed };
}

async function testReproducibleBuild() {
    console.log('--- Test 2: Reproducible Build (bash script) ---');
    let success = true;
    try {
        const scriptPath = 'hermeschat_final_fixes/fixes/FASE3_SUPPLY_CHAIN/fix_09_reproducible_builds.sh';
        execSync(`bash "${scriptPath}"`, { stdio: 'pipe' });
        
        if (fs.existsSync('pkg/hermes_crypto_wasm_bg.wasm') && fs.existsSync('pkg/manifest.json')) {
            console.log('Binario compilado y manifest generado.');
        } else {
            success = false;
        }
    } catch (e) {
        console.error(e.message);
        success = false;
    }
    console.log(`Reproducible Build passed: ${success ? '✅' : '❌'}`);
    return { passed: success };
}

async function testCSPHeaders() {
    console.log('--- Test 3: CSP Headers ---');
    const csp = new CSPConfigurator();
    const nonce = csp.generateNonce();
    const headers = csp.generateSecurityHeaders(nonce);
    
    const validation = csp.validateCSP(headers['Content-Security-Policy']);
    
    console.log(`CSP Validation: ${validation.valid ? '✅' : '❌'}`);
    if (validation.errors.length > 0) {
        validation.errors.forEach(e => console.log(`  - ${e}`));
    }
    
    return { passed: validation.valid };
}

async function testSBOMGenerator() {
    console.log('--- Test 4: SBOM Generator ---');
    const generator = new SBOMGenerator();
    const sbom = await generator.generate();
    
    const passed = sbom.sbom.cycloneDX.components.length > 0 && sbom.signature !== undefined;
    console.log(`SBOM generation passed: ${passed ? '✅' : '❌'}`);
    return { passed };
}

async function testSignedReleases() {
    console.log('--- Test 5: Signed Releases (bash script) ---');
    let success = true;
    try {
        const scriptPath = 'hermeschat_final_fixes/fixes/FASE3_SUPPLY_CHAIN/fix_18_signed_releases.sh';
        execSync(`bash "${scriptPath}"`, { stdio: 'pipe' });
        
        if (fs.existsSync('releases/dev/hermes_crypto_wasm_bg.wasm.sig')) {
            console.log('Artefactos firmados.');
        } else {
            success = false;
        }
    } catch (e) {
        console.error(e.message);
        success = false;
    }
    console.log(`Signed Releases passed: ${success ? '✅' : '❌'}`);
    return { passed: success };
}

async function testProtocolGovernance() {
    console.log('--- Test 6: Protocol Governance ---');
    const governance = new ProtocolGovernance();
    
    // Test: Versión compatible
    const result1 = governance.negotiateVersion(['2.0.0', '1.5.0']);
    console.log(`Negotiate v2.0: ${result1.success ? '✅' : '❌'}`);
    
    // Test: Versión deprecada
    const result2 = governance.negotiateVersion(['1.0.0']);
    console.log(`Reject v1.0: ${!result2.success ? '✅' : '❌'}`);
    
    // Test: Sin versión compatible
    const result3 = governance.negotiateVersion(['3.0.0']);
    console.log(`No compatible: ${!result3.success ? '✅' : '❌'}`);
    
    const passed = result1.success && !result2.success && !result3.success;
    console.log(`Protocol Governance passed: ${passed ? '✅' : '❌'}`);
    return { passed };
}

async function runAllFase3Tests() {
    console.log('='.repeat(60));
    console.log('🧪 FASE 3: SUPPLY CHAIN - TESTS DE SEGURIDAD');
    console.log('='.repeat(60));
    
    const results = [];
    
    results.push(await testMigrationManager());
    results.push(await testReproducibleBuild());
    results.push(await testCSPHeaders());
    results.push(await testSBOMGenerator());
    results.push(await testSignedReleases());
    results.push(await testProtocolGovernance());
    
    const passed = results.filter(r => r.passed).length;
    console.log('\n' + '='.repeat(60));
    console.log(`FASE 3: ${passed}/${results.length} tests pasados`);
    console.log('='.repeat(60));
}

runAllFase3Tests();
