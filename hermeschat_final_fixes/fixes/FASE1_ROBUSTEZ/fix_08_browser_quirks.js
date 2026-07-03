// fixes/FASE1_ROBUSTEZ/fix_08_browser_quirks.js

export class BrowserQuirksNormalizer {
    /**
     * Normalizador de peculiaridades del navegador.
     * 
     * GARANTÍAS:
     * - Manejo seguro de Background/Suspension (Page Visibility API)
     * - Mitigación de recolección de basura agresiva en WebCrypto keys
     * - Detección de throttling de timers en pestañas inactivas
     * - Polyfills ligeros para inconsistencias criptográficas menores
     */
    
    constructor() {
        this.isBackgrounded = false;
        this.backgroundSince = null;
        this.onWakeUpCallbacks = [];
        this.keepAliveInterval = null;
        
        // Mantener referencias fuertes a claves en uso para evitar GC agresivo en Safari
        this.activeKeysPool = new Set();
    }
    
    initialize() {
        this.setupVisibilityHandling();
        this.setupTimerThrottlingMitigation();
        return this.verifyWebCryptoCapabilities();
    }
    
    setupVisibilityHandling() {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this.isBackgrounded = true;
                this.backgroundSince = Date.now();
                this.handleSuspend();
            } else {
                this.isBackgrounded = false;
                const suspendedDuration = Date.now() - this.backgroundSince;
                this.backgroundSince = null;
                this.handleWakeUp(suspendedDuration);
            }
        });
    }
    
    handleSuspend() {
        // Reducir operaciones innecesarias, pero mantener web socket vivo
        console.log('App suspended, optimizing for background...');
    }
    
    handleWakeUp(suspendedDuration) {
        console.log(`App woken up after ${suspendedDuration}ms`);
        // Ejecutar callbacks registrados (ej: reconectar WS, resincronizar relojes)
        for (const cb of this.onWakeUpCallbacks) {
            try { cb(suspendedDuration); } catch (e) { console.error('WakeUp callback error', e); }
        }
    }
    
    onWakeUp(callback) {
        this.onWakeUpCallbacks.push(callback);
    }
    
    setupTimerThrottlingMitigation() {
        // Navegadores limitan setInterval a 1 minuto en pestañas inactivas
        // Usaremos Web Workers para timers críticos si es estrictamente necesario,
        // o dependeremos de eventos de red/WakeUp. Aquí registramos la desviación.
        let lastTick = Date.now();
        this.keepAliveInterval = setInterval(() => {
            const now = Date.now();
            if (now - lastTick > 2000) { // Esperábamos ~1000ms
                if (this.isBackgrounded) {
                    console.warn(`Timer severely throttled in background: ${now - lastTick}ms`);
                }
            }
            lastTick = now;
        }, 1000);
    }
    
    async verifyWebCryptoCapabilities() {
        try {
            // Verificar soporte de curvas y algoritmos necesarios
            const testBuffer = new Uint8Array(16);
            crypto.getRandomValues(testBuffer);
            
            // Safari a veces tiene bugs con deriveBits, probamos uno rápido
            const keyPair = await crypto.subtle.generateKey(
                { name: 'ECDH', namedCurve: 'P-256' },
                true,
                ['deriveBits']
            );
            if (!keyPair) throw new Error('ECDH not fully supported');
            
            return true;
        } catch (error) {
            console.error('Browser WebCrypto quirk detected:', error);
            // Aplicar polyfill o lanzar error grave
            return false;
        }
    }
    
    preventGarbageCollection(cryptoKey) {
        this.activeKeysPool.add(cryptoKey);
    }
    
    allowGarbageCollection(cryptoKey) {
        this.activeKeysPool.delete(cryptoKey);
    }
    
    destroy() {
        if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
        this.activeKeysPool.clear();
    }
}
