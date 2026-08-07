// frontend/src/js/ui/message_renderer.js
import { state, showToast } from '../state.js';
import { AudioRecorder } from '../audio_recorder.js';
import { modalManager } from './modal_manager.js';
import { StateRenderer } from './state_renderer.js';

export function renderMessages() {
    const container = document.getElementById("chat-messages");
    if (!container) return;
    container.innerHTML = "";

    if (state.chatMessages.length === 0) {
        StateRenderer.renderEmpty(container, 'CANAL VACÍO', 'No hay mensajes en esta conversación cifrada.', 'lock');
        return;
    }

    state.chatMessages.forEach(msg => {
        const isSelf = msg.sender === state.currentUser;
        const msgDiv = document.createElement("div");

        if (msg.type === 'system') {
            msgDiv.id = `msg-${msg.id}`;
            msgDiv.className = "flex justify-center my-2";
            const innerDiv = document.createElement('div');
            innerDiv.className = "bg-red-950/40 border border-red-500/50 rounded px-4 py-2 text-[9px] font-mono text-red-400 text-center max-w-xs shadow-lg shadow-red-900/20";
            innerDiv.textContent = msg.plaintext;
            msgDiv.appendChild(innerDiv);
            container.appendChild(msgDiv);
            return; // Skip normal bubble rendering
        }

        msgDiv.id = `msg-${msg.id}`;
        msgDiv.className = `flex ${isSelf ? 'justify-end' : 'justify-start'}`;

        const bubble = document.createElement("div");
        bubble.className = `max-w-xs md:max-w-md rounded-lg p-2.5 font-mono text-[10px] space-y-1 transition-all ${
            isSelf ? 'msg-bubble-self bg-black/80 backdrop-blur-xl border border-terminalGreen/50 text-terminalGreen shadow-[0_0_15px_rgba(0,255,102,0.15)]' : 'msg-bubble-other bg-black/85 backdrop-blur-xl border border-gray-500/40 text-white shadow-[0_0_15px_rgba(255,255,255,0.05)]'
        }`;

        const statusRow = document.createElement("div");
        statusRow.className = "flex justify-between items-center text-[7px] text-gray-500 font-mono gap-4 uppercase select-none";
        
        const sigSpan = document.createElement('span');
        sigSpan.textContent = `SIG: ${msg.verified ? 'VERIFICADA' : 'NO FIRMADO'}`;

        const timeSpan = document.createElement('span');
        timeSpan.textContent = `PQC \u00B7 ${msg.timestamp}`;

        if (isSelf && state.activeContact) {
            const tickEl = document.createElement('span');
            if (msg.status === 'read') {
                tickEl.className = 'text-cyan-400 font-bold ml-1';
                tickEl.textContent = '\u2713\u2713';
            } else if (msg.status === 'delivered') {
                tickEl.className = 'text-gray-400 font-bold ml-1';
                tickEl.textContent = '\u2713\u2713';
            } else if (msg.status === 'pending') {
                tickEl.className = 'text-orange-500 font-bold ml-1 text-[8px]';
                tickEl.textContent = '[\u23F3]'; // Hourglass
            } else {
                tickEl.className = 'text-gray-500 font-bold ml-1';
                tickEl.textContent = '\u2713';
            }
            timeSpan.appendChild(tickEl);
        }
        statusRow.appendChild(sigSpan);
        statusRow.appendChild(timeSpan);

        const textDiv = document.createElement("div");
        textDiv.className = "break-words font-mono";

        if (msg.type === 'audio') {
            const audioId  = `audio-el-${msg.id}`;
            const playerDiv = document.createElement('div');
            playerDiv.className = 'flex flex-col gap-1.5 min-w-[200px]';

            const waveDiv = document.createElement('div');
            waveDiv.className = 'audio-waveform flex items-end gap-0.5 h-6 flex-grow cursor-pointer relative';
            const heights = [20, 55, 35, 80, 50, 65, 30, 75, 45, 60, 25, 70, 40, 60, 30, 80, 45, 20];
            const bars = [];
            heights.forEach(h => {
                const bar = document.createElement('div');
                bar.className = 'waveform-bar rounded-sm bg-current opacity-30 transition-opacity duration-75';
                bar.style.cssText = `width:3px; height:${h}%; flex-shrink:0;`;
                waveDiv.appendChild(bar);
                bars.push(bar);
            });

            const controlsRow = document.createElement('div');
            controlsRow.className = 'flex items-center gap-2';

            const playBtn = document.createElement('button');
            playBtn.id        = `play-btn-${msg.id}`;
            playBtn.className = 'w-7 h-7 rounded-full border border-current flex items-center justify-center text-xs hover:opacity-80 transition-opacity shrink-0 font-mono font-bold';
            playBtn.textContent = '▶';
            playBtn.title = 'Reproducir';

            const durSpan = document.createElement('span');
            durSpan.className = 'text-[8px] font-mono shrink-0 opacity-70';
            const totalSec = msg.audioDuration || 0;
            durSpan.textContent = AudioRecorder.formatDuration(totalSec);

            const speedSpan = document.createElement('span');
            speedSpan.className = 'text-[8px] text-orange-400 font-bold ml-1 cursor-pointer hover:bg-orange-500/20 px-1 py-0.5 rounded';
            speedSpan.textContent = '1x';
            speedSpan.title = 'Velocidad de reproducción';
            let currentSpeedIdx = 0;
            const speeds = [1, 1.5, 2, 0.5];
            speedSpan.addEventListener('click', () => {
                currentSpeedIdx = (currentSpeedIdx + 1) % speeds.length;
                const newSpeed = speeds[currentSpeedIdx];
                audioEl.playbackRate = newSpeed;
                speedSpan.textContent = `${newSpeed}x`;
            });

            controlsRow.appendChild(playBtn);
            controlsRow.appendChild(waveDiv);
            controlsRow.appendChild(durSpan);
            controlsRow.appendChild(speedSpan);

            playerDiv.appendChild(controlsRow);

            const audioEl = document.createElement('audio');
            audioEl.id  = audioId;
            
            // Fix NotSupportedError & CSP block for large data URIs
            if (msg.plaintext && msg.plaintext.startsWith('data:')) {
                try {
                    const arr = msg.plaintext.split(',');
                    const mime = arr[0].match(/:(.*?);/)[1];
                    const bstr = atob(arr[1]);
                    let n = bstr.length;
                    const u8arr = new Uint8Array(n);
                    while (n--) {
                        u8arr[n] = bstr.charCodeAt(n);
                    }
                    const blob = new Blob([u8arr], {type: mime});
                    audioEl.src = URL.createObjectURL(blob);
                } catch (e) {
                    console.error("Error decoding audio base64:", e);
                    audioEl.src = msg.plaintext;
                }
            } else {
                audioEl.src = msg.plaintext;
            }
            
            audioEl.preload = 'metadata';
            playerDiv.appendChild(audioEl);

            playBtn.addEventListener('click', () => {
                if (audioEl.paused) {
                    document.querySelectorAll('audio').forEach(a => {
                        if (a !== audioEl) { a.pause(); a.currentTime = 0; }
                    });
                    document.querySelectorAll('[id^="play-btn-"]').forEach(b => { b.textContent = '▶'; });
                    audioEl.play().then(() => {
                        playBtn.textContent = '⏸';
                    }).catch(e => {
                        console.error("Audio play error", e);
                        showToast("Error al reproducir audio", true);
                        playBtn.textContent = '▶';
                    });
                } else {
                    audioEl.pause();
                    playBtn.textContent = '▶';
                }
            });

            audioEl.addEventListener('timeupdate', () => {
                if (!audioEl.duration) return;
                const pct = (audioEl.currentTime / audioEl.duration);
                const activeBars = Math.floor(pct * bars.length);
                bars.forEach((bar, i) => {
                    bar.style.opacity = i <= activeBars ? '1' : '0.3';
                });
                durSpan.textContent = AudioRecorder.formatDuration(
                    Math.floor(audioEl.currentTime)
                ) + ' / ' + AudioRecorder.formatDuration(totalSec);
            });

            audioEl.addEventListener('ended', () => {
                playBtn.textContent = '▶';
                bars.forEach(bar => bar.style.opacity = '0.3');
                durSpan.textContent = AudioRecorder.formatDuration(totalSec);
            });

            waveDiv.addEventListener('click', (e) => {
                if (!audioEl.duration) return;
                const rect = waveDiv.getBoundingClientRect();
                const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                audioEl.currentTime = ratio * audioEl.duration;
            });

            textDiv.appendChild(playerDiv);

        } else if (msg.plaintext && (msg.plaintext.startsWith("data:image/") || msg.type === "ephemeral_image")) {
            if (msg.type === "ephemeral_image") {
                const placeholder = document.createElement("div");
                placeholder.className = "p-3 border border-orange-500/30 bg-orange-950/10 rounded flex flex-col items-center gap-2 cursor-pointer text-orange-400 hover:bg-orange-950/20 transition-colors select-none w-48";
                
                let viewStatus = "";
                if (isSelf) {
                    const groupObj = state.activeGroup ? state.groups.userGroups.find(g => g.id === state.activeGroup) : null;
                    const expectedCount = state.activeGroup ? (groupObj ? groupObj.members.length - 1 : 0) : 1;
                    const viewedCount = msg.viewed_by ? msg.viewed_by.length : 0;
                    viewStatus = `<span class="text-[7px] text-gray-400 uppercase font-mono mt-1">VISTO POR: ${viewedCount}/${expectedCount}</span>`;
                }

                placeholder.innerHTML = `
                    <div class="flex items-center gap-2">
                        <span class="text-2xl">📷</span>
                        <div class="flex flex-col">
                            <span class="text-xs font-bold">Imagen Efímera</span>
                            <span class="text-[9px] text-orange-500/70 font-mono">Tap para ver</span>
                        </div>
                    </div>
                    ${viewStatus}
                `;
                placeholder.addEventListener("click", () => {
                    if (isSelf) {
                        viewImageFull(msg.plaintext);
                    } else {
                        openEphemeralImageModal(msg);
                    }
                });
                textDiv.appendChild(placeholder);
            } else {
                const img = document.createElement("img");
                img.loading = "lazy";
                img.src = msg.plaintext;
                img.className = "max-w-full h-auto rounded border border-terminalGreen/10 mt-1 cursor-pointer";
                img.addEventListener("click", () => {
                    viewImageFull(msg.plaintext);
                });
                textDiv.appendChild(img);

                const dlBtn = document.createElement('button');
                dlBtn.className = 'text-[8px] font-mono text-terminalGreen/60 hover:text-terminalGreen mt-1 block transition-colors uppercase';
                dlBtn.textContent = '⬇ DESCARGAR';
                dlBtn.title = 'Descargar imagen';
                dlBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const a  = document.createElement('a');
                    a.href     = msg.plaintext;
                    a.download = `hermes_img_${Date.now()}.jpg`;
                    a.click();
                });
                textDiv.appendChild(dlBtn);
            }
        } else if (msg.type === "ephemeral_audio") {
            const placeholder = document.createElement("div");
            placeholder.className = "p-3 border border-orange-500/30 bg-orange-950/10 rounded flex flex-col items-center gap-2 cursor-pointer text-orange-400 hover:bg-orange-950/20 transition-colors select-none w-48";
            
            let viewStatus = "";
            if (isSelf) {
                const groupObj = state.activeGroup ? state.groups.userGroups.find(g => g.id === state.activeGroup) : null;
                const expectedCount = state.activeGroup ? (groupObj ? groupObj.members.length - 1 : 0) : 1;
                const viewedCount = msg.viewed_by ? msg.viewed_by.length : 0;
                viewStatus = `<span class="text-[7px] text-gray-400 uppercase font-mono mt-1">VISTO POR: ${viewedCount}/${expectedCount}</span>`;
            }

            placeholder.innerHTML = `
                <div class="flex items-center gap-2">
                    <svg id="eye-open-${msg.id}" class="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    <svg id="eye-closed-${msg.id}" class="hidden w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 11 Q12 18 20 11 M12 14.5v3 M8 13.5l-2 2.5 M16 13.5l2 2.5" />
                    </svg>
                    <div class="flex flex-col">
                        <span class="text-xs font-bold">Audio Efímero</span>
                        <span id="audio-status-${msg.id}" class="text-[9px] text-orange-500/70 font-mono">Tap para escuchar</span>
                    </div>
                </div>
                ${viewStatus}
            `;
            
            const audioEl = document.createElement('audio');
            
            if (msg.plaintext && msg.plaintext.startsWith('data:')) {
                try {
                    const arr = msg.plaintext.split(',');
                    const mime = arr[0].match(/:(.*?);/)[1];
                    const bstr = atob(arr[1]);
                    let n = bstr.length;
                    const u8arr = new Uint8Array(n);
                    while (n--) {
                        u8arr[n] = bstr.charCodeAt(n);
                    }
                    const blob = new Blob([u8arr], {type: mime});
                    audioEl.src = URL.createObjectURL(blob);
                } catch (e) {
                    console.error("Error decoding ephemeral audio base64:", e);
                    audioEl.src = msg.plaintext;
                }
            } else {
                audioEl.src = msg.plaintext;
            }
            
            audioEl.preload = 'auto';
            placeholder.appendChild(audioEl);
            
            placeholder.addEventListener("click", () => {
                if (isSelf) {
                    showToast("Los audios efímeros enviados no se pueden volver a escuchar.");
                    return;
                }
                const eyeOpen = placeholder.querySelector(`#eye-open-${msg.id}`);
                const eyeClosed = placeholder.querySelector(`#eye-closed-${msg.id}`);
                const statusTxt = placeholder.querySelector(`#audio-status-${msg.id}`);
                if (eyeOpen) eyeOpen.classList.add('hidden');
                if (eyeClosed) eyeClosed.classList.remove('hidden');
                if (statusTxt) statusTxt.textContent = "Reproduciendo...";
                audioEl.play().catch(e => {
                    console.error("Audio play error", e);
                    showToast("Error al reproducir audio", true);
                    if (statusTxt) statusTxt.textContent = "Error al reproducir";
                });
                placeholder.style.pointerEvents = "none";
            });
            
            audioEl.addEventListener('ended', async () => {
                const targetId = state.activeContact || state.activeGroup;
                await state.chats.deleteMessage(state.storage, targetId, msg.id);
                try {
                    const payload = {
                        type: "ephemeral_viewed",
                        msg_id: msg.id
                    };
                    if (state.activeGroup) payload.group_id = state.activeGroup;
                    state.sync.sendBlob(state.currentUser, msg.sender, payload);
                } catch(e) {}
                state.chatMessages = state.chats.getMessages(targetId);
                renderMessages();
            });
            
            textDiv.appendChild(placeholder);
        } else if (msg.type === "ephemeral_text") {
            const placeholder = document.createElement("div");
            placeholder.className = "p-3 border border-orange-500/30 bg-orange-950/10 rounded flex flex-col items-center gap-2 cursor-pointer text-orange-400 hover:bg-orange-950/20 transition-colors select-none w-48";
            
            let viewStatus = "";
            if (isSelf) {
                const groupObj = state.activeGroup ? state.groups.userGroups.find(g => g.id === state.activeGroup) : null;
                const expectedCount = state.activeGroup ? (groupObj ? groupObj.members.length - 1 : 0) : 1;
                const viewedCount = msg.viewed_by ? msg.viewed_by.length : 0;
                viewStatus = `<span class="text-[7px] text-gray-400 uppercase font-mono mt-1">VISTO POR: ${viewedCount}/${expectedCount}</span>`;
            }

            placeholder.innerHTML = `
                <div class="flex items-center gap-2">
                    <svg id="eye-open-text-${msg.id}" class="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    <svg id="eye-closed-text-${msg.id}" class="hidden w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 11 Q12 18 20 11 M12 14.5v3 M8 13.5l-2 2.5 M16 13.5l2 2.5" />
                    </svg>
                    <div class="flex flex-col">
                        <span class="text-xs font-bold">Texto Efímero</span>
                        <span id="text-status-${msg.id}" class="text-[9px] text-orange-500/70 font-mono">Tap para leer</span>
                    </div>
                </div>
                ${viewStatus}
            `;
            
            placeholder.addEventListener("click", () => {
                if (isSelf) {
                    showToast("Los mensajes efímeros enviados no se pueden volver a leer.");
                    return;
                }
                const eyeOpen = placeholder.querySelector(`#eye-open-text-${msg.id}`);
                const eyeClosed = placeholder.querySelector(`#eye-closed-text-${msg.id}`);
                const statusTxt = placeholder.querySelector(`#text-status-${msg.id}`);
                
                if (eyeOpen) eyeOpen.classList.add('hidden');
                if (eyeClosed) eyeClosed.classList.remove('hidden');
                
                // Show text
                const textDisplay = document.createElement("div");
                textDisplay.className = "mt-2 p-2 bg-darkSurface rounded text-white text-sm break-all";
                textDisplay.textContent = msg.plaintext;
                placeholder.appendChild(textDisplay);
                
                if (statusTxt) statusTxt.textContent = "Leyendo (10s)...";
                placeholder.style.pointerEvents = "none";
                
                setTimeout(async () => {
                    const targetId = state.activeContact || state.activeGroup;
                    await state.chats.deleteMessage(state.storage, targetId, msg.id);
                    try {
                        const payload = {
                            type: "ephemeral_viewed",
                            msg_id: msg.id
                        };
                        if (state.activeGroup) payload.group_id = state.activeGroup;
                        state.sync.sendBlob(state.currentUser, msg.sender, payload);
                    } catch(e) {}
                    state.chatMessages = state.chats.getMessages(targetId);
                    renderMessages();
                }, 10000);
            });
            
            textDiv.appendChild(placeholder);
        } else {
            textDiv.textContent = msg.plaintext || '';
        }

        function viewImageFull(src) {
            let overlay = document.getElementById("image-full-overlay");
            if (!overlay) {
                overlay = document.createElement("div");
                overlay.id = "image-full-overlay";
                overlay.className = "fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50 cursor-pointer transition-opacity duration-300 opacity-0 hidden";
                overlay.innerHTML = `
                    <img class="max-w-full max-h-[90vh] rounded-lg shadow-2xl border border-darkGrey" src="" />
                    <button class="absolute top-4 right-4 text-gray-500 hover:text-white text-xs font-bold font-mono">[ CERRAR ]</button>
                `;
                overlay.onclick = () => {
                    overlay.classList.add("opacity-0");
                    setTimeout(() => overlay.classList.add("hidden"), 300);
                };
                document.body.appendChild(overlay);
            }
            overlay.querySelector("img").src = src;
            overlay.classList.remove("hidden");
            setTimeout(() => overlay.classList.remove("opacity-0"), 10);
        }

        bubble.appendChild(statusRow);
        bubble.appendChild(textDiv);

        bubble.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            showBubbleActions(e, msg);
        });

        msgDiv.appendChild(bubble);
        container.appendChild(msgDiv);
    });

    container.scrollTop = container.scrollHeight;
}

