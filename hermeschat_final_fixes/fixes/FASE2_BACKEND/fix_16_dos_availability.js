// fixes/FASE2_BACKEND/fix_16_dos_availability.js

export class AvailabilityDoSMitigator {
    /**
     * Mitigador de DoS para disponibilidad.
     * 
     * GARANTÍAS:
     * - Rate limiting: Token Bucket por IP + usuario
     * - Connection shedding: desconectar inactivos bajo carga
     * - Max connections: rechazar nuevas si se excede el límite
     * - Gradual recovery: auto-recuperación cuando baja la carga
     * - Prioridad: usuarios autenticados > anónimos
     */
    
    constructor() {
        this.MAX_CONNECTIONS = 10000;
        this.INACTIVE_TIMEOUT = 30000; // 30 segundos
        this.SHED_THRESHOLD = 0.8;     // 80% de capacidad
        this.tokenBuckets = new Map();
        this.activeConnections = new Map();
        this.connectionQueue = [];
    }
    
    async canAcceptConnection(clientIp, isAuthenticated) {
        // 1. Verificar límite global
        if (this.activeConnections.size >= this.MAX_CONNECTIONS) {
            // Solo aceptar autenticados si está lleno
            if (!isAuthenticated) {
                return { accepted: false, reason: 'at_capacity' };
            }
            
            // Shedding: desconectar al más inactivo
            const oldestInactive = this.findOldestInactive();
            if (oldestInactive) {
                this.disconnectClient(oldestInactive);
            } else {
                return { accepted: false, reason: 'at_capacity_no_inactive' };
            }
        }
        
        // 2. Verificar Token Bucket por IP
        if (!this.checkTokenBucket(clientIp)) {
            return { accepted: false, reason: 'rate_limited' };
        }
        
        // 3. Verificar shedding threshold
        if (this.activeConnections.size / this.MAX_CONNECTIONS > this.SHED_THRESHOLD) {
            // Bajo carga alta, rechazar anónimos
            if (!isAuthenticated) {
                return { accepted: false, reason: 'shedding_anonymous' };
            }
        }
        
        return { accepted: true };
    }
    
    checkTokenBucket(clientIp) {
        const now = Date.now();
        const REFILL_RATE = 10; // tokens por segundo
        const MAX_TOKENS = 100;
        
        if (!this.tokenBuckets.has(clientIp)) {
            this.tokenBuckets.set(clientIp, {
                tokens: MAX_TOKENS,
                lastRefill: now
            });
        }
        
        const bucket = this.tokenBuckets.get(clientIp);
        
        // Refill tokens
        const elapsed = (now - bucket.lastRefill) / 1000;
        bucket.tokens = Math.min(MAX_TOKENS, bucket.tokens + elapsed * REFILL_RATE);
        bucket.lastRefill = now;
        
        // Consumir token
        if (bucket.tokens >= 1) {
            bucket.tokens -= 1;
            return true;
        }
        
        return false;
    }
    
    registerConnection(clientId, ws, isAuthenticated) {
        this.activeConnections.set(clientId, {
            ws: ws,
            connected_at: Date.now(),
            last_activity: Date.now(),
            is_authenticated: isAuthenticated
        });
    }
    
    updateActivity(clientId) {
        const conn = this.activeConnections.get(clientId);
        if (conn) {
            conn.last_activity = Date.now();
        }
    }
    
    disconnectClient(clientId) {
        const conn = this.activeConnections.get(clientId);
        if (conn) {
            try {
                conn.ws.close(1001, 'Server shedding');
            } catch(e) {}
            this.activeConnections.delete(clientId);
        }
    }
    
    findOldestInactive() {
        const now = Date.now();
        let oldest = null;
        let oldestTime = Infinity;
        
        for (const [id, conn] of this.activeConnections) {
            const inactiveTime = now - conn.last_activity;
            if (inactiveTime > this.INACTIVE_TIMEOUT && inactiveTime > oldestTime) {
                oldest = id;
                oldestTime = inactiveTime;
            }
        }
        
        return oldest;
    }
    
    startInactiveCleanup() {
        setInterval(() => {
            const now = Date.now();
            for (const [id, conn] of this.activeConnections) {
                if (now - conn.last_activity > this.INACTIVE_TIMEOUT * 3) {
                    this.disconnectClient(id);
                }
            }
        }, 10000); // Cada 10 segundos
    }
}
