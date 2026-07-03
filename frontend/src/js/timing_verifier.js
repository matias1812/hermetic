// timing_verifier.js
// Verificador de tiempo constante para auditar operaciones criptográficas.

export class TimingVerifier {
    static verifyConstantTime(operation, iterations = 1000) {
        const times = [];

        for (let i = 0; i < iterations; i++) {
            const start = performance.now();
            operation();
            times.push(performance.now() - start);
        }

        const mean = times.reduce((a, b) => a + b) / times.length;
        const variance = times.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / times.length;
        const stdDev = Math.sqrt(variance);
        const coeffVariation = (stdDev / (mean || 1)) * 100;

        console.log(`⏱️ Timing Verifier: μ=${mean.toFixed(4)}ms, σ=${stdDev.toFixed(4)}ms, CV=${coeffVariation.toFixed(2)}%`);

        // Menos del 5% de variación = considerado tiempo constante en entornos JS
        return coeffVariation < 5.0;
    }
}

window.TimingVerifier = TimingVerifier;
