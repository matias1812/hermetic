// fixes/FASE1_ROBUSTEZ/fix_03_clock_drift.js

export class ClockDriftHandler {
    /**
     * Manejador de desincronización de relojes.
     * 
     * ESTRATEGIA:
     * - Sincronización NTP al iniciar (via servidor)
     * - Tolerancia de ±5 minutos en TTL
     * - Los timestamps se ajustan al tiempo del servidor
     * - No se confía en el reloj del cliente para seguridad
     */
    
    constructor() {
        this.serverTimeOffset = 0; // Diferencia entre cliente y servidor
        this.lastSyncTime = 0;
        this.SYNC_INTERVAL = 15 * 60 * 1000; // Cada 15 minutos
        this.syncTimer = null;
    }
    
    async initialize() {
        await this.syncWithServer();
        this.startPeriodicSync();
    }
    
    async syncWithServer() {
        try {
            // NTP simple: medir round-trip time
            const startTime = Date.now();
            const response = await fetch('/api/time');
            if (!response.ok) throw new Error('Time sync failed');
            
            const serverTime = await response.json();
            const endTime = Date.now();
            
            // Asumir que el servidor procesó en la mitad del RTT
            const rtt = endTime - startTime;
            const estimatedServerTime = serverTime.timestamp + (rtt / 2);
            
            this.serverTimeOffset = estimatedServerTime - Date.now();
            this.lastSyncTime = Date.now();
            
            console.log(`Clock synced. Offset: ${this.serverTimeOffset}ms, RTT: ${rtt}ms`);
        } catch (error) {
            console.warn('Clock sync failed, using last known offset');
        }
    }
    
    getServerTime() {
        return Date.now() + this.serverTimeOffset;
    }
    
    getAdjustedTTL(baseTTL) {
        // Añadir margen de tolerancia (±5 minutos)
        const tolerance = 5 * 60 * 1000;
        return baseTTL + tolerance;
    }
    
    isWithinTolerance(expiryTime) {
        const serverTime = this.getServerTime();
        const tolerance = 5 * 60 * 1000; // 5 minutos
        
        // Aceptar si está dentro del margen de tolerancia
        return expiryTime >= serverTime - tolerance;
    }
    
    startPeriodicSync() {
        this.syncTimer = setInterval(() => {
            this.syncWithServer();
        }, this.SYNC_INTERVAL);
    }
    
    destroy() {
        if (this.syncTimer) clearInterval(this.syncTimer);
    }
}
