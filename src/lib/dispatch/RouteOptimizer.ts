export interface RoutePoint {
    id: string;
    latitude: number | null;
    longitude: number | null;
}

export interface DepotPoint {
    latitude: number;
    longitude: number;
}

function distance(a: DepotPoint, b: DepotPoint): number {
    const lat = a.latitude - b.latitude;
    const lng = a.longitude - b.longitude;
    return Math.sqrt(lat * lat + lng * lng);
}

function routeDistance(route: RoutePoint[], depot: DepotPoint): number {
    let total = 0;
    let previous = depot;
    for (const point of route) {
        total += distance(previous, { latitude: point.latitude!, longitude: point.longitude! });
        previous = { latitude: point.latitude!, longitude: point.longitude! };
    }
    return total;
}

export class RouteOptimizer {
    optimize(depot: DepotPoint, stops: RoutePoint[]): string[] {
        const geocoded = stops
            .filter((stop) => stop.latitude !== null && stop.longitude !== null)
            .sort((a, b) => a.id.localeCompare(b.id));
        const missingCoordinates = stops
            .filter((stop) => stop.latitude === null || stop.longitude === null)
            .sort((a, b) => a.id.localeCompare(b.id));

        const route = this.nearestNeighbor(depot, geocoded);
        const improved = this.twoOpt(depot, route);
        return [...improved, ...missingCoordinates].map((stop) => stop.id);
    }

    private nearestNeighbor(depot: DepotPoint, stops: RoutePoint[]): RoutePoint[] {
        const remaining = [...stops];
        const route: RoutePoint[] = [];
        let current = depot;

        while (remaining.length > 0) {
            let bestIndex = 0;
            let bestDistance = Number.POSITIVE_INFINITY;
            for (let i = 0; i < remaining.length; i++) {
                const stop = remaining[i];
                const candidateDistance = distance(current, { latitude: stop.latitude!, longitude: stop.longitude! });
                if (candidateDistance < bestDistance) {
                    bestDistance = candidateDistance;
                    bestIndex = i;
                }
            }
            const [next] = remaining.splice(bestIndex, 1);
            route.push(next);
            current = { latitude: next.latitude!, longitude: next.longitude! };
        }

        return route;
    }

    private twoOpt(depot: DepotPoint, route: RoutePoint[]): RoutePoint[] {
        if (route.length < 4) return route;
        let best = [...route];
        let improved = true;

        while (improved) {
            improved = false;
            for (let i = 0; i < best.length - 2; i++) {
                for (let k = i + 1; k < best.length - 1; k++) {
                    const candidate = [
                        ...best.slice(0, i),
                        ...best.slice(i, k + 1).reverse(),
                        ...best.slice(k + 1),
                    ];
                    if (routeDistance(candidate, depot) + 0.0000001 < routeDistance(best, depot)) {
                        best = candidate;
                        improved = true;
                    }
                }
            }
        }

        return best;
    }
}
