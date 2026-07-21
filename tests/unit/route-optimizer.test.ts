import { describe, expect, it } from 'vitest';
import { RouteOptimizer } from '../../src/lib/dispatch/RouteOptimizer';

describe('RouteOptimizer', () => {
    it('orders coordinate-backed stops and appends missing-coordinate stops', () => {
        const optimizer = new RouteOptimizer();

        const ordered = optimizer.optimize(
            { latitude: 0, longitude: 0 },
            [
                { id: 'far', latitude: 10, longitude: 10 },
                { id: 'missing', latitude: null, longitude: null },
                { id: 'near', latitude: 1, longitude: 1 },
            ]
        );

        expect(ordered).toEqual(['near', 'far', 'missing']);
    });

    it('returns deterministic output for equally distant stops', () => {
        const optimizer = new RouteOptimizer();

        const ordered = optimizer.optimize(
            { latitude: 0, longitude: 0 },
            [
                { id: 'b', latitude: 1, longitude: 0 },
                { id: 'a', latitude: 0, longitude: 1 },
            ]
        );

        expect(ordered).toEqual(['a', 'b']);
    });
});
