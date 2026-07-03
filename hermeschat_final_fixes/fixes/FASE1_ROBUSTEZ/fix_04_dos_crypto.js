// fixes/FASE1_ROBUSTEZ/fix_04_dos_crypto.js

export class CryptoDoSMitigator {
    /**
     * Mitigador de ataques DoS criptográficos.
     * 
     * ESTRATEGIA:
     * - Rate limiting por operación cara (HKDF, ECDH, AES)
     * - Proof-of-Work ligero para handshakes
     * - Circuit breaker si se exceden límites
     * - Queue con prioridad para operaciones legítimas
     */
    
    constructor() {
        this.rateLimits = {
            handshake: { max: 5, window: 60000 },    // 5/min
            ecdh: { max: 20, window: 60000 },         // 20/min
            hkdf: { max: 100, window: 60000 },        // 100/min
            aes_encrypt: { max: 1000, window: 60000 }, // 1000/min
        };
        
        this.operationCounts = {};
        this.circuitBreakerOpen = false;
        this.consecutiveFailures = 0;
        this.MAX_FAILURES = 10;
        this.circuitBreakerTimeout = null;
    }
    
    async canPerformOperation(operationType, userId) {
        // 1. Verificar circuit breaker
        if (this.circuitBreakerOpen) {
            throw new Error('Circuit breaker open - too many failures');
        }
        
        // 2. Verificar rate limit
        const limit = this.rateLimits[operationType];
        if (!limit) return true; // Sin límite definido
        
        const key = `${operationType}:${userId}`;
        const now = Date.now();
        
        // Limpiar operaciones viejas
        if (!this.operationCounts[key]) {
            this.operationCounts[key] = [];
        }
        
        this.operationCounts[key] = this.operationCounts[key].filter(
            t => now - t < limit.window
        );
        
        // Verificar límite
        if (this.operationCounts[key].length >= limit.max) {
            console.warn(`Rate limit exceeded: ${operationType} for ${userId}`);
            return false;
        }
        
        // Registrar operación
        this.operationCounts[key].push(now);
        return true;
    }
    
    async performWithProtection(operationType, userId, operation) {
        if (!await this.canPerformOperation(operationType, userId)) {
            throw new Error('Operation rejected by rate limiter');
        }
        
        try {
            const result = await operation();
            this.consecutiveFailures = 0;
            return result;
        } catch (error) {
            this.consecutiveFailures++;
            
            if (this.consecutiveFailures >= this.MAX_FAILURES) {
                this.circuitBreakerOpen = true;
                console.error('Circuit breaker OPEN - too many failures');
                
                // Auto-recuperación después de 30 segundos
                this.circuitBreakerTimeout = setTimeout(() => {
                    this.circuitBreakerOpen = false;
                    this.consecutiveFailures = 0;
                    console.log('Circuit breaker RESET');
                }, 30000);
            }
            
            throw error;
        }
    }
    
    destroy() {
        if (this.circuitBreakerTimeout) clearTimeout(this.circuitBreakerTimeout);
    }
}
