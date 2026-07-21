export interface GeocodeResult {
    latitude: number;
    longitude: number;
}

export class GeoapifyGeocoder {
    constructor(private readonly apiKey?: string) {}

    async geocode(address: string): Promise<GeocodeResult | null> {
        if (!this.apiKey || !address.trim()) return null;

        const url = new URL('https://api.geoapify.com/v1/geocode/search');
        url.searchParams.set('text', address);
        url.searchParams.set('filter', 'countrycode:us');
        url.searchParams.set('limit', '1');
        url.searchParams.set('apiKey', this.apiKey);

        const response = await fetch(url.toString());
        if (!response.ok) return null;

        const body = await response.json() as {
            features?: Array<{ properties?: { lat?: number; lon?: number } }>;
        };
        const properties = body.features?.[0]?.properties;
        if (typeof properties?.lat !== 'number' || typeof properties.lon !== 'number') {
            return null;
        }

        return {
            latitude: properties.lat,
            longitude: properties.lon,
        };
    }
}
