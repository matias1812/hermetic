// fixes/FASE1_ROBUSTEZ/fix_13_race_conditions.js

export class AsyncMutex {
    /**
     * Mutex Asíncrono para evitar Race Conditions en JS.
     * 
     * GARANTÍAS:
     * - Operaciones críticas (como avance de Ratchet) no se sobreponen.
     * - Queue FIFO estricta.
     * - Prevención de Deadlocks con timeout.
     */
    
    constructor() {
        this.locked = false;
        this.queue = [];
    }
    
    async acquire(timeoutMs = 10000) {
        return new Promise((resolve, reject) => {
            const tryAcquire = () => {
                if (!this.locked) {
                    this.locked = true;
                    resolve(this.release.bind(this));
                } else {
                    const queueItem = { resolve, reject, timestamp: Date.now() };
                    this.queue.push(queueItem);
                    
                    // Deadlock prevention
                    if (timeoutMs > 0) {
                        setTimeout(() => {
                            const index = this.queue.indexOf(queueItem);
                            if (index !== -1) {
                                this.queue.splice(index, 1);
                                reject(new Error('Mutex acquire timeout'));
                            }
                        }, timeoutMs);
                    }
                }
            };
            
            tryAcquire();
        });
    }
    
    release() {
        if (!this.locked) return;
        
        if (this.queue.length > 0) {
            const next = this.queue.shift();
            // Ceder control al event loop
            setTimeout(() => next.resolve(this.release.bind(this)), 0);
        } else {
            this.locked = false;
        }
    }
    
    async runExclusive(operation, timeoutMs = 10000) {
        const release = await this.acquire(timeoutMs);
        try {
            return await operation();
        } finally {
            release();
        }
    }
}
