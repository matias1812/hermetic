// tests/load/websocket_fanout_test.js

import { WebSocketFanout } from '../../fixes/FASE2_BACKEND/fix_20_scalability.js';

export async function testWebSocketFanout() {
    console.log('--- TEST: WebSocket Fanout (Horizontal Scalability) ---');
    
    const fanout = new WebSocketFanout();
    
    // Simularemos 1000 conexiones websocket para 500 usuarios (2 dispositivos por usuario)
    const numUsers = 500;
    let messagesReceived = 0;
    
    for (let i = 0; i < numUsers; i++) {
        const userId = `user_${i}`;
        // Dispositivo 1
        fanout.subscribe(userId, `conn_a_${i}`, (msg) => {
            if (msg.text === 'hello') messagesReceived++;
        });
        // Dispositivo 2
        fanout.subscribe(userId, `conn_b_${i}`, (msg) => {
            if (msg.text === 'hello') messagesReceived++;
        });
    }
    
    // Simular que un nodo publica un mensaje para todos los usuarios
    const publishPromises = [];
    for (let i = 0; i < numUsers; i++) {
        publishPromises.push(fanout.publishToUser(`user_${i}`, { text: 'hello' }));
    }
    
    await Promise.all(publishPromises);
    
    const expectedMessages = numUsers * 2; // 1000
    
    console.log(`Expected messages: ${expectedMessages}, Received: ${messagesReceived}`);
    
    const result = messagesReceived === expectedMessages;
    console.log('[WebSocket Fanout]:', result ? '✅' : '❌');
    return result;
}
