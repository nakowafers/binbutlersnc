import { IRoutingService, RoutingJob, Stop } from './types';

export class RoutificAdapter implements IRoutingService {
    private apiKey: string;
    private workspaceId?: string;
    // New Platform API Base URL
    private baseUrl = 'https://planning-service.beta.routific.com/v1';

    constructor(apiKey: string, workspaceId?: string) {
        this.apiKey = apiKey;
        this.workspaceId = workspaceId;
    }

    async createJob(job: RoutingJob): Promise<string> {
        if (!this.apiKey || this.apiKey.trim() === '' || this.apiKey.includes('your_routific_api_key')) {
            throw new Error("Missing or invalid Routific API Key. Please check your .dev.vars file.");
        }

        const key = this.apiKey.trim();
        const wsId = this.workspaceId;
        
        if (!wsId) {
            throw new Error("Missing Routific Workspace ID. This is required for the Platform API.");
        }

        // The Platform API (Beta) uses the /orders endpoint to push jobs into the dashboard
        // Ref: https://routific-platform.readme.io/reference/create-orders
        const ordersPayload = job.stops.map(stop => ({
            name: `Bin: ${stop.customer_id.substring(0, 8)}`,
            locations: [{
                address: stop.address,
                lat: stop.lat,
                lng: stop.lng,
            }],
            // Consolidate everything into instructions since notes/metadata are rejected
            instructions: `Sub: ${stop.subscription_id} | Cust: ${stop.customer_id}${stop.bin_quantity ? ` | Bins: ${stop.bin_quantity}` : ''}`,
            deliveryDate: job.date,
            customerOrderNumber: stop.id
        }));

        const url = `${this.baseUrl}/orders?workspaceId=${wsId}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(ordersPayload),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Routific Orders API error: ${error}`);
        }

        // The orders API returns a success confirmation, not a project ID
        // For our internal tracking, we return 'orders-synced'
        return `synced-${job.date}`;
    }

    async getJobStatus(): Promise<string> {
        return 'synced';
    }

    async pushTarget(customerData: Stop): Promise<string> {
        return this.createJob({
            id: crypto.randomUUID(),
            stops: [customerData],
            date: new Date().toISOString().split('T')[0]
        });
    }

    async updateTarget(customerData: Stop): Promise<void> {
        if (!this.apiKey || this.apiKey.trim() === '' || this.apiKey.includes('your_routific_api_key')) {
            throw new Error("Missing or invalid Routific API Key.");
        }
        const wsId = this.workspaceId;
        if (!wsId) {
            throw new Error("Missing Routific Workspace ID.");
        }
        const url = `${this.baseUrl}/orders/${encodeURIComponent(customerData.id)}?workspaceId=${wsId}`;
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${this.apiKey.trim()}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: `Bin: ${customerData.customer_id.substring(0, 8)}`,
                locations: [{
                    address: customerData.address,
                    lat: customerData.lat,
                    lng: customerData.lng,
                }],
                instructions: `Sub: ${customerData.subscription_id} | Cust: ${customerData.customer_id.substring(0, 8)}${customerData.bin_quantity ? ` | Bins: ${customerData.bin_quantity}` : ''}`,
            }),
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Routific update order API error: ${error}`);
        }
    }

    async getDispatchStatus(externalId: string): Promise<string> {
        if (!this.apiKey || this.apiKey.trim() === '' || this.apiKey.includes('your_routific_api_key')) {
            throw new Error("Missing or invalid Routific API Key.");
        }
        const wsId = this.workspaceId;
        if (!wsId) {
            throw new Error("Missing Routific Workspace ID.");
        }
        const url = `${this.baseUrl}/orders/${encodeURIComponent(externalId)}?workspaceId=${wsId}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${this.apiKey.trim()}`,
                'Content-Type': 'application/json',
            },
        });
        if (!response.ok) {
            if (response.status === 404) return 'not-found';
            const error = await response.text();
            throw new Error(`Routific get order status API error: ${error}`);
        }
        const order = await response.json() as { status?: string };
        return order.status || 'synced';
    }

    async deleteTarget(targetId: string): Promise<void> {
        if (!this.apiKey || this.apiKey.trim() === '' || this.apiKey.includes('your_routific_api_key')) {
            throw new Error("Missing or invalid Routific API Key.");
        }

        const key = this.apiKey.trim();
        const wsId = this.workspaceId;
        if (!wsId) {
            throw new Error("Missing Routific Workspace ID.");
        }

        const url = `${this.baseUrl}/orders/${encodeURIComponent(targetId)}?workspaceId=${wsId}`;

        const response = await fetch(url, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok && response.status !== 404) {
            const error = await response.text();
            throw new Error(`Routific delete order API error: ${error}`);
        }
    }
}
