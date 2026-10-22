import { describe, expect, it } from 'vitest';
import { getKernel } from '../helpers/kernel';

describe('manifold kernel', () => {
  it('loads in Node and computes a cube volume', async () => {
    const k = await getKernel();
    const cube = k.Manifold.cube([10, 10, 10]);
    expect(cube.volume()).toBeCloseTo(1000, 6);
    expect(cube.status()).toBe('NoError');
    cube.delete();
  });
});
