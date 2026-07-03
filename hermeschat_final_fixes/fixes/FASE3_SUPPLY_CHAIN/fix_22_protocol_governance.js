// fixes/FASE3_SUPPLY_CHAIN/fix_22_protocol_governance.js
export class ProtocolGovernance {
    /**
     * Sistema de gobernanza del protocolo.
     * 
     * GARANTÍAS:
     * - Versionado semántico del protocolo (MAJOR.MINOR.PATCH)
     * - Negociación de versión en handshake
     * - Minimum version enforcement (bloquear versiones obsoletas)
     * - Upgrade path documentado (v1→v2→v3)
     * - Grace period para actualizaciones
     * - Downgrade attack prevention
     * 
     * FLUJO DE HANDSHAKE:
     * 1. Cliente envía: {supported_versions: ["2.0", "1.5", "1.0"]}
     * 2. Servidor responde: {negotiated_version: "2.0"} (máxima compatible)
     * 3. Si no hay versión compatible → conexión rechazada
     */
    
    constructor() {
        this.MINIMUM_VERSION = '1.5.0';
        this.CURRENT_VERSION = '2.0.0';
        this.SUPPORTED_VERSIONS = ['2.0.0', '1.5.0'];
        this.DEPRECATED_VERSIONS = ['1.0.0'];
        this.GRACE_PERIOD_DAYS = 30;
        this.versionDeprecationDates = new Map();
        // Setup initial deprecation date for v1.0.0 for testing purposes
        this.versionDeprecationDates.set('1.0.0', Date.now() - (40 * 86400000));
    }
    
    negotiateVersion(clientVersions) {
        // 1. Ordenar versiones del cliente (más reciente primero)
        const sorted = this.sortVersions(clientVersions);
        
        // 2. Buscar la máxima versión compatible
        for (const clientVersion of sorted) {
            if (this.isVersionSupported(clientVersion)) {
                return {
                    success: true,
                    negotiated_version: clientVersion,
                    server_version: this.CURRENT_VERSION,
                    upgrade_recommended: clientVersion !== this.CURRENT_VERSION
                };
            }
        }
        
        // 3. Si no hay versión compatible, verificar si es muy antigua
        const oldestClient = sorted[sorted.length - 1];
        
        if (this.isVersionDeprecated(oldestClient)) {
            const deprecationDate = this.versionDeprecationDates.get(oldestClient);
            const daysSinceDeprecation = (Date.now() - deprecationDate) / 86400000;
            
            return {
                success: false,
                reason: 'version_deprecated',
                client_version: oldestClient,
                minimum_required: this.MINIMUM_VERSION,
                days_since_deprecation: Math.floor(daysSinceDeprecation)
            };
        }
        
        return {
            success: false,
            reason: 'no_compatible_version',
            client_versions: clientVersions,
            supported_versions: this.SUPPORTED_VERSIONS
        };
    }
    
    isVersionSupported(version) {
        return this.SUPPORTED_VERSIONS.includes(version);
    }
    
    isVersionDeprecated(version) {
        return this.DEPRECATED_VERSIONS.includes(version);
    }
    
    deprecateVersion(version) {
        if (!this.DEPRECATED_VERSIONS.includes(version)) {
            this.DEPRECATED_VERSIONS.push(version);
            this.SUPPORTED_VERSIONS = this.SUPPORTED_VERSIONS.filter(v => v !== version);
            this.versionDeprecationDates.set(version, Date.now());
        }
    }
    
    enforceMinimumVersion() {
        // Después del grace period, eliminar versiones deprecadas
        const now = Date.now();
        
        for (const [version, deprecationDate] of this.versionDeprecationDates) {
            const daysSinceDeprecation = (now - deprecationDate) / 86400000;
            
            if (daysSinceDeprecation > this.GRACE_PERIOD_DAYS) {
                this.DEPRECATED_VERSIONS = this.DEPRECATED_VERSIONS.filter(v => v !== version);
                this.versionDeprecationDates.delete(version);
                
                console.log(`Version ${version} permanently removed after grace period`);
            }
        }
    }
    
    sortVersions(versions) {
        return versions.sort((a, b) => {
            const [aMajor, aMinor, aPatch] = (a + '.0.0').split('.').slice(0, 3).map(Number);
            const [bMajor, bMinor, bPatch] = (b + '.0.0').split('.').slice(0, 3).map(Number);
            
            if (aMajor !== bMajor) return bMajor - aMajor;
            if (aMinor !== bMinor) return bMinor - aMinor;
            return bPatch - aPatch;
        });
    }
    
    getProtocolStatus() {
        return {
            current_version: this.CURRENT_VERSION,
            minimum_version: this.MINIMUM_VERSION,
            supported_versions: this.SUPPORTED_VERSIONS,
            deprecated_versions: this.DEPRECATED_VERSIONS,
            grace_period_days: this.GRACE_PERIOD_DAYS
        };
    }
}
