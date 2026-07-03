import numpy as np
import wave
import io
import hashlib
from hermes_backend.stego_engine.box_muller_noise import BoxMullerNoiseGenerator

class AudioSpectrumFHSS:
    """
    Frequency Hopping Spread Spectrum (FHSS) REAL implementation.
    Modulates and demodulates binary data into a valid WAV file using Binary Phase Shift Keying (BPSK)
    across a pseudo-random hop sequence determined by a One-Time Pad key.
    """

    SAMPLE_RATE = 96000
    BIT_DURATION = 0.005  # 5 ms per bit
    HOP_POOL = [396, 417, 528, 639, 741, 852]

    def modulate_fhss(self, data: bytearray, key: bytearray) -> bytes:
        """
        Modulates the payload bytes into a real WAV audio file using FHSS BPSK.
        """
        bits = []
        for byte in data:
            for b in range(8):
                bits.append((byte >> (7 - b)) & 1)
        
        num_bits = len(bits)
        samples_per_bit = int(self.SAMPLE_RATE * self.BIT_DURATION)
        total_samples = num_bits * samples_per_bit
        
        t = np.arange(total_samples) / self.SAMPLE_RATE
        signal = np.zeros(total_samples)
        
        for i, bit in enumerate(bits):
            start_idx = i * samples_per_bit
            end_idx = start_idx + samples_per_bit
            
            hash_input = key + i.to_bytes(4, 'big')
            h = hashlib.sha3_256(hash_input).digest()
            freq_idx = int.from_bytes(h[:4], 'big') % len(self.HOP_POOL)
            freq = self.HOP_POOL[freq_idx]
            
            phase = 0.0 if bit == 0 else np.pi
            
            t_bit = t[start_idx:end_idx]
            signal[start_idx:end_idx] = np.sin(2.0 * np.pi * freq * t_bit + phase)
            
        noise_gen = BoxMullerNoiseGenerator()
        noise = noise_gen.generate_gaussian_noise(total_samples, mu=0.0, sigma=0.01)
        signal += np.array(noise)
        
        max_val = np.max(np.abs(signal))
        if max_val > 0:
            signal = signal / max_val
            
        signal_pcm = (signal * 32767).astype(np.int16)
        
        wav_io = io.BytesIO()
        with wave.open(wav_io, 'wb') as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)  # 16-bit PCM
            wav_file.setframerate(self.SAMPLE_RATE)
            wav_file.writeframes(signal_pcm.tobytes())
            
        return wav_io.getvalue()

    def demodulate_fhss(self, wav_bytes: bytes, key: bytearray, payload_len: int) -> bytearray:
        """
        Coherently demodulates the WAV audio file to recover the original payload.
        """
        wav_io = io.BytesIO(wav_bytes)
        with wave.open(wav_io, 'rb') as wav_file:
            params = wav_file.getparams()
            frames = wav_file.readframes(params.nframes)
            signal_pcm = np.frombuffer(frames, dtype=np.int16)
            
        signal = signal_pcm.astype(np.float32) / 32767.0
        num_bits = payload_len * 8
        samples_per_bit = int(self.SAMPLE_RATE * self.BIT_DURATION)
        
        t = np.arange(len(signal)) / self.SAMPLE_RATE
        bits = []
        
        for i in range(num_bits):
            start_idx = i * samples_per_bit
            end_idx = start_idx + samples_per_bit
            
            if end_idx > len(signal):
                bits.append(0)
                continue
                
            hash_input = key + i.to_bytes(4, 'big')
            h = hashlib.sha3_256(hash_input).digest()
            freq_idx = int.from_bytes(h[:4], 'big') % len(self.HOP_POOL)
            freq = self.HOP_POOL[freq_idx]
            
            t_bit = t[start_idx:end_idx]
            reference_carrier = np.sin(2.0 * np.pi * freq * t_bit)
            
            received_segment = signal[start_idx:end_idx]
            if len(received_segment) < len(reference_carrier):
                reference_carrier = reference_carrier[:len(received_segment)]
                
            correlation = np.sum(received_segment * reference_carrier)
            
            if correlation >= 0:
                bits.append(0)
            else:
                bits.append(1)
                
        payload = bytearray(payload_len)
        for i in range(payload_len):
            byte_val = 0
            for b in range(8):
                bit = bits[i * 8 + b]
                byte_val = (byte_val << 1) | bit
            payload[i] = byte_val
            
        return payload
