// frontend/src/js/ui/chat_input.js
import { state, showToast } from '../state.js';
import { AudioRecorder } from '../audio_recorder.js';
import { modalManager } from './modal_manager.js';

export function setupChatInput(audioRecorder, renderMessagesCb, renderContactSidebarCb) {
    let viewOnceEnabled = false;
    
    const chatInput = document.getElementById("chat-input");
    const btnSend = document.getElementById("btn-send");
    const btnEmojiToggle = document.getElementById("btn-emoji-toggle");
    const emojiPicker = document.getElementById("emoji-picker");
    const btnSendPhoto = document.getElementById("btn-send-photo");
    const photoInput = document.getElementById("photo-input");

    // Audio Recording elements
    const btnRecordAudio  = document.getElementById("btn-record-audio");
    const audioInputArea  = document.getElementById("audio-input-area");
    const textInputArea   = document.getElementById("text-input-area");
    const recordingTimer  = document.getElementById("recording-timer");
    const audioWave       = document.getElementById("audio-wave");
    const btnStopRecording = document.getElementById("btn-stop-recording");
    const btnCancelAudio  = document.getElementById("btn-cancel-audio");

    const switchToTextMode = () => {
        if (audioInputArea) audioInputArea.classList.add("hidden");
    if (audioWave) audioWave.classList.remove("active");
    if (textInputArea) textInputArea.classList.remove("hidden");
    };

    if (btnCancelAudio) {
        btnCancelAudio.addEventListener('click', () => {
            if (audioRecorder.isRecording) {
                audioRecorder.stopRecording();
            }
            switchToTextMode();
        });
    }

    if (btnRecordAudio) {
        btnRecordAudio.addEventListener('click', async () => {
            if (audioRecorder.isRecording) return;

            const targetId = state.activeContact || state.activeGroup;
            if (!targetId) {
                showToast('Selecciona un chat antes de grabar audio.', true);
                return;
            }

            if (textInputArea) textInputArea.classList.add("hidden");
            if (audioInputArea) audioInputArea.classList.remove("hidden");
            if (audioWave) {
                audioWave.classList.add("active");
                audioWave.innerHTML = ''; // Clear previous wave bars
            }

            let waveFrameCount = 0;

            audioRecorder.onTick = (elapsed) => {
                if (recordingTimer) {
                    recordingTimer.textContent = AudioRecorder.formatDuration(elapsed);
                }
            };
            
            audioRecorder.onVolumeUpdate = (dataArray) => {
                if (!audioWave) return;
                
                // Calculate average volume from frequency data
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
                const avg = sum / dataArray.length;
                const h = Math.max(3, (avg / 255) * 100);
                
                // Only add a bar every ~3 frames to avoid overcrowding
                waveFrameCount++;
                if (waveFrameCount % 3 !== 0) return;
                
                // Create and append a new bar
                const bar = document.createElement('div');
                bar.className = 'wave-bar';
                bar.style.cssText = `width:2px; height:${h}%; background:#ef4444cc; border-radius:1px; min-height:2px; flex-shrink:0; transition:height 0.1s ease;`;
                audioWave.appendChild(bar);
                
                // Auto-scroll to show newest bars
                audioWave.scrollLeft = audioWave.scrollWidth;
            };

            audioRecorder.onComplete = async (base64, durationSec, mimeType) => {
                switchToTextMode();
                if (!base64) return;

                try {
                    const payload = state.activeGroup ? {
                        type:          viewOnceEnabled ? 'group_ephemeral_audio' : 'group_chat',
                        group_id:      state.activeGroup,
                        msgType:       'audio',
                        text:          base64,
                        audioDuration: durationSec,
                        audioMime:     mimeType,
                    } : {
                        type:          viewOnceEnabled ? 'ephemeral_audio' : 'chat',
                        msgType:       'audio',
                        text:          base64,
                        audioDuration: durationSec,
                        audioMime:     mimeType,
                    };

                    const envelopeRes = state.activeGroup
                        ? await state.sync.sendGroupBlob(state.currentUser, targetId, payload)
                        : await state.sync.sendBlob(state.currentUser, targetId, payload);
                    const timestamp   = Math.floor(Date.now() / 1000);
                    const timeStr     = new Date(timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                    const msgObj = {
                        id:            envelopeRes.signature,
                        sender:        state.currentUser,
                        receiver:      targetId,
                        plaintext:     base64,
                        type:          'audio',
                        audioMime:     mimeType,
                        audioDuration: durationSec,
                        verified:      true,
                        timestamp:     timeStr,
                        status:        envelopeRes.is_pending ? 'pending' : 'sent',
                        raw:           { signature: envelopeRes.signature, timestamp },
                    };

                    await state.chats.addMessage(state.storage, targetId, msgObj);

                    if (state.mediaStorage) {
                        await state.mediaStorage.saveAudio({
                            id:        msgObj.id,
                            base64Data: base64,
                            duration:  durationSec,
                            mimeType:  mimeType,
                            sender:    state.currentUser,
                            chatId:    targetId,
                        });
                    }

                    state.chatMessages = state.chats.getMessages(targetId);
                    
                    // Reset ViewOnce state
                    viewOnceEnabled = false;
                    const btnViewOnceToggle = document.getElementById("btn-view-once-toggle");
                    if (btnViewOnceToggle) {
                        btnViewOnceToggle.classList.remove("border-orange-500", "text-orange-400", "bg-orange-950/20");
                        btnViewOnceToggle.classList.add("text-gray-600", "border-darkGrey");
                        const eyeOpen = document.getElementById("input-eye-open");
                        const eyeClosed = document.getElementById("input-eye-closed");
                        if (eyeOpen) eyeOpen.classList.remove("hidden");
                        if (eyeClosed) eyeClosed.classList.add("hidden");
                    }

                    if (renderMessagesCb) renderMessagesCb();
                    if (renderContactSidebarCb) renderContactSidebarCb();
                } catch (err) {
                    console.error('[Audio] Error enviando audio:', err);
                    showToast('Error al enviar el audio.', true);
                }
            };

            try {
                await audioRecorder.startRecording();
                if (recordingTimer) recordingTimer.textContent = '00:00';
            } catch (err) {
                switchToTextMode();
                showToast(err.message, true);
            }
        });
    }

    if (btnStopRecording) {
        btnStopRecording.addEventListener('click', () => {
            audioRecorder.stopRecording();
        });
    }

    const triggerSend = async () => {
        if (btnSend && btnSend.disabled) return;
        const text = chatInput ? chatInput.value.trim() : '';
        const targetId = state.activeContact || state.activeGroup;
        if (!text || !targetId) return;

        if (btnSend) btnSend.disabled = true;
        if (chatInput) chatInput.disabled = true;

        if (chatInput) chatInput.value = "";

        const tempId = 'temp_' + Date.now();
        const timestamp = Math.floor(Date.now() / 1000);
        const timeStr = new Date(timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        const optimisticMsg = {
            id: tempId,
            sender: state.currentUser,
            receiver: targetId,
            plaintext: text,
            verified: true,
            timestamp: timeStr,
            type: viewOnceEnabled ? "ephemeral_text" : "chat",
            status: 'sending',
            raw: { signature: tempId, timestamp }
        };

        state.chatMessages.push(optimisticMsg);
        if (renderMessagesCb) renderMessagesCb();

        try {
            const isEphemeral = viewOnceEnabled;
            const payload = state.activeGroup ? {
                type: isEphemeral ? "group_ephemeral_text" : "group_chat",
                group_id: state.activeGroup,
                text: text
            } : {
                type: isEphemeral ? "ephemeral_text" : "chat",
                text: text
            };

            const envelopeRes = state.activeGroup
                ? await state.sync.sendGroupBlob(state.currentUser, targetId, payload)
                : await state.sync.sendBlob(state.currentUser, targetId, payload);
            
            // Reemplazar id y status optimista por confirmado
            optimisticMsg.id = envelopeRes.signature;
            optimisticMsg.status = envelopeRes.is_pending ? 'pending' : 'sent';
            optimisticMsg.raw.signature = envelopeRes.signature;

            // Retirar el mensaje optimista temporal y guardar a través de la store oficial
            const idx = state.chatMessages.findIndex(m => m.id === tempId);
            if (idx !== -1) state.chatMessages.splice(idx, 1);

            await state.chats.addMessage(state.storage, targetId, {
                ...optimisticMsg,
                id: envelopeRes.signature
            });

            state.chatMessages = state.chats.getMessages(targetId);
            if (renderMessagesCb) renderMessagesCb();
            if (renderContactSidebarCb) renderContactSidebarCb();

            viewOnceEnabled = false;
            const btnViewOnceToggle = document.getElementById('btn-view-once-toggle');
            if (btnViewOnceToggle) {
                btnViewOnceToggle.classList.remove("border-orange-500", "text-orange-400", "bg-orange-950/20");
                btnViewOnceToggle.classList.add("text-gray-600", "border-darkGrey");
                const eyeOpen = document.getElementById("input-eye-open");
                const eyeClosed = document.getElementById("input-eye-closed");
                if (eyeOpen) eyeOpen.classList.remove("hidden");
                if (eyeClosed) eyeClosed.classList.add("hidden");
            }
        } catch (err) {
            console.error(err);
            // Revertir optimismo si falla
            const idx = state.chatMessages.findIndex(m => m.id === tempId);
            if (idx !== -1) state.chatMessages.splice(idx, 1);
            if (renderMessagesCb) renderMessagesCb();
            if (chatInput) chatInput.value = text; // Restaurar texto para que no se pierda
            showToast('Error enviando mensaje', true);
        } finally {
            if (btnSend) btnSend.disabled = false;
            if (chatInput) {
                chatInput.disabled = false;
                chatInput.focus();
            }
        }
    };

    if (btnSend) btnSend.onclick = triggerSend;
    let typingTimeout = null;
    let lastTypingTime = 0;

    if (chatInput) {
        chatInput.onkeydown = (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                triggerSend();
            }
        };

        chatInput.addEventListener('input', () => {
            if (!state.activeContact && !state.activeGroup) return;
            const targetId = state.activeContact || state.activeGroup;
            const now = Date.now();
            
            // Only send one typing indicator every 3 seconds max
            if (now - lastTypingTime > 3000) {
                lastTypingTime = now;
                try {
                    const payload = {
                        type: "typing",
                        is_group: !!state.activeGroup,
                        group_id: state.activeGroup ? String(state.activeGroup) : null
                    };
                    if (state.activeGroup) {
                        state.sync.sendGroupBlob(state.currentUser, String(targetId), payload).catch(() => {});
                    } else {
                        state.sync.sendBlob(state.currentUser, String(targetId), payload).catch(() => {});
                    }
                } catch (e) {
                    // Ignore errors for ephemeral typing status
                }
            }
        });
    }

    if (btnEmojiToggle && emojiPicker) {
        btnEmojiToggle.onclick = (e) => {
            e.stopPropagation();
            emojiPicker.classList.toggle("hidden");
        };
        
        document.querySelectorAll(".emoji-btn").forEach(btn => {
            btn.onclick = (e) => {
                const emoji = btn.textContent;
                if (!chatInput) return;
                const start = chatInput.selectionStart || 0;
                const end = chatInput.selectionEnd || 0;
                const val = chatInput.value;
                chatInput.value = val.substring(0, start) + emoji + val.substring(end);
                chatInput.focus();
                chatInput.selectionStart = chatInput.selectionEnd = start + emoji.length;
                emojiPicker.classList.add("hidden");
            };
        });
        
        document.addEventListener("click", () => {
            emojiPicker.classList.add("hidden");
        });
        emojiPicker.onclick = (e) => {
            e.stopPropagation();
        };
    }

    const btnViewOnceToggle = document.getElementById("btn-view-once-toggle");

    if (btnViewOnceToggle) {
        btnViewOnceToggle.addEventListener("click", () => {
            viewOnceEnabled = !viewOnceEnabled;
            const eyeOpen = document.getElementById("input-eye-open");
            const eyeClosed = document.getElementById("input-eye-closed");
            if (viewOnceEnabled) {
                btnViewOnceToggle.classList.add("border-orange-500", "text-orange-400", "bg-orange-950/20");
                btnViewOnceToggle.classList.remove("text-gray-600", "border-darkGrey");
                if (eyeOpen) eyeOpen.classList.add("hidden");
                if (eyeClosed) eyeClosed.classList.remove("hidden");
                showToast("Modo vista única activado. El próximo mensaje o foto será efímero.");
            } else {
                btnViewOnceToggle.classList.remove("border-orange-500", "text-orange-400", "bg-orange-950/20");
                btnViewOnceToggle.classList.add("text-gray-600", "border-darkGrey");
                if (eyeOpen) eyeOpen.classList.remove("hidden");
                if (eyeClosed) eyeClosed.classList.add("hidden");
                showToast("Modo efímero desactivado.");
            }
        });
    }

    if (btnSendPhoto && photoInput) {
        btnSendPhoto.onclick = () => {
            photoInput.click();
        };
        
        photoInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) {
                showToast('Por favor selecciona una imagen', true);
                return;
            }
            
            const reader = new FileReader();
            reader.onload = async (event) => {
                const base64Data = event.target.result;
                const targetId = state.activeContact || state.activeGroup;
                
                const isEphemeral = viewOnceEnabled;
                const confirmMsg = isEphemeral 
                    ? "¿Deseas enviar esta foto como IMAGEN EFÍMERA (vista única)?" 
                    : "¿Deseas enviar esta foto de forma cifrada de extremo a extremo?";
                const confirmed = await modalManager.confirm('[ ENVIAR IMAGEN ]', confirmMsg);
                if (!confirmed) return;
                
                if (btnSendPhoto) btnSendPhoto.disabled = true;
                
                try {
                    const payload = state.activeGroup ? {
                        type: isEphemeral ? "group_ephemeral_image" : "group_chat",
                        group_id: state.activeGroup,
                        text: base64Data
                    } : {
                        type: isEphemeral ? "ephemeral_image" : "chat",
                        text: base64Data
                    };

                    const envelopeRes = state.activeGroup
                        ? await state.sync.sendGroupBlob(state.currentUser, targetId, payload)
                        : await state.sync.sendBlob(state.currentUser, targetId, payload);
                    const timestamp = Math.floor(Date.now() / 1000);
                    const timeStr = new Date(timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    
                    const msgObj = {
                        id: envelopeRes.signature,
                        sender: state.currentUser,
                        receiver: targetId,
                        plaintext: base64Data,
                        verified: true,
                        timestamp: timeStr,
                        type: isEphemeral ? "ephemeral_image" : "chat",
                        viewed_by: [],
                        status: envelopeRes.is_pending ? 'pending' : 'sent',
                        raw: { signature: envelopeRes.signature, timestamp: timestamp }
                    };

                    await state.chats.addMessage(state.storage, targetId, msgObj);
                    state.chatMessages = state.chats.getMessages(targetId);
                    if (renderMessagesCb) renderMessagesCb();
                    if (renderContactSidebarCb) renderContactSidebarCb();

                    viewOnceEnabled = false;
                    if (btnViewOnceToggle) {
                        btnViewOnceToggle.classList.remove("border-orange-500", "text-orange-400", "bg-orange-950/20");
                        btnViewOnceToggle.classList.add("text-gray-600", "border-darkGrey");
                        const eyeOpen = document.getElementById("input-eye-open");
                        const eyeClosed = document.getElementById("input-eye-closed");
                        if (eyeOpen) eyeOpen.classList.remove("hidden");
                        if (eyeClosed) eyeClosed.classList.add("hidden");
                    }
                } catch (err) {
                    console.error(err);
                    showToast('Error al enviar la foto', true);
                } finally {
                    if (btnSendPhoto) btnSendPhoto.disabled = false;
                }
            };
            reader.readAsDataURL(file);
            photoInput.value = "";
        };
    }
}
