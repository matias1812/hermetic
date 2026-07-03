// group_manager.js

export class LocalGroupManager {
    constructor() {
        this.userGroups = []; // Array of groups: { id, name, creator_id, members, symmetric_key }
    }

    async load(storage) {
        this.userGroups = await storage.load('hermes_groups') || [];
    }

    async save(storage) {
        await storage.save('hermes_groups', this.userGroups);
    }

    async createGroup(storage, id, name, creatorId, memberIds, symmetricKey) {
        // Enforce 3+ members total
        const membersList = [...new Set([creatorId, ...memberIds])];
        
        const grp = {
            id: id,
            name: name,
            creator_id: creatorId,
            members: membersList,
            symmetric_key: symmetricKey
        };
        
        this.userGroups.push(grp);
        await this.save(storage);
        return grp;
    }

    async updateGroupName(storage, groupId, newName) {
        const grp = this.userGroups.find(g => g.id === groupId);
        if (grp) {
            grp.name = newName;
            await this.save(storage);
        }
    }

    async addMember(storage, groupId, userId) {
        const grp = this.userGroups.find(g => g.id === groupId);
        if (grp) {
            if (!grp.members.includes(userId)) {
                grp.members.push(userId);
                await this.save(storage);
            }
        }
    }

    async removeMember(storage, groupId, userId) {
        const grp = this.userGroups.find(g => g.id === groupId);
        if (grp) {
            grp.members = grp.members.filter(m => m !== userId);
            await this.save(storage);
        }
    }

    async deleteGroup(storage, groupId) {
        this.userGroups = this.userGroups.filter(g => g.id !== groupId);
        await this.save(storage);
    }

    async rotateGroupKey(storage, groupId, newSymmetricKeyHex) {
        const grp = this.userGroups.find(g => g.id === groupId);
        if (grp) {
            grp.symmetric_key = newSymmetricKeyHex;
            await this.save(storage);
            return grp;
        }
        return null;
    }
}
