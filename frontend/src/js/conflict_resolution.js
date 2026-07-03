export class ConflictResolver {
    /**
     * Resolución de conflictos para backups.
     * 
     * ESTRATEGIA:
     * 1. Intentar Last-Write-Wins (si timestamps no son concurrentes)
     * 2. Si son concurrentes -> Merge automático (union)
     * 3. Si merge no es posible -> Conservar ambos + notificar al usuario
     */
    
    constructor(versionControl) {
        this.vc = versionControl;
    }
    
    /**
     * Resolver conflicto entre estado local y remoto.
     */
    async resolve(localState, remoteState) {
        const localClock = localState.vectorClock || {};
        const remoteClock = remoteState.vectorClock || {};
        
        const comparison = this.vc.compare(localClock, remoteClock);
        
        switch (comparison) {
            case 'equal':
                // Mismo estado -> no hacer nada
                return { action: 'keep_local', state: localState };
                
            case 'before':
                // Local es más antiguo -> usar remoto
                return { action: 'use_remote', state: remoteState };
                
            case 'after':
                // Local es más reciente -> subir local
                return { action: 'upload_local', state: localState };
                
            case 'concurrent':
                // Conflicto -> merge
                const merged = this.vc.mergeStates(localState, remoteState);
                
                // Verificar si hubo pérdida de datos
                const conflicts = this.detectConflicts(localState, remoteState, merged);
                
                if (conflicts.length > 0) {
                    // Notificar al usuario
                    await this.notifyConflicts(conflicts);
                }
                
                return { action: 'merged', state: merged, conflicts };
                
            default:
                throw new Error('Invalid comparison result');
        }
    }
    
    /**
     * Detectar conflictos que no se pudieron resolver automáticamente.
     */
    detectConflicts(local, remote, merged) {
        const conflicts = [];
        
        // Contactos eliminados en un dispositivo pero modificados en otro
        for (const [id, localContact] of Object.entries(local.contacts || {})) {
            if (!remote.contacts?.[id] && merged.contacts?.[id]) {
                conflicts.push({
                    type: 'contact_deleted_elsewhere',
                    id: id,
                    name: localContact.alias || id,
                    resolution: 'kept'
                });
            }
        }
        
        // Grupos con cambios divergentes
        for (const [id, localGroup] of Object.entries(local.groups || {})) {
            const remoteGroup = remote.groups?.[id];
            if (remoteGroup && localGroup.members !== remoteGroup.members) {
                conflicts.push({
                    type: 'group_members_diverged',
                    id: id,
                    name: localGroup.name || id,
                    localMembers: localGroup.members,
                    remoteMembers: remoteGroup.members,
                    resolution: 'merged'
                });
            }
        }
        
        return conflicts;
    }
    
    /**
     * Notificar al usuario sobre conflictos.
     */
    async notifyConflicts(conflicts) {
        const conflictList = conflicts.map(c => 
            `<li>${c.type}: ${c.name} (resuelto: ${c.resolution})</li>`
        ).join('');
        
        // Asume que modalManager existe en window o se importa
        if (window.modalManager) {
            await window.modalManager.custom({
                title: '[ ⚠️ CONFLICTOS DETECTADOS ]',
                body: `
                    <p>Se detectaron cambios divergentes entre tus dispositivos.</p>
                    <p>Hermetic los ha resuelto automáticamente:</p>
                    <ul>${conflictList}</ul>
                    <p class="text-dim">Si algo no coincide, restaura desde un backup manual.</p>
                `,
                footer: `
                    <button class="btn-cyber w-full" onclick="modalManager.close()">
                        ENTENDIDO
                    </button>
                `,
                size: 'large'
            });
        } else {
            console.warn('[ConflictResolver] Conflictos detectados:', conflicts);
        }
    }
}
