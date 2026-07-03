// ephemeral_audio.js
import { state, showToast } from './state.js';
import { groupCrypto } from './group_crypto.js';

export class EphemeralAudioManager {
    /**
     * Gestor de audios efímeros.
     * Se borran cuando TODOS los destinatarios los escucharon.
     */
    constructor() {
        this.audioViews = {}; // {audioId: {viewedBy: Set, neededViews: Set}}
    }

    async sendEphemeralAudio(groupId, audioBlob, duration) {
        const group = state.groups.userGroups.find(g => g.id === groupId);
        if (!group) throw new Error('Grupo no encontrado');

        const currentUserId = state.currentUser ? state.currentUser.alias : 'creator';
        const members = group.members.filter(m => m !== currentUserId);

        const audioId = crypto.randomUUID();

        // Registrar quiénes deben escucharlo
        this.audioViews[audioId] = {
            viewedBy: new Set(),
            neededViews: new Set(members),
            groupId: groupId,
            senderId: currentUserId,
            createdAt: Date.now(),
            expiresAt: Date.now() + 3600000 // TTL 1 hora máximo
        };

        // Cifrar y enviar con clave de grupo
        const encryptedAudio = await groupCrypto.encryptGroupBlob(groupId, audioBlob);

        // Guardar localmente
        await state.mediaStorage.saveAudio(audioId, audioBlob);

        // Programar limpieza por TTL
        this.scheduleCleanup(audioId);

        showToast('Audio efímero enviado al grupo');
        return audioId;
    }

    markAsListened(audioId, userId) {
        if (!this.audioViews[audioId]) return;

        const tracker = this.audioViews[audioId];
        tracker.viewedBy.add(userId);

        // Verificar si TODOS lo escucharon
        if (this.allHaveListened(audioId)) {
            this.destroyAudio(audioId);
        }
    }

    allHaveListened(audioId) {
        const tracker = this.audioViews[audioId];
        if (!tracker) return false;

        for (const needed of tracker.neededViews) {
            if (!tracker.viewedBy.has(needed)) {
                return false;
            }
        }
        return true;
    }

    destroyAudio(audioId) {
        // Eliminar de IndexedDB
        state.mediaStorage.deleteAudio(audioId);

        // Eliminar burbuja del chat
        const bubble = document.querySelector(`[data-audio-id="${audioId}"]`);
        if (bubble) {
            bubble.style.transition = 'opacity 0.5s ease';
            bubble.style.opacity = '0';
            setTimeout(() => bubble.remove(), 500);
        }

        delete this.audioViews[audioId];
        console.log(`[EPHEMERAL_AUDIO] Audio ${audioId} destruido: todos los destinatarios lo escucharon.`);
    }

    scheduleCleanup(audioId) {
        setTimeout(() => {
            if (this.audioViews[audioId]) {
                this.destroyAudio(audioId);
            }
        }, 3600000);
    }
}

export const ephemeralAudio = new EphemeralAudioManager();
window.ephemeralAudio = ephemeralAudio;