export function showBubbleActions(e, msg) {
    const existing = document.getElementById("bubble-context-menu");
    if (existing) existing.remove();

    const menu = document.createElement("div");
    menu.id = "bubble-context-menu";
    menu.className = "absolute bg-black border border-darkGrey rounded shadow-2xl p-1 z-100 flex flex-col font-mono text-[8px]";
    menu.style.top = `${e.pageY}px`;
    menu.style.left = `${e.pageX}px`;

    if (msg.sender === state.currentUser) {
        const editBtn = document.createElement("button");
        editBtn.className = "px-3 py-1.5 hover:bg-terminalGreen hover:text-black text-left text-gray-300 font-bold uppercase transition-colors";
        editBtn.textContent = "EDITAR MENSAJE";
        editBtn.addEventListener("click", () => {
            promptEditMessage(msg);
            menu.remove();
        });
        menu.appendChild(editBtn);

        const deleteEveryoneBtn = document.createElement("button");
        deleteEveryoneBtn.className = "px-3 py-1.5 hover:bg-red-950 hover:text-red-400 text-left text-red-500 font-bold uppercase transition-colors";
        deleteEveryoneBtn.textContent = "ELIMINAR PARA TODOS";
        deleteEveryoneBtn.addEventListener("click", () => {
            confirmDeleteMessage(msg, true);
            menu.remove();
        });
        menu.appendChild(deleteEveryoneBtn);
    }

    const deleteMeBtn = document.createElement("button");
    deleteMeBtn.className = "px-3 py-1.5 hover:bg-red-950 hover:text-red-400 text-left text-red-500 font-bold uppercase transition-colors";
    deleteMeBtn.textContent = "ELIMINAR PARA MÍ";
    deleteMeBtn.addEventListener("click", () => {
        confirmDeleteMessage(msg, false);
        menu.remove();
    });
    menu.appendChild(deleteMeBtn);

    document.body.appendChild(menu);

    const closeMenu = () => {
        menu.remove();
        document.removeEventListener("click", closeMenu);
    };
    setTimeout(() => {
        document.addEventListener("click", closeMenu);
    }, 50);
}

