import { verifierSuite } from './verification_suite.js';

export class FinalEvaluation {
    calculateRealScore(testResults) {
        const total = testResults.length;
        const passed = testResults.filter(t => t.passed && !t.skipped).length;
        const skipped = testResults.filter(t => t.skipped).length;
        
        return {
            executed: total - skipped,
            passed: passed,
            skipped: skipped,
            score: total > 0 ? (passed / total) * 100 : 0, // Honest percentage out of ALL tests
            honest: true
        };
    }

    async evaluate() {
        console.log('\n' + '='.repeat(70));
        console.log('📊 EVALUACIÓN FINAL - HERMESCHAT vFINAL');
        console.log('='.repeat(70));

        // 1. Ejecutar la suite real de verificación
        console.log('\nEjecutando pruebas criptográficas reales...');
        
        // Hacemos el runAll internamente (ya arrojará los logs reales)
        const summary = await verifierSuite.runAll();
        
        // Flatten tests
        const allTests = [];
        for (const tests of Object.values(summary.results)) {
            allTests.push(...tests);
        }
        
        const realScoreData = this.calculateRealScore(allTests);
        
        console.log('\n📋 Verificación Formal y Ejecución Real:');
        console.log(`  Ejecutados: ${realScoreData.executed}`);
        console.log(`  Pasados: ${realScoreData.passed}`);
        console.log(`  Fallados/Saltados: ${realScoreData.executed - realScoreData.passed + realScoreData.skipped}`);

        console.log('\n' + '='.repeat(70));
        console.log(`🏆 NOTA FINAL (HONESTA): ${realScoreData.score.toFixed(1)}/100`);
        if (realScoreData.score >= 95) {
            console.log(`📋 CLASIFICACIÓN: 🏆 EXCELENTE - Verificación Completa y Exitosa`);
        } else if (realScoreData.score >= 80) {
            console.log(`📋 CLASIFICACIÓN: BUENO - Requiere corrección de críticos o falta compilación WASM`);
        } else {
            console.log(`📋 CLASIFICACIÓN: FALLIDO - Errores de seguridad o entorno incompleto`);
        }
        console.log('='.repeat(70));

        return realScoreData.score;
    }
}

export const finalEvaluation = new FinalEvaluation();
window.finalEvaluation = finalEvaluation;
