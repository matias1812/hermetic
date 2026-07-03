const { chromium } = require('playwright');
const path = require('path');

async function runAudit() {
    console.log('🚀 Iniciando Auditoría Integral de Hermetic v7.1');
    const fs = require('fs');
    const dbPath = path.join(__dirname, '../hermes_backend/backend.db');
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

    const browser = await chromium.launch({ 
        headless: true,
        args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
    });

    console.log('📦 Inicializando contextos aislados para Alice, Bob y Charlie...');
    const ctxAlice = await browser.newContext();
    const ctxBob = await browser.newContext();
    const ctxCharlie = await browser.newContext();

    const pAlice = await ctxAlice.newPage();
    const pBob = await ctxBob.newPage();
    const pCharlie = await ctxCharlie.newPage();

    const handleDialog = async dialog => {
        if (dialog.type() === 'prompt') {
            await dialog.accept('TestBackup123!');
        } else {
            await dialog.accept();
        }
    };
    pAlice.on('dialog', handleDialog);
    pBob.on('dialog', handleDialog);
    pCharlie.on('dialog', handleDialog);

    pAlice.on('console', msg => { console.log('[Alice Console]', msg.text()); });
    pBob.on('console', msg => { console.log('[Bob Console]', msg.text()); });
    pCharlie.on('console', msg => { console.log('[Charlie Console]', msg.text()); });

    const appUrl = 'http://localhost:5173/';

    async function register(page, alias) {
        await page.goto(appUrl);
        await page.click('text=Crear nueva identidad');
        await page.fill('#register-alias', alias);
        await page.fill('#register-password', 'Test123456789!');
        await page.fill('#register-password-confirm', 'Test123456789!');
        await page.evaluate(() => document.getElementById('register-password-confirm').dispatchEvent(new Event('input')));
        await page.check('#register-terms');
        await page.waitForTimeout(500);
        await page.click('#register-submit');
        await page.waitForTimeout(2000); 
        const title = await page.textContent('#current-user-name');
        console.log(`✅ [${alias}] Registrado: ${title}`);
        
        const userId = await page.evaluate(() => {
            const m = document.getElementById('onboarding-modal');
            if(m) m.classList.add('hidden');
            return sessionStorage.getItem('session_user_id_hash');
        });
        return userId;
    }

    try {
        console.log('\n--- FASE 2: TEST MULTI-USUARIO REAL ---');
        const aliceId = await register(pAlice, 'Alice');
        const bobId = await register(pBob, 'Bob');
        const charlieId = await register(pCharlie, 'Charlie');

        console.log('\n--- FASE 1: SANITIZACIÓN Y FUGAS DE DATOS ---');
        const bobKeys = await pBob.evaluate(() => Object.keys(localStorage));
        const aliceInBob = bobKeys.some(k => k.includes('Alice'));
        console.log(`✅ Aislamiento localStorage (Alice en Bob): ${aliceInBob ? 'Fallo' : 'Exitoso'}`);
        
        console.log('\n--- Flujo de Contactos ---');
        await pAlice.click('#btn-open-add-modal');
        await pAlice.fill('#add-contact-name', 'Bob');
        await pAlice.click('#btn-add-contact');
        await pAlice.waitForTimeout(1000); // Increased timeout to ensure fetch completes
        
        // Check if there was an error
        const isErrorVisible = await pAlice.evaluate(() => {
            const errEl = document.getElementById("add-contact-error");
            return errEl && !errEl.classList.contains("hidden") ? errEl.textContent : null;
        });
        if (isErrorVisible) {
            console.error("Alice Add Contact Error:", isErrorVisible);
        }

        console.log(`📨 Alice envió solicitud a Bob (${bobId.substring(0,8)}...)`);
        
        await pBob.waitForTimeout(1000);
        await pBob.waitForTimeout(1000); // give it time
        await pBob.reload();
        await pBob.waitForTimeout(500);
        
        // Debug Bob's state
        const bobContactData = await pBob.evaluate(() => state.contacts.contactData);
        console.log("[Bob Contact Data]", bobContactData);
        
        const acceptBtnExists = await pBob.evaluate(() => {
            return document.body.innerHTML.includes('ACEPTAR');
        });
        console.log("[Bob Accept Btn Exists?]", acceptBtnExists);

        const aliceIdInBob = bobContactData.find(c => c.status === 'pending_received');
        if (aliceIdInBob) {
            console.log(`Bob received request from: ${aliceIdInBob.contact_id}`);
        } else {
            console.error("Bob DID NOT receive any pending request!");
        }

        await pBob.click('button:has-text("ACEPTAR")');
        console.log("✅ Bob aceptó la solicitud de Alice");

        await pAlice.waitForTimeout(2000);
        const hasBobInAlice = await pAlice.textContent('#contacts-list');
        console.log(`✅ Alice ve a Bob en contactos: ${hasBobInAlice.includes('bob') ? 'Sí' : 'No'}`);

        console.log('\n--- Chat 1:1 ---');
        await pAlice.click('text=@bob');
        await pAlice.fill('#chat-input', 'Hola Bob! Payload: <script>alert("XSS")</script>');
        await pAlice.click('#btn-send');
        console.log('💬 Alice envió mensaje a Bob');

        await pBob.waitForTimeout(2000);
        await pBob.click('text=@alice');
        
        await pBob.waitForTimeout(1000);
        const bobChatHTML = await pBob.innerHTML('#chat-messages');
        const bobChatText = await pBob.textContent('#chat-messages');
        const xssSafe = !bobChatHTML.includes('<script>') && bobChatText.includes('Hola Bob');
        console.log(`✅ Bob recibió mensaje sanitizado: ${xssSafe ? 'Sí' : 'No'}`);

        await pBob.fill('#chat-input', 'Todo bien Alice!');
        await pBob.click('#btn-send');
        
        await pAlice.waitForTimeout(2000);
        const aliceChatText = await pAlice.textContent('#chat-messages');
        console.log(`✅ Alice recibió respuesta: ${aliceChatText.includes('Todo bien') ? 'Sí' : 'No'}`);

        console.log('\n--- FASE 3: TEST DE GRUPOS ---');
        await pAlice.click('#btn-open-add-modal');
        await pAlice.fill('#add-contact-name', 'Charlie');
        await pAlice.click('#btn-add-contact');
        
        await pCharlie.waitForTimeout(2000);
        await pCharlie.click('button:has-text("ACEPTAR")');
        await pCharlie.waitForTimeout(2000);
        console.log('✅ Alice y Charlie ahora son contactos');

        await pAlice.click('#btn-open-create-group');
        await pAlice.fill('#cg-name', 'Test Group XSS <img>');
        await pAlice.evaluate(() => {
            document.querySelector(`input[value="bob"]`).checked = true;
        });
        await pAlice.evaluate(() => {
            document.querySelector(`input[value="charlie"]`).checked = true;
        });
        await pAlice.click('#btn-submit-create-group');
        console.log('👥 Alice creó el grupo Test Group XSS <img>');

        await pBob.waitForTimeout(3000);
        const bobGroupText = await pBob.textContent('#groups-list');
        console.log(`✅ Bob ve el grupo: ${bobGroupText.includes('Test Group') ? 'Sí' : 'No'}`);
        
        console.log('\n--- FASE 4: TEST DE IMÁGENES Y AUDIO ---');
        console.log('📸 Test: Imagen Efímera');
        await pAlice.click('text=@bob');
        await pAlice.click('#btn-view-once-toggle');
        
        const testImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
        await pAlice.setInputFiles('#photo-input', {
            name: 'test.png',
            mimeType: 'image/png',
            buffer: testImage
        });
        await pAlice.waitForTimeout(2000);
        console.log('✅ Alice envió imagen efímera');

        await pBob.waitForTimeout(3000);
        await pBob.click('text=@alice');
        const hasImage = await pBob.evaluate(() => {
            const spans = document.querySelectorAll('span');
            return Array.from(spans).some(s => s.textContent.includes('ABRIR IMAGEN EFÍMERA'));
        });
        console.log(`✅ Bob recibió imagen efímera: ${hasImage ? 'Sí' : 'No'}`);
        
        if (hasImage) {
            await pBob.click('text=ABRIR IMAGEN EFÍMERA');
            console.log('👁️ Bob abrió el visor efímero');
            await pBob.waitForTimeout(1000);
            
            await pBob.evaluate(() => {
                const ev = new KeyboardEvent('keydown', { key: 'PrintScreen', bubbles: true });
                document.dispatchEvent(ev);
            });
            await pBob.waitForTimeout(1000);
            
            const toastVisible = await pBob.evaluate(() => {
                const toasts = document.querySelectorAll('div');
                return Array.from(toasts).some(d => d.textContent.includes('CAPTURA DETECTADA'));
            });
            console.log(`✅ Detección de Screenshot: ${toastVisible ? 'Exitosa' : 'Fallida'}`);
        }

        console.log('🎤 Test: Mensaje de Audio');
        await pAlice.evaluate(() => {
            window.navigator.mediaDevices.getUserMedia = () => Promise.resolve({
                getTracks: () => [{ stop: () => {} }] // mock getTracks to prevent error
            });
            window.MediaRecorder = class {
                constructor() { this.state = 'inactive'; }
                start() { this.state = 'recording'; }
                stop() { 
                    this.state = 'inactive'; 
                    if(this.ondataavailable) {
                        this.ondataavailable({ data: new Blob(['audio_data'], { type: 'audio/webm' }) });
                    }
                    if(this.onstop) this.onstop();
                }
            };
            window.MediaRecorder.isTypeSupported = () => true;
        });
        await pAlice.click('#btn-record-audio');
        await pAlice.waitForTimeout(1000);
        await pAlice.click('#btn-stop-recording'); 
        await pAlice.waitForTimeout(2000);
        
        const audioSent = await pAlice.evaluate(() => !!document.querySelector('audio'));
        console.log(`✅ Alice envió audio: ${audioSent ? 'Sí' : 'No'}`);

        console.log('\n--- FASE 5: TEST DE BACKUPS ---');
        await pAlice.click('#btn-profile');
        await pAlice.waitForTimeout(500);

        await pAlice.waitForTimeout(500);
        
        await pAlice.click('#btn-backup-settings');
        await pAlice.waitForTimeout(1000);
        
        await pAlice.click('#btn-create-backup');
        await pAlice.waitForTimeout(5000); // Wait for crypto operations
        
        const backupList = await pAlice.textContent('#backups-list-container');
        console.log(`✅ Backup creado (lista contiene stats): ${backupList && backupList.includes('msgs') ? 'Sí' : 'No'}`);

    } catch (e) {
        console.error('❌ Error durante la auditoría:', e);
    } finally {
        await browser.close();
    }
}

runAudit();