export async function promptEditMessage(msg) {
    const text = await modalManager.prompt('[ EDITAR MENSAJE ]', "Modifica tu mensaje:", msg.plaintext);
    if (text === null) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    try {
        const targetId = state.activeContact || state.activeGroup;
        await state.chats.editMessage(state.storage, targetId, msg.id, trimmed);

        await state.sync.sendBlob(state.currentUser, targetId, {
            type: "msg_edit",
            msg_id: msg.id,
            new_text: trimmed
        });

        state.chatMessages = state.chats.getMessages(targetId);
        renderMessages();
    } catch (err) {
        console.error(err);
        showToast('Error al editar mensaje', true);
    }
}

export async function confirmDeleteMessage(msg, everyone) {
    const confirmMsg = everyone 
        ? "¿Deseas eliminar este mensaje para TODOS los participantes?" 
        : "¿Deseas eliminar este mensaje solo para TI?";
    const confirmed = await modalManager.confirm('[ ELIMINAR MENSAJE ]', confirmMsg);
    if (!confirmed) return;

    try {
        const targetId = state.activeContact || state.activeGroup;
        await state.chats.deleteMessage(state.storage, targetId, msg.id);

        if (everyone) {
            await state.sync.sendBlob(state.currentUser, targetId, {
                type: "msg_delete",
                msg_id: msg.id
            });
        }

        state.chatMessages = state.chats.getMessages(targetId);
        renderMessages();
    } catch (err) {
        console.error(err);
        showToast('Error al eliminar mensaje', true);
    }
}

