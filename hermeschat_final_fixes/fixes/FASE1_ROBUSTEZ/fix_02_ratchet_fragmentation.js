// fixes/FASE1_ROBUSTEZ/fix_02_ratchet_fragmentation.js

export class RatchetStateSynchronizer {
    /**
     * Sincronizador de estado del Ratchet entre dispositivos.
     * 
     * ESTRATEGIA: Last-Write-Wins con Vector Clocks + Merge automático
     * 
     * CASOS CUBIERTOS:
     * - PC envía, Móvil offline, Tablet responde → PC reconcilia
     * - Dos dispositivos envían simultáneamente → Merge determinista
     * - Dispositivo perdido → Recuperación desde backup + reconcilación
     */
    
    constructor() {
        this.vectorClock = {};
        this.deviceId = this.getDeviceId();
        this.ratchetStates = new Map(); // {conversationId: RatchetState}
    }
    
    getDeviceId() {
        // En una app real, esto viene del entorno o auth
        return 'device_' + Math.random().toString(36).substr(2, 9);
    }
    
    /**
     * Guardar estado del ratchet con vector clock.
     */
    async saveRatchetState(conversationId, ratchetState) {
        // Incrementar nuestro contador en el vector clock
        this.vectorClock[this.deviceId] = (this.vectorClock[this.deviceId] || 0) + 1;
        
        const stateEntry = {
            ratchetState: ratchetState,
            vectorClock: { ...this.vectorClock },
            deviceId: this.deviceId,
            timestamp: Date.now(),
            checksum: await this.calculateChecksum(ratchetState)
        };
        
        // Guardar localmente
        await this.saveLocalState(conversationId, stateEntry);
        
        // Subir al servidor (cifrado)
        await this.uploadStateToServer(conversationId, stateEntry);
        
        return stateEntry;
    }
    
    /**
     * Cargar y reconciliar estado del ratchet.
     */
    async loadRatchetState(conversationId) {
        // 1. Cargar estado local
        const localState = await this.loadLocalState(conversationId);
        
        // 2. Cargar estado remoto (de otros dispositivos)
        const remoteState = await this.downloadStateFromServer(conversationId);
        
        // 3. Si no hay estado remoto, usar local
        if (!remoteState) return localState?.ratchetState;
        
        // 4. Si no hay estado local, usar remoto
        if (!localState) return remoteState.ratchetState;
        
        // 5. Comparar vector clocks
        const comparison = this.compareVectorClocks(
            localState.vectorClock,
            remoteState.vectorClock
        );
        
        switch (comparison) {
            case 'equal':
                return localState.ratchetState;
                
            case 'local_newer':
                // Nuestro estado es más reciente → subirlo
                await this.uploadStateToServer(conversationId, localState);
                return localState.ratchetState;
                
            case 'remote_newer':
                // Remoto es más reciente → usarlo
                await this.saveLocalState(conversationId, remoteState);
                return remoteState.ratchetState;
                
            case 'concurrent':
                // Conflicto → Merge
                const merged = await this.mergeRatchetStates(
                    localState.ratchetState,
                    remoteState.ratchetState
                );
                
                // Guardar estado mergeado
                const mergedEntry = {
                    ratchetState: merged,
                    vectorClock: this.mergeClocks(
                        localState.vectorClock,
                        remoteState.vectorClock
                    ),
                    deviceId: this.deviceId,
                    timestamp: Date.now(),
                    checksum: await this.calculateChecksum(merged)
                };
                
                await this.saveLocalState(conversationId, mergedEntry);
                await this.uploadStateToServer(conversationId, mergedEntry);
                
                return merged;
        }
    }
    
    /**
     * Merge de estados de ratchet concurrentes.
     */
    async mergeRatchetStates(stateA, stateB) {
        // Estrategia: conservar el estado con más mensajes procesados
        const totalMessagesA = (stateA.Ns || 0) + (stateA.Nr || 0);
        const totalMessagesB = (stateB.Ns || 0) + (stateB.Nr || 0);
        
        // Clonación profunda básica para no mutar el original
        const cloneA = JSON.parse(JSON.stringify(stateA, (k, v) => (v instanceof Map ? Array.from(v.entries()) : v)));
        const cloneB = JSON.parse(JSON.stringify(stateB, (k, v) => (v instanceof Map ? Array.from(v.entries()) : v)));
        
        if (cloneA.MKSKIPPED && Array.isArray(cloneA.MKSKIPPED)) cloneA.MKSKIPPED = new Map(cloneA.MKSKIPPED);
        else cloneA.MKSKIPPED = new Map();
        
        if (cloneB.MKSKIPPED && Array.isArray(cloneB.MKSKIPPED)) cloneB.MKSKIPPED = new Map(cloneB.MKSKIPPED);
        else cloneB.MKSKIPPED = new Map();
        
        if (totalMessagesA >= totalMessagesB) {
            // Conservar A, pero incorporar claves saltadas de B
            for (const [key, value] of cloneB.MKSKIPPED.entries()) {
                if (!cloneA.MKSKIPPED.has(key)) {
                    cloneA.MKSKIPPED.set(key, value);
                }
            }
            return cloneA;
        } else {
            // Conservar B, pero incorporar claves saltadas de A
            for (const [key, value] of cloneA.MKSKIPPED.entries()) {
                if (!cloneB.MKSKIPPED.has(key)) {
                    cloneB.MKSKIPPED.set(key, value);
                }
            }
            return cloneB;
        }
    }
    
    compareVectorClocks(a, b) {
        let aBefore = true;
        let bBefore = true;
        
        const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
        
        for (const key of allKeys) {
            const va = a[key] || 0;
            const vb = b[key] || 0;
            if (va < vb) bBefore = false;
            if (vb < va) aBefore = false;
        }
        
        if (aBefore && bBefore) return 'equal';
        if (aBefore) return 'local_newer';
        if (bBefore) return 'remote_newer';
        return 'concurrent';
    }
    
    mergeClocks(a, b) {
        const merged = {};
        const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
        for (const key of allKeys) {
            merged[key] = Math.max(a[key] || 0, b[key] || 0);
        }
        return merged;
    }
    
    async calculateChecksum(state) {
        const str = JSON.stringify(state, (k, v) => (v instanceof Map ? Array.from(v.entries()) : v));
        const buf = new TextEncoder().encode(str);
        const hash = await crypto.subtle.digest('SHA-256', buf);
        return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    
    // Mocks para Storage
    async saveLocalState(conversationId, stateEntry) {
        this.ratchetStates.set(conversationId, stateEntry);
    }
    
    async loadLocalState(conversationId) {
        return this.ratchetStates.get(conversationId);
    }
    
    async uploadStateToServer(conversationId, stateEntry) {
        // En producción: Enviar al endpoint sync
    }
    
    async downloadStateFromServer(conversationId) {
        // En producción: Obtener del endpoint sync
        return null;
    }
}
