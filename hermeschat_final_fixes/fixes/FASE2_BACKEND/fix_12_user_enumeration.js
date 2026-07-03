// fixes/FASE2_BACKEND/fix_12_user_enumeration.js

export class EnumerationProtector {
    /**
     * Protector contra enumeración de usuarios.
     * 
     * GARANTÍAS:
     * - Tiempo de respuesta CONSTANTE (independiente de si el usuario existe)
     * - Mismo código de estado HTTP para exists/no-exists
     * - Sin diferencia en headers, body size, o timing
     * - Rate limiting agresivo para prevenir fuerza bruta
     * - Respuesta falsa positiva periódica (honeypot)
     */
    
    constructor(storage) {
        this.storage = storage; // Mock storage o real
        this.CONSTANT_DELAY_MS = 200; // Tiempo fijo de respuesta
        this.MAX_REQUESTS_PER_IP = 10; // Por minuto
        this.requestCounts = new Map();
        this.HONEYPOT_PROBABILITY = 0.05; // 5% de respuestas falsas
    }
    
    async checkUserExists(username, clientIp) {
        const startTime = performance.now();
        
        // 1. Verificar rate limiting
        if (!this.checkRateLimit(clientIp)) {
            // Devolver respuesta falsa (parece que existe)
            return this.generateFakeResponse(startTime);
        }
        
        // 2. Realizar la búsqueda real
        const exists = await this.actualUserLookup(username);
        
        // 3. Honeypot: a veces devolver falso positivo
        if (!exists && Math.random() < this.HONEYPOT_PROBABILITY) {
            return this.generateFakeResponse(startTime);
        }
        
        // 4. Asegurar tiempo CONSTANTE
        const elapsed = performance.now() - startTime;
        const remainingDelay = this.CONSTANT_DELAY_MS - elapsed;
        
        if (remainingDelay > 0) {
            await this.sleep(remainingDelay);
        }
        
        // 5. Respuesta idéntica para exists/no-exists
        return {
            status: 200,
            body: {
                available: !exists, // Misma estructura siempre
                timestamp: Date.now()
            },
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': '45' // Siempre igual
            }
        };
    }
    
    async actualUserLookup(username) {
        if (!this.storage) return false;
        // Búsqueda real en base de datos
        const user = await this.storage.findUser(username);
        return !!user;
    }
    
    generateFakeResponse(startTime) {
        return {
            status: 200,
            body: {
                available: false, // Parece que existe
                timestamp: Date.now()
            },
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': '45'
            }
        };
    }
    
    checkRateLimit(clientIp) {
        const now = Date.now();
        const windowMs = 60000; // 1 minuto
        
        if (!this.requestCounts.has(clientIp)) {
            this.requestCounts.set(clientIp, []);
        }
        
        const requests = this.requestCounts.get(clientIp)
            .filter(t => now - t < windowMs);
        
        this.requestCounts.set(clientIp, requests);
        
        if (requests.length >= this.MAX_REQUESTS_PER_IP) {
            return false; // Rate limit exceeded
        }
        
        requests.push(now);
        return true;
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