export function openInspector(msg) {
    state.activeInspectorMsg = msg;
    const jsonEl = document.getElementById("inspect-json");
    if (jsonEl) {
        jsonEl.textContent = JSON.stringify(msg.raw || {}, null, 2);
    }

    const inspectAadVal = document.getElementById("inspect-aad-val");
    if (inspectAadVal && msg.raw) {
        inspectAadVal.textContent = `sender:${msg.sender}|receiver:${msg.receiver}|ts:${msg.raw.timestamp}`;
    }
}

export function openEphemeralImageModal(msg) {
    const modal    = document.getElementById("view-once-modal");
    const img      = document.getElementById("view-once-img");
    const closeBtn = document.getElementById("btn-close-view-once");
    const timerBar = document.getElementById("view-once-timer-bar");
    if (!modal || !img || !closeBtn) return;

    const DURATION = 10;   // segundos
    img.src = msg.plaintext;
    modal.classList.remove("hidden");

    let secondsLeft = DURATION;
    closeBtn.textContent = `[ CERRAR Y DESTRUIR (${secondsLeft}s) ]`;

    if (timerBar) {
        timerBar.style.transition = 'none';
        timerBar.style.width      = '100%';
        timerBar.getBoundingClientRect();
        timerBar.style.transition = `width ${DURATION}s linear`;
        timerBar.style.width      = '0%';
    }

    if (state.screenshotDetector) {
        state.screenshotDetector.enableProtection(msg.id);
    }

    try {
        const payload = {
            type:   "ephemeral_viewed",
            msg_id: msg.id
        };
        if (state.activeGroup) {
            payload.group_id = state.activeGroup;
        }
        state.sync.sendBlob(state.currentUser, msg.sender, payload);
    } catch (e) {
        console.error("Failed to send ephemeral_viewed:", e);
    }

    const destroyFn = async () => {
        clearInterval(timer);
        modal.classList.add("hidden");
        img.src = "";

        if (state.screenshotDetector) {
            state.screenshotDetector.disableProtection();
        }

        const targetId = state.activeContact || state.activeGroup;
        await state.chats.deleteMessage(state.storage, targetId, msg.id);
        state.chatMessages = state.chats.getMessages(targetId);
        renderMessages();
    };

    const timer = setInterval(() => {
        secondsLeft--;
        if (secondsLeft <= 0) {
            destroyFn();
        } else {
            closeBtn.textContent = `[ CERRAR Y DESTRUIR (${secondsLeft}s) ]`;
            if (timerBar && secondsLeft <= 3) {
                timerBar.classList.add('danger');
            }
        }
    }, 1000);

    closeBtn.onclick = destroyFn;
}
