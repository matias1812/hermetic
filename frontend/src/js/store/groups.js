// frontend/src/js/store/groups.js
import { state } from '../state.js';
import { hermesStore } from './hermes_store.js';

export class GroupsStoreModule {
    /**
     * Módulo claro para gestión de grupos en el Store.
     * Mantiene compatibilidad total con LocalGroupManager (group_manager.js).
     */
    
    async createGroup(groupData) {
        await hermesStore.dispatch('GROUP_CREATED', groupData);
        if (state.groups && !state.groups.userGroups.some(g => g.id === groupData.id)) {
            state.groups.userGroups.push(groupData);
        }
        return groupData;
    }
    
    async updateGroup(groupData) {
        await hermesStore.dispatch('GROUP_UPDATED', groupData);
        if (state.groups) {
            const idx = state.groups.userGroups.findIndex(g => g.id === groupData.id);
            if (idx !== -1) state.groups.userGroups[idx] = groupData;
        }
        return groupData;
    }
    
    async leaveGroup(groupId) {
        await hermesStore.dispatch('GROUP_LEFT', { id: groupId });
        if (state.groups) {
            state.groups.userGroups = state.groups.userGroups.filter(g => g.id !== groupId);
        }
    }
    
    getGroups() {
        return hermesStore.state.groups.length > 0
            ? hermesStore.state.groups
            : (state.groups ? state.groups.userGroups : []);
    }
    
    getGroupById(id) {
        return this.getGroups().find(g => g.id === id);
    }
}

export const groupsModule = new GroupsStoreModule();
