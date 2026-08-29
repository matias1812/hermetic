import { describe, it, expect } from 'vitest';
import { runCrossBoundaryTests } from './test_cross_boundary.js';

describe('WASM cross-boundary key isolation', () => {
    it('no expone claves/buffers crudos en hermesBridge ni su prototipo', async () => {
        expect(await runCrossBoundaryTests()).toBe(true);
    });
});
