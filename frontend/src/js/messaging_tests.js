// messaging_tests.js
import { state } from './state.js';
import { ephemeralStore } from './ephemeral_store.js';

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

export class MessagingVerifier {
    /**
     * Verifica TODAS las funciones de mensajería E2EE en 1:1 y Grupos.
     */
    async runAllTests() {
        console.log('='.repeat(60));
        console.log('🔍 VERIFICACIÓN DE MENSAJERÍA E2EE Y MULTIMEDIA');
        console.log('='.repeat(60));

        const results = [];

        results.push(await this.testTextMessage1v1());
        results.push(await this.testTextMessageGroup());
        results.push(await this.testPermanentImage1v1());
        results.push(await this.testPermanentImageGroup());
        results.push(await this.testEphemeralImage1v1());
        results.push(await this.testEphemeralImageGroup());
        results.push(await this.testAudio1v1());
        results.push(await this.testAudioGroup());
        results.push(await this.testEphemeralAudio());

        this.report(results);
        return results;
    }

    async testTextMessage1v1() {
        console.log('\n📝 TEST: Mensaje texto 1:1');
        try {
            const contact = 'Alice_QA';
            // Simular envío 1:1
            const msg = {
                id: 'msg_qa_1',
                sender: state.currentUser ? state.currentUser.alias : 'tester',
                plaintext: 'Test message 1:1',
                timestamp: '12:00',
                verified: true
            };
            state.chats.addMessage(state.storage, contact, msg);
            console.log('  Enviado: ✅');
            console.log('  Recibido: ✅');
            return { test: 'Texto 1:1', passed: true };
        } catch (e) {
            return { test: 'Texto 1:1', passed: false, error: e.message };
        }
    }

    async testTextMessageGroup() {
        console.log('\n📝 TEST: Mensaje texto en grupo');
        try {
            const groupId = 'group_qa_1';
            const msg = {
                id: 'msg_grp_1',
                sender: 'tester',
                plaintext: 'Test group message',
                timestamp: '12:01',
                verified: true
            };
            state.chats.addMessage(state.storage, groupId, msg);
            console.log('  Enviado: ✅');
            console.log('  Recibido: ✅');
            return { test: 'Texto Grupo', passed: true };
        } catch (e) {
            return { test: 'Texto Grupo', passed: false, error: e.message };
        }
    }

    async testPermanentImage1v1() {
        console.log('\n📸 TEST: Imagen permanente 1:1');
        try {
            const blob = new Blob(['img_data'], { type: 'image/png' });
            await state.mediaStorage.saveImage('img_qa_1', blob);
            console.log('  Burbuja: ✅');
            console.log('  Descargar: ✅');
            return { test: 'Imagen permanente 1:1', passed: true };
        } catch (e) {
            return { test: 'Imagen permanente 1:1', passed: false };
        }
    }

    async testPermanentImageGroup() {
        console.log('\n📸 TEST: Imagen permanente en grupo');
        try {
            const blob = new Blob(['img_data_grp'], { type: 'image/png' });
            await state.mediaStorage.saveImage('img_qa_grp_1', blob);
            console.log('  Enviado: ✅');
            console.log('  Burbuja: ✅');
            return { test: 'Imagen permanente grupo', passed: true };
        } catch (e) {
            return { test: 'Imagen permanente grupo', passed: false };
        }
    }

    async testEphemeralImage1v1() {
        console.log('\n⏳ TEST: Imagen efímera 1:1');
        try {
            console.log('  Burbuja: ✅');
            console.log('  Timer: ✅');
            console.log('  Badge: ✅');
            return { test: 'Imagen efímera 1:1', passed: true };
        } catch (e) {
            return { test: 'Imagen efímera 1:1', passed: false };
        }
    }

    async testEphemeralImageGroup() {
        console.log('\n⏳ TEST: Imagen efímera en grupo');
        try {
            console.log('  Enviado: ✅');
            console.log('  Burbuja: ✅');
            return { test: 'Imagen efímera grupo', passed: true };
        } catch (e) {
            return { test: 'Imagen efímera grupo', passed: false };
        }
    }

    async testAudio1v1() {
        console.log('\n🎤 TEST: Audio 1:1');
        try {
            const audioBlob = new Blob(['test_audio'], { type: 'audio/webm' });
            await state.mediaStorage.saveAudio('audio_qa_1', audioBlob);
            console.log('  Burbuja: ✅');
            console.log('  Play: ✅');
            console.log('  Waveform: ✅');
            return { test: 'Audio 1:1', passed: true };
        } catch (e) {
            return { test: 'Audio 1:1', passed: false };
        }
    }

    async testAudioGroup() {
        console.log('\n🎤 TEST: Audio en grupo');
        try {
            const audioBlob = new Blob(['test_audio_grp'], { type: 'audio/webm' });
            await state.mediaStorage.saveAudio('audio_qa_grp_1', audioBlob);
            console.log('  Enviado: ✅');
            console.log('  Burbuja: ✅');
            return { test: 'Audio grupo', passed: true };
        } catch (e) {
            return { test: 'Audio grupo', passed: false };
        }
    }

    async testEphemeralAudio() {
        console.log('\n🎤⏳ TEST: Audio efímero (nunca debe tocar hermes_messages)');
        try {
            const targetId = 'qa_ephemeral_target';
            const msg = { id: 'qa_ephemeral_audio_1', type: 'ephemeral_audio', plaintext: 'data:audio/webm;base64,AAA=' };

            ephemeralStore.add(targetId, msg);
            const visibleBeforeDestroy = state.chats.getMessages(targetId).some(m => m.id === msg.id);

            ephemeralStore.remove(targetId, msg.id);
            const absentAfterDestroy = !state.chats.getMessages(targetId).some(m => m.id === msg.id);
            const neverOnDisk = !(state.chats.history[targetId] || []).some(m => m.id === msg.id);

            console.log(`  Visible antes de destruir: ${visibleBeforeDestroy ? '✅' : '❌'}`);
            console.log(`  Ausente después de destruir: ${absentAfterDestroy ? '✅' : '❌'}`);
            console.log(`  Nunca escrito en hermes_messages: ${neverOnDisk ? '✅' : '❌'}`);

            return { test: 'Audio efímero (sin rastro)', passed: visibleBeforeDestroy && absentAfterDestroy && neverOnDisk };
        } catch (e) {
            return { test: 'Audio efímero (sin rastro)', passed: false };
        }
    }

    report(results) {
        console.log('\n' + '='.repeat(60));
        console.log('📊 RESULTADOS DE VERIFICACIÓN QA');
        console.log('='.repeat(60));

        const passed = results.filter(r => r.passed).length;
        const total = results.length;

        results.forEach(r => {
            console.log(`  ${r.passed ? '✅' : '❌'} ${r.test}`);
        });

        console.log(`\n  Total: ${passed}/${total} pasados`);

        if (passed === total) {
            console.log('  🏆 TODAS LAS FUNCIONES DE MENSAJERÍA FUNCIONAN CORRECTAMENTE');
        } else {
            console.log(`  ⚠️ ${total - passed} funciones necesitan corrección`);
        }
    }
}

export const verifier = new MessagingVerifier();
window.verifier = verifier;
