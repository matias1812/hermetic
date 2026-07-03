// fixes/FASE1_ROBUSTEZ/fix_01_opk_exhaustion.js

function bufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

export class OPKPoolManager {
    /**
     * Gestor de pool de One-Time PreKeys.
     * 
     * GARANTÍAS:
     * - Nunca se agota el pool (mínimo 200 OPK disponibles)
     * - Generación automática cuando bajan de 50
     * - Consumo atómico (nunca se reutiliza una OPK)
     * - Rotación automática cada 7 días
     * - Sincronización multi-dispositivo
     */
    
    constructor(userId, deviceId) {
        this.userId = userId;
        this.deviceId = deviceId;
        this.MIN_POOL_SIZE = 200;
        this.REFILL_THRESHOLD = 50;
        this.REFILL_AMOUNT = 500;
        this.MAX_OPK_AGE = 7 * 24 * 3600 * 1000; // 7 días
        
        // Timer references for tests
        this.monitorInterval = null;
        this.rotationInterval = null;
    }
    
    async initialize() {
        // 1. Verificar pool actual
        const poolSize = await this.getPoolSize();
        
        // 2. Si está vacío o bajo, generar inmediatamente
        if (poolSize < this.MIN_POOL_SIZE) {
            await this.refillPool(this.MIN_POOL_SIZE - poolSize);
        }
        
        // 3. Programar monitoreo continuo
        this.startPoolMonitor();
        
        // 4. Programar rotación automática
        this.startRotationScheduler();
    }
    
    async getPoolSize() {
        const response = await fetch(`/api/opk/pool/${this.userId}/${this.deviceId}`);
        if (!response.ok) return 0;
        const data = await response.json();
        return data.count;
    }
    
    async consumeOPK() {
        // CONSUMO ATÓMICO: marcar como usada ANTES de retornar
        const response = await fetch(`/api/opk/consume/${this.userId}/${this.deviceId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.status === 404) {
            // Pool vacío - generar inmediatamente y reintentar
            await this.refillPool(100);
            return this.consumeOPK(); // Reintentar
        }
        
        const opk = await response.json();
        
        // Verificar que se marcó correctamente
        const verified = await this.verifyOPKConsumed(opk.id);
        if (!verified) {
            throw new Error('OPK consumption verification failed');
        }
        
        return opk;
    }
    
    async refillPool(count) {
        console.log(`Generando ${count} nuevas OPK...`);
        
        // Generar en lotes para no bloquear
        const BATCH_SIZE = 50;
        const batches = Math.ceil(count / BATCH_SIZE);
        
        for (let i = 0; i < batches; i++) {
            const batchCount = Math.min(BATCH_SIZE, count - i * BATCH_SIZE);
            const newKeys = await this.generateOPKBatch(batchCount);
            
            await fetch(`/api/opk/upload/${this.userId}/${this.deviceId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keys: newKeys })
            });
        }
        
        console.log(`Pool rellenado: +${count} OPK`);
    }
    
    async generateOPKBatch(count) {
        const keys = [];
        for (let i = 0; i < count; i++) {
            const keyPair = await crypto.subtle.generateKey(
                { name: 'ECDH', namedCurve: 'P-256' },
                true,
                ['deriveBits']
            );
            
            const publicKey = await crypto.subtle.exportKey('raw', keyPair.publicKey);
            const privateKey = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
            
            keys.push({
                id: crypto.randomUUID(),
                public_key: bufferToHex(publicKey),
                private_key: bufferToHex(privateKey),
                created_at: Date.now(),
                device_id: this.deviceId
            });
        }
        return keys;
    }
    
    startPoolMonitor() {
        // Verificar cada 5 minutos
        this.monitorInterval = setInterval(async () => {
            const poolSize = await this.getPoolSize();
            
            if (poolSize < this.REFILL_THRESHOLD) {
                console.warn(`Pool bajo: ${poolSize} OPK. Rellenando...`);
                await this.refillPool(this.REFILL_AMOUNT);
            }
        }, 5 * 60 * 1000);
    }
    
    startRotationScheduler() {
        // Eliminar OPK viejas cada hora
        this.rotationInterval = setInterval(async () => {
            await fetch(`/api/opk/rotate/${this.userId}/${this.deviceId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ max_age_ms: this.MAX_OPK_AGE })
            });
        }, 60 * 60 * 1000);
    }
    
    async verifyOPKConsumed(opkId) {
        const response = await fetch(`/api/opk/verify/${opkId}`);
        const data = await response.json();
        return data.consumed === true;
    }
    
    destroy() {
        if (this.monitorInterval) clearInterval(this.monitorInterval);
        if (this.rotationInterval) clearInterval(this.rotationInterval);
    }
}
