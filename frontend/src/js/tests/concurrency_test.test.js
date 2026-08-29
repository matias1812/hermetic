import { describe, it, expect } from 'vitest';
import { runConcurrencyTest } from './concurrency_test.js';

describe('EncryptedStorageManager concurrency', () => {
    it('unlock() es idempotente bajo llamadas concurrentes y se recupera tras fallo', async () => {
        expect(await runConcurrencyTest()).toBe(true);
    });
});
