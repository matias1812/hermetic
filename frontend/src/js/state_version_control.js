export class StateVersionControl {
    /**
     * Control de versiones para estado de recuperación.
     * 
     * PROBLEMA RESUELTO:
     * - Dispositivo 1 hace backup (v1)
     * - Dispositivo 2 hace backup (v2) - SOBRESCRIBE v1
     * - Dispositivo 1 hace backup (v3) - SOBRESCRIBE v2
     * - ¿Cuál es el estado real? -> Vector Clock lo resuelve
     */
    
    constructor() {
        this.vectorClock = {}; // {deviceId: counter}
        this.deviceId = this.generateDeviceId();
    }
    
    /**
     * Generar ID único de dispositivo.
     */
    generateDeviceId() {
        const stored = localStorage.getItem('hermes_device_id');
        if (stored) return stored;
        
        const id = crypto.randomUUID();
        localStorage.setItem('hermes_device_id', id);
        return id;
    }
    
    /**
     * Incrementar contador local.
     */
    incrementClock() {
        if (!this.vectorClock[this.deviceId]) {
            this.vectorClock[this.deviceId] = 0;
        }
        this.vectorClock[this.deviceId]++;
        
        return { ...this.vectorClock };
    }
    
    /**
     * Comparar dos vector clocks.
     * 
     * @returns {string} - 'before', 'after', 'concurrent', 'equal'
     */
    compare(a, b) {
        let aBefore = true;
        let bBefore = true;
        
        const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
        
        for (const key of allKeys) {
            const va = a[key] || 0;
            const vb = b[key] || 0;
            
            if (va < vb) aBefore = false;
            if (vb < va) bBefore = false;
        }
        
        if (aBefore && bBefore) return 'equal';
        if (aBefore) return 'before';
        if (bBefore) return 'after';
        return 'concurrent'; // Conflicto -> merge necesario
    }
    
    /**
     * Merge de estados concurrentes.
     */
    mergeStates(localState, remoteState) {
        const merged = {
            contacts: this.mergeContacts(localState.contacts, remoteState.contacts),
            groups: this.mergeGroups(localState.groups, remoteState.groups),
            groupKeys: this.mergeKeys(localState.groupKeys, remoteState.groupKeys),
            vectorClock: this.mergeClocks(localState.vectorClock, remoteState.vectorClock)
        };
        
        return merged;
    }
    
    /**
     * Merge de contactos (union con timestamp más reciente).
     */
    mergeContacts(local, remote) {
        const merged = { ...local };
        
        for (const [id, contact] of Object.entries(remote || {})) {
            if (!merged[id] || contact.timestamp > merged[id].timestamp) {
                merged[id] = contact;
            }
        }
        
        return merged;
    }
    
    /**
     * Merge de grupos (union con timestamp más reciente).
     */
    mergeGroups(local, remote) {
        const merged = { ...local };
        
        for (const [id, group] of Object.entries(remote || {})) {
            if (!merged[id] || group.timestamp > merged[id].timestamp) {
                merged[id] = group;
            }
        }
        
        return merged;
    }
    
    /**
     * Merge de claves (union con timestamp más reciente).
     */
    mergeKeys(local, remote) {
        const merged = { ...local };
        
        for (const [id, key] of Object.entries(remote || {})) {
            if (!merged[id] || key.timestamp > merged[id].timestamp) {
                merged[id] = key;
            }
        }
        
        return merged;
    }
    
    /**
     * Merge de vector clocks (max de cada entrada).
     */
    mergeClocks(a, b) {
        const merged = {};
        const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
        
        for (const key of allKeys) {
            merged[key] = Math.max(a[key] || 0, b[key] || 0);
        }
        
        return merged;
    }
}
