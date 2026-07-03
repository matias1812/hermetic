// audio_recorder.js
// Grabadora de audio usando MediaRecorder API con timer visual y animación de onda.

export class AudioRecorder {
    /**
     * Grabadora de mensajes de voz.
     *
     * Uso:
     *   const recorder = new AudioRecorder();
     *   recorder.onComplete = (base64, durationSec, mimeType) => { ... };
     *   await recorder.startRecording();
     *   recorder.stopRecording();
     */

    constructor() {
        this.mediaRecorder       = null;
        this.audioChunks         = [];
        this.isRecording         = false;
        this.recordingStartTime  = null;
        this.timerInterval       = null;
        this.maxDurationSec      = 600;   // 10 minutos máximo
        this.maxDurationTimer    = null;
        this.audioContext        = null;
        this.analyser            = null;
        this.animationFrameId    = null;

        /** Callback invocado cuando el audio está listo. */
        this.onComplete = null;   // (base64String, durationSec, mimeType) => void
        /** Callback para actualizar UI con tiempo transcurrido. */
        this.onTick     = null;   // (elapsedSec) => void
        /** Callback para actualizar ondas de voz. */
        this.onVolumeUpdate = null; // (dataArray) => void
    }

    /** Iniciar grabación. Solicita permiso al micrófono. */
    async startRecording() {
        if (this.isRecording) return;

        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
            console.error('[AudioRecorder] Acceso al micrófono denegado:', err);
            throw new Error('No se pudo acceder al micrófono. Verifica los permisos del navegador.');
        }

        // Seleccionar codec soportado
        const mimeType = this._getSupportedMimeType();

        this.audioChunks = [];
        this.mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});

        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                this.audioChunks.push(event.data);
            }
        };

        this.mediaRecorder.onstop = async () => {
            // Detener todas las pistas del stream
            stream.getTracks().forEach(track => track.stop());

            const effectiveMime = this.mediaRecorder.mimeType || 'audio/webm';
            const blob = new Blob(this.audioChunks, { type: effectiveMime });
            const durationSec = this._getElapsedSec();

            try {
                const base64 = await this._blobToBase64(blob);
                if (typeof this.onComplete === 'function') {
                    this.onComplete(base64, durationSec, effectiveMime);
                }
            } catch (err) {
                console.error('[AudioRecorder] Error al convertir audio:', err);
            }
        };

        this.mediaRecorder.start(250);   // recoger chunks cada 250ms
        this.isRecording        = true;
        this.recordingStartTime = Date.now();

        // Configurar Web Audio API para extraer el volumen
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 32; // Produce 16 frecuencias, perfecto para unas pocas barras
            const sourceNode = this.audioContext.createMediaStreamSource(stream);
            sourceNode.connect(this.analyser);
            
            const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            
            const updateVolume = () => {
                if (!this.isRecording) return;
                this.analyser.getByteFrequencyData(dataArray);
                if (typeof this.onVolumeUpdate === 'function') {
                    this.onVolumeUpdate(dataArray);
                }
                this.animationFrameId = requestAnimationFrame(updateVolume);
            };
            updateVolume();
        } catch (e) {
            console.warn('[AudioRecorder] Web Audio API no soportada', e);
        }

        // Timer visual
        this._startTimer();

        // Límite automático de duración
        this.maxDurationTimer = setTimeout(() => {
            if (this.isRecording) this.stopRecording();
        }, this.maxDurationSec * 1000);
    }

    /** Detener grabación (dispara onstop y el callback onComplete). */
    stopRecording() {
        if (!this.isRecording || !this.mediaRecorder) return;

        this.mediaRecorder.stop();
        this.isRecording = false;
        this._stopTimer();

        if (this.maxDurationTimer) {
            clearTimeout(this.maxDurationTimer);
            this.maxDurationTimer = null;
        }
        
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close().catch(()=>{});
            this.audioContext = null;
        }
    }

    /** Cancelar grabación sin disparar onComplete. */
    cancelRecording() {
        if (!this.isRecording || !this.mediaRecorder) return;

        this.onComplete = null;   // suprimir callback
        this.mediaRecorder.stop();
        this.isRecording = false;
        this._stopTimer();

        if (this.maxDurationTimer) {
            clearTimeout(this.maxDurationTimer);
            this.maxDurationTimer = null;
        }
        
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close().catch(()=>{});
            this.audioContext = null;
        }
    }

    // ─────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────

    _getElapsedSec() {
        if (!this.recordingStartTime) return 0;
        return Math.floor((Date.now() - this.recordingStartTime) / 1000);
    }

    _startTimer() {
        this.timerInterval = setInterval(() => {
            const elapsed = this._getElapsedSec();
            if (typeof this.onTick === 'function') {
                this.onTick(elapsed);
            }
        }, 500);
    }

    _stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    /** Convierte un Blob a base64 string. */
    _blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload  = () => resolve(reader.result);   // data:audio/webm;base64,...
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
        });
    }

    /** Elegir el primer MIME soportado por el navegador. */
    _getSupportedMimeType() {
        const candidates = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/ogg',
            'audio/mp4',
        ];
        for (const mime of candidates) {
            if (MediaRecorder.isTypeSupported(mime)) return mime;
        }
        return '';
    }

    /** Formatea segundos a "MM:SS". */
    static formatDuration(sec) {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
}
