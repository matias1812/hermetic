// frontend/src/js/tests/full_flow_test.js
import { state } from '../state.js';
import { hermesStore } from '../store/hermes_store.js';
import { ephemeralStore } from '../ephemeral_store.js';

export class FullFlowTestSuite {
    /**
     * Suite de pruebas manuales (harness detrás de ?run_tests=true, no CI) que
     * ejercita los gestores REALES (LocalContactManager/LocalGroupManager/
     * LocalChatManager + hermes_kv_store) en vez de la capa de store paralela
     * que nunca estuvo conectada a la UI real (ver BACKLOG.md #7).
     * Requiere una sesión activa (state.storage ya desbloqueado).
     */

    async runAllTests() {
        console.log('🧪 ===============================================');
        console.log('🧪 INICIANDO SUITE DE PRUEBAS E2E DE CONSOLIDACIÓN');
        console.log('🧪 ===============================================');

        const results = {
            outbox: await this.testOutboxFlow(),
            contacts: await this.testContactsFlow(),
            groups: await this.testGroupsFlow(),
            ephemeral: await this.testEphemeralImages(),
            chat: await this.testChatMessaging()
        };

        const allPassed = Object.values(results).every(res => res === true);
        console.log('🧪 ===============================================');
        if (allPassed) {
            console.log('✅ SUITE E2E COMPLETADA: 100% DE PRUEBAS EXITOSAS');
        } else {
            console.warn('⚠️ ALGUNAS PRUEBAS REGISTRARON ADVERTENCIAS:', results);
        }
        console.log('🧪 ===============================================');
        return results;
    }

    async testOutboxFlow() {
        console.log('🧪 TEST: Cola de outbox (hermesStore, persistida sobre hermes_kv_store)');
        try {
            const msgId = 'outbox_e2e_' + Date.now();
            await hermesStore.dispatch('OUTBOX_ADDED', { id: msgId, targetId: 'peer_mock' });
            const addedOk = hermesStore.state.outbox.some(m => m.id === msgId);

            const reloaded = new (Object.getPrototypeOf(hermesStore).constructor)();
            await reloaded.initialize();
            const persistedOk = reloaded.state.outbox.some(m => m.id === msgId);

            await hermesStore.dispatch('OUTBOX_REMOVED', { id: msgId });
            const removedOk = !hermesStore.state.outbox.some(m => m.id === msgId);

            const passed = addedOk && persistedOk && removedOk;
            console.log(`Flujo de outbox: ${passed ? '✅ EXITOSO' : '❌ FALLÓ'}`);
            return passed;
        } catch (e) {
            console.error('❌ Error en testOutboxFlow:', e);
            return false;
        }
    }

    async testContactsFlow() {
        console.log('🧪 TEST: Flujo de Contactos (Agregar/Consultar/Eliminar)');
        try {
            const testId = 'contact_e2e_' + Date.now();
            await state.contacts.acceptRequest(state.storage, testId, 'mock_shared_key_e2e');

            const addedOk = state.contacts.contacts.includes(testId)
                && state.contacts.sharedKeys[testId] === 'mock_shared_key_e2e';

            await state.contacts.removeContact(state.storage, testId);
            const removedOk = !state.contacts.contacts.includes(testId);

            const passed = addedOk && removedOk;
            console.log(`Flujo de contactos: ${passed ? '✅ EXITOSO' : '❌ FALLÓ'}`);
            return passed;
        } catch (e) {
            console.error('❌ Error en testContactsFlow:', e);
            return false;
        }
    }

    async testGroupsFlow() {
        console.log('🧪 TEST: Flujo de Grupos (Crear/Modificar/Salir)');
        try {
            const groupId = 'group_e2e_' + Date.now();
            await state.groups.createGroup(state.storage, groupId, 'Grupo E2E', 'me', ['Alice', 'Bob'], 'mock_symmetric_key');

            let fetched = state.groups.userGroups.find(g => g.id === groupId);
            const createdOk = fetched && fetched.name === 'Grupo E2E';

            await state.groups.updateGroupName(state.storage, groupId, 'Grupo E2E Modificado');
            fetched = state.groups.userGroups.find(g => g.id === groupId);
            const updatedOk = fetched && fetched.name === 'Grupo E2E Modificado';

            await state.groups.deleteGroup(state.storage, groupId);
            const leftOk = !state.groups.userGroups.some(g => g.id === groupId);

            const passed = createdOk && updatedOk && leftOk;
            console.log(`Flujo de grupos: ${passed ? '✅ EXITOSO' : '❌ FALLÓ'}`);
            return passed;
        } catch (e) {
            console.error('❌ Error en testGroupsFlow:', e);
            return false;
        }
    }

    async testEphemeralImages() {
        console.log('🧪 TEST: Imagen efímera — visible en memoria, nunca en disco, destruida al verla');
        try {
            const targetId = 'recipient_mock_' + Date.now();
            const imgMsg = { id: 'img_e2e_' + Date.now(), type: 'ephemeral_image', plaintext: 'data:image/png;base64,AAA=', viewed_by: [] };

            // Recepción real: sync_manager.js hace exactamente esto (ephemeralStore.add),
            // nunca state.chats.addMessage, para tipos efímeros.
            ephemeralStore.add(targetId, imgMsg);
            const visibleViaGetMessages = state.chats.getMessages(targetId).some(m => m.id === imgMsg.id);
            const neverOnDisk = !(state.chats.history[targetId] || []).some(m => m.id === imgMsg.id);

            // "Verla" (marcar vista) y destruirla, como hace message_renderer.js al cerrar el modal.
            imgMsg.viewed_by.push('recipient_mock');
            ephemeralStore.remove(targetId, imgMsg.id);
            const goneAfterDestroy = !state.chats.getMessages(targetId).some(m => m.id === imgMsg.id);

            const passed = visibleViaGetMessages && neverOnDisk && goneAfterDestroy;
            console.log(`Imágenes efímeras: ${passed ? '✅ EXITOSO' : '❌ FALLÓ'}`);
            return passed;
        } catch (e) {
            console.error('❌ Error en testEphemeralImages:', e);
            return false;
        }
    }

    async testChatMessaging() {
        console.log('🧪 TEST: Envío y recepción de mensajes 1:1 (hermes_messages)');
        try {
            const targetId = 'conv_e2e_' + Date.now();
            await state.chats.addMessage(state.storage, targetId, { id: 'm1', text: 'Hola E2E', sender: 'me' });
            await state.chats.addMessage(state.storage, targetId, { id: 'm2', text: 'Respuesta E2E', sender: 'peer' });

            const messages = state.chats.getMessages(targetId);
            const passed = messages.length === 2 && messages[0].text === 'Hola E2E' && messages[1].text === 'Respuesta E2E';
            console.log(`Mensajería 1:1: ${passed ? '✅ EXITOSO' : '❌ FALLÓ'}`);

            await state.chats.deleteHistory(state.storage, targetId);
            return passed;
        } catch (e) {
            console.error('❌ Error en testChatMessaging:', e);
            return false;
        }
    }
}

export const fullFlowSuite = new FullFlowTestSuite();
