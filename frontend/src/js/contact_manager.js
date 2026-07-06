// contact_manager.js

export class LocalContactManager {
    constructor() {
        this.contacts = [];           // Accepted contact IDs (strings)
        this.contactData = [];        // List of full objects: { contact_id, status, shared_key }
        this.sharedKeys = {};         // Map: contact_id -> shared_key hex
        this.blockedContacts = [];    // List of blocked contact IDs
        this.onlineStatuses = {};     // Map: contact_id -> bool
    }

    async load(storage) {
        this.contacts = await storage.load('hermes_contacts') || [];
        this.contactData = await storage.load('hermes_contact_data') || [];
        this.sharedKeys = await storage.load('hermes_shared_keys') || {};
        this.blockedContacts = await storage.load('hermes_blocked') || [];

        // Auto-sincronizar para evitar inconsistencias visuales
        this.contactData.forEach(c => {
            if (c.status === 'accepted' && !this.contacts.includes(c.contact_id)) {
                this.contacts.push(c.contact_id);
            }
        });
    }

    async save(storage) {
        await storage.save('hermes_contacts', this.contacts);
        await storage.save('hermes_contact_data', this.contactData);
        await storage.save('hermes_shared_keys', this.sharedKeys);
        await storage.save('hermes_blocked', this.blockedContacts);
    }

    async addSentRequest(storage, contactId) {
        // Añadir solicitud enviada
        this.contactData = this.contactData.filter(c => c.contact_id !== contactId);
        this.contactData.push({
            contact_id: contactId,
            status: 'pending_sent',
            shared_key: null
        });
        await this.save(storage);
    }

    async addReceivedRequest(storage, contactId) {
        // Añadir solicitud recibida
        this.contactData = this.contactData.filter(c => c.contact_id !== contactId);
        this.contactData.push({
            contact_id: contactId,
            status: 'pending_received',
            shared_key: null
        });
        await this.save(storage);
    }

    async acceptRequest(storage, contactId, sharedKey) {
        this.contactData = this.contactData.filter(c => c.contact_id !== contactId);
        this.contactData.push({
            contact_id: contactId,
            status: 'accepted',
            shared_key: sharedKey
        });
        if (!this.contacts.includes(contactId)) {
            this.contacts.push(contactId);
        }
        this.sharedKeys[contactId] = sharedKey;
        await this.save(storage);

        if (typeof window !== 'undefined' && window.state?.sync?.getOrInitRatchet) {
            window.state.sync.getOrInitRatchet(contactId).catch(err => {
                console.warn(`[DoubleRatchet] Post-accept init error for ${contactId}:`, err);
            });
        }
    }

    async rejectRequest(storage, contactId) {
        this.contactData = this.contactData.filter(c => c.contact_id !== contactId);
        this.contacts = this.contacts.filter(c => c !== contactId);
        delete this.sharedKeys[contactId];
        await this.save(storage);
    }

    async removeContact(storage, contactId) {
        await this.rejectRequest(storage, contactId);
    }

    async blockContact(storage, contactId) {
        if (!this.blockedContacts.includes(contactId)) {
            this.blockedContacts.push(contactId);
        }
        await this.save(storage);
    }

    async unblockContact(storage, contactId) {
        this.blockedContacts = this.blockedContacts.filter(c => c !== contactId);
        await this.save(storage);
    }

    async verifyContactOOB(storage, contactId, verified = true) {
        const contact = this.contactData.find(c => c.contact_id === contactId);
        if (contact) {
            contact.oobVerified = verified;
            await this.save(storage);
        }
    }

    async setPeerVerifiedMe(storage, contactId, verified = true) {
        const contact = this.contactData.find(c => c.contact_id === contactId);
        if (contact) {
            contact.peerVerifiedMe = verified;
            await this.save(storage);
        }
    }

    isContactVerifiedOOB(contactId) {
        const contact = this.contactData.find(c => c.contact_id === contactId);
        return contact ? !!contact.oobVerified : false;
    }

    getContactOOBStatus(contactId) {
        const contact = this.contactData.find(c => c.contact_id === contactId);
        if (!contact) return { meVerified: false, peerVerified: false, mutual: false };
        const meVerified = !!contact.oobVerified;
        const peerVerified = !!contact.peerVerifiedMe;
        return {
            meVerified,
            peerVerified,
            mutual: meVerified && peerVerified
        };
    }
}
