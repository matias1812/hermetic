// frontend/src/js/tests/persistence_test.js
import { HermesStore } from '../store/hermes_store.js';

export async function testPersistenceAfterReload() {
    console.log('🧪 TEST: Persistencia tras recargar store');
    
    // 1. Instanciar y alimentar store temporal
    const testStore = new HermesStore();
    await testStore.initialize();
    
    await testStore.dispatch('CONTACT_ADDED', { id: 'test_c_1', alias: 'ContactTest' });
    await testStore.dispatch('GROUP_CREATED', { id: 'test_g_1', name: 'GroupTest' });
    
    // 2. Simular recarga (nueva instancia conectada a IndexedDB)
    const reloadedStore = new HermesStore();
    await reloadedStore.initialize();
    
    const hasContact = reloadedStore.state.contacts.some(c => c.id === 'test_c_1');
    const hasGroup = reloadedStore.state.groups.some(g => g.id === 'test_g_1');
    
    console.log('Contactos después de recargar:', hasContact ? '✅' : '❌');
    console.log('Grupos después de recargar:', hasGroup ? '✅' : '❌');
    
    // Limpieza post-test
    await reloadedStore.dispatch('CONTACT_REMOVED', { id: 'test_c_1' });
    await reloadedStore.dispatch('GROUP_LEFT', { id: 'test_g_1' });
    
    return hasContact && hasGroup;
}

export async function testConcurrentLocks() {
    console.log('🧪 TEST: Concurrencia atómica y prevención de Race Conditions (Web Locks API)');
    const store = new HermesStore();
    await store.initialize();
    
    const convId = 'race_test_conv';
    const totalWrites = 25;
    
    // Lanzar 25 mutaciones concurrentes en paralelo sin esperar de a una (Promise.all)
    const promises = [];
    for (let i = 0; i < totalWrites; i++) {
        promises.push(
            store.dispatch('MESSAGE_RECEIVED', {
                id: `msg_race_${i}`,
                conversationId: convId,
                senderId: 'Alice',
                text: `Concurrente ${i}`,
                timestamp: Date.now() + i
            })
        );
    }
    
    await Promise.all(promises);
    
    // Verificar que los 25 mensajes se guardaron atómicamente en IndexedDB sin colisiones
    const saved = await store.db.loadAllMessages(convId);
    const count = saved.length;
    console.log(`Mensajes concurrentes guardados atómicamente: ${count}/${totalWrites}`);
    
    // Limpieza
    for (const m of saved) {
        await store.db.delete('messages', m.id);
    }
    
    return count >= totalWrites;
}
