// tests/security/build_integrity_test.js
import { SBOMGenerator } from '../../fixes/FASE3_SUPPLY_CHAIN/fix_17_sbom_generator.js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export async function testBuildIntegrity() {
    console.log('--- TEST: Build Integrity (SBOM & Scripts) ---');
    
    let success = true;
    
    // 1. Probar SBOM Generator
    console.log('1. Generando SBOM...');
    const projectRoot = path.resolve(process.cwd()); // Corriendo desde hermes_chat
    const sbom = new SBOMGenerator(projectRoot);
    const manifest = await sbom.generate();
    
    if (manifest.components.length === 0) {
        console.error('SBOM no detectó componentes');
        success = false;
    } else {
        console.log(`SBOM detectó ${manifest.components.length} componentes.`);
    }
    
    // 2. Probar script reproducible builds
    console.log('2. Ejecutando scripts bash (Reproducible Builds & Signed Releases)...');
    try {
        const script1Path = 'hermeschat_final_fixes/fixes/FASE3_SUPPLY_CHAIN/fix_09_reproducible_builds.sh';
        const script2Path = 'hermeschat_final_fixes/fixes/FASE3_SUPPLY_CHAIN/fix_18_signed_releases.sh';
        
        // Use standard bash
        const bashCmd = 'bash';
        execSync(`${bashCmd} "${script1Path}"`, { stdio: 'pipe' });
        execSync(`${bashCmd} "${script2Path}"`, { stdio: 'pipe' });
        
        const wasmPath = path.join(projectRoot, 'dist', 'wasm', 'hermes_crypto.wasm');
        const sigPath = path.join(projectRoot, 'dist', 'signatures', 'hermes_crypto.wasm.sig');
        
        if (fs.existsSync(wasmPath) && fs.existsSync(sigPath)) {
            console.log('Binario y firmas generadas correctamente.');
        } else {
            success = false;
        }
    } catch (error) {
        console.error('Fallo en la ejecución de scripts bash', error.message);
        success = false;
    }
    
    console.log('[Build Integrity Test]:', success ? '✅' : '❌');
    return success;
}
