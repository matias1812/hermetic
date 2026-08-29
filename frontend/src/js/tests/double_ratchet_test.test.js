import { describe, it, expect } from 'vitest';
import { testDoubleRatchet } from './double_ratchet_test.js';

describe('Double Ratchet (WASM)', () => {
    it('encripta/descifra ping-pong bidireccional con avance de cadena DH', async () => {
        expect(await testDoubleRatchet()).toBe(true);
    });
});
