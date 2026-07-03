// chat_manager.js

export class LocalChatManager {
    constructor() {
        // Map: targetId (contactId or groupId) -> array of messages
        this.history = {};
    }

    async load(storage) {
        this.history = await storage.load('hermes_messages') || {};
    }

    async save(storage) {
        await storage.save('hermes_messages', this.history);
    }

    getMessages(targetId) {
        return this.history[targetId] || [];
    }

    getUnreadCount(targetId) {
        const msgs = this.history[targetId] || [];
        return msgs.filter(m => m.unread === true).length;
    }

    async markAllAsRead(storage, targetId) {
        const msgs = this.history[targetId] || [];
        let changed = false;
        msgs.forEach(m => {
            if (m.unread) {
                m.unread = false;
                changed = true;
            }
        });
        if (changed) await this.save(storage);
    }

    async addMessage(storage, targetId, msg) {
        if (!this.history[targetId]) {
            this.history[targetId] = [];
        }
        // Evitar duplicados
        const exists = this.history[targetId].some(m => m.id === msg.id || (m.raw && msg.raw && m.raw.signature === msg.raw.signature));
        if (!exists) {
            if (!msg.timestamp_ms) {
                msg.timestamp_ms = Date.now();
            }
            this.history[targetId].push(msg);
            await this.save(storage);
        }
    }

    async deleteHistory(storage, targetId) {
        delete this.history[targetId];
        await this.save(storage);
    }

    async deleteMessage(storage, targetId, msgId) {
        if (this.history[targetId]) {
            this.history[targetId] = this.history[targetId].filter(m => m.id !== msgId);
            await this.save(storage);
        }
    }

    async editMessage(storage, targetId, msgId, newPlaintext) {
        if (this.history[targetId]) {
            const msg = this.history[targetId].find(m => m.id === msgId);
            if (msg) {
                msg.plaintext = newPlaintext;
                if (msg.raw) {
                    msg.raw.ciphertext_kem = ""; // clear original ciphertext to force plaintext cache usage
                }
                await this.save(storage);
            }
        }
    }

    async updateMessage(storage, targetId, msgId, updates) {
        if (this.history[targetId]) {
            const msg = this.history[targetId].find(m => m.id === msgId);
            if (msg) {
                Object.assign(msg, updates);
                await this.save(storage);
            }
        }
    }

    async updateMessageStatusById(storage, msgId, newStatus) {
        let changed = false;
        for (const targetId of Object.keys(this.history)) {
            const msg = this.history[targetId].find(m => m.id === msgId || (m.raw && m.raw.signature === msgId));
            if (msg) {
                msg.status = newStatus;
                changed = true;
            }
        }
        if (changed) await this.save(storage);
        return changed;
    }
}
