// frontend/src/js/tests/full_flow_test.js
import { hermesStore } from '../store/hermes_store.js';
import { contactsModule, groupsModule, chatModule } from '../store/index.js';
import { ephemeralSync } from '../ephemeral_sync.js';
import { testPersistenceAfterReload, testConcurrentLocks } from './persistence_test.js';

export class FullFlowTestSuite {
    /**
     * Suite de Pruebas E2E para verificar que la consolidación arquitectónica
     * no alteró ni rompió ninguna funcionalidad y que la persistencia F5 es del 100%.
     */
    
    async runAllTests() {
        console.log('🧪 ===============================================');
        console.log('🧪 INICIANDO SUITE DE PRUEBAS E2E DE CONSOLIDACIÓN');
        console.log('🧪 ===============================================');
        
        const results = {
            persistence: await this.testPersistence(),
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
    
    async testPersistence() {
        try {
            return await testPersistenceAfterReload();
        } catch (e) {
            console.error('❌ Error en testPersistence:', e);
            return false;
        }
    }

    async testConcurrencyLocks() {
        try {
            return await testConcurrentLocks();
        } catch (e) {
            console.error('❌ Error en testConcurrencyLocks:', e);
            return false;
        }
    }
    
    async testContactsFlow() {
        console.log('🧪 TEST: Flujo de Contactos (Agregar/Consultar/Eliminar)');
        try {
            const testId = 'contact_e2e_' + Date.now();
            await contactsModule.addContact({ id: testId, alias: 'Alice E2E', publicKey: 'pk_mock_e2e' });
            
            const fetched = contactsModule.getContactById(testId);
            const addedOk = fetched && fetched.alias === 'Alice E2E';
            
            await contactsModule.removeContact(testId);
            const removedOk = !contactsModule.getContactById(testId);
            
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
            await groupsModule.createGroup({ id: groupId, name: 'Grupo E2E', members: ['Alice', 'Bob'] });
            
            let fetched = groupsModule.getGroupById(groupId);
            const createdOk = fetched && fetched.name === 'Grupo E2E';
            
            await groupsModule.updateGroup({ id: groupId, name: 'Grupo E2E Modificado', members: ['Alice', 'Bob', 'Charlie'] });
            fetched = groupsModule.getGroupById(groupId);
            const updatedOk = fetched && fetched.name === 'Grupo E2E Modificado';
            
            await groupsModule.leaveGroup(groupId);
            const leftOk = !groupsModule.getGroupById(groupId);
            
            const passed = createdOk && updatedOk && leftOk;
            console.log(`Flujo de grupos: ${passed ? '✅ EXITOSO' : '❌ FALLÓ'}`);
            return passed;
        } catch (e) {
            console.error('❌ Error en testGroupsFlow:', e);
            return false;
        }
    }
    
    async testEphemeralImages() {
        console.log('🧪 TEST: Flujo de Imágenes Efímeras (Destrucción en emisor/receptor)');
        try {
            const mockBlob = new Blob(['mock_image_bytes'], { type: 'image/png' });
            const sendRes = await ephemeralSync.sendEphemeralImage(mockBlob, 'recipient_mock', 5);
            
            const imageId = sendRes.imageId;
            const registeredSender = ephemeralSync.ephemeralRegistry.has(imageId);
            
            // Simular que el receptor abre la imagen
            await ephemeralSync.markAsViewed(imageId);
            const entry = ephemeralSync.ephemeralRegistry.get(imageId);
            const viewedOk = entry && entry.viewedByRecipient === true;
            
            // Simular destrucción inmediata
            ephemeralSync.destroyImage(imageId);
            const destroyedOk = !ephemeralSync.ephemeralRegistry.has(imageId);
            
            const passed = registeredSender && viewedOk && destroyedOk;
            console.log(`Imágenes efímeras: ${passed ? '✅ EXITOSO' : '❌ FALLÓ'}`);
            return passed;
        } catch (e) {
            console.error('❌ Error en testEphemeralImages:', e);
            return false;
        }
    }
    
    async testChatMessaging() {
        console.log('🧪 TEST: Envío y recepción de mensajes 1:1 en Store');
        try {
            const convId = 'conv_e2e_' + Date.now();
            await chatModule.saveMessage({ conversationId: convId, text: 'Hola E2E', senderId: 'me' });
            await chatModule.receiveMessage({ conversationId: convId, text: 'Respuesta E2E', senderId: 'peer' });
            
            const messages = chatModule.getMessages(convId);
            const passed = messages.length === 2 && messages[0].text === 'Hola E2E' && messages[1].text === 'Respuesta E2E';
            console.log(`Mensajería Chat Store: ${passed ? '✅ EXITOSO' : '❌ FALLÓ'}`);
            return passed;
        } catch (e) {
            console.error('❌ Error en testChatMessaging:', e);
            return false;
        }
    }
}

export const fullFlowSuite = new FullFlowTestSuite();
