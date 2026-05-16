import { IRoutingService, RoutingJob } from './types';

export class RoutificAdapter implements IRoutingService {
    private apiKey: string;
    private baseUrl = 'https://api.routific.com/v1';

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async createJob(job: RoutingJob): Promise<string> {
        // Routific V1 API expected format (simplified for this example)
        // See https://dev.routific.com/docs/vrp-api
        const payload = {
            visits: job.stops.reduce((acc, stop) => {
                acc[stop.id] = {
                    location: {
                        address: stop.address,
                        lat: stop.lat,
                        lng: stop.lng,
                    },
                    metadata: {
                        customer_id: stop.customer_id,
                        subscription_id: stop.subscription_id,
                    }
                };
                return acc;
            }, {} as Record<string, unknown>),
            fleet: {
                "driver_1": {
                    start_location: { address: "Base Location, NC" }, // Example base
                    shift_start: "08:00",
                    shift_end: "17:00"
                }
            },
            options: {
                traffic: "fast"
            }
        };

        const response = await fetch(`${this.baseUrl}/vrp`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Routific API error: ${error}`);
        }

        const data = await response.json() as { job_id: string };
        return data.job_id;
    }

    async getJobStatus(jobId: string): Promise<string> {
        const response = await fetch(`${this.baseUrl}/jobs/${jobId}`, {
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
            },
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Routific API error: ${error}`);
        }

        const data = await response.json() as { status: string };
        return data.status;
    }
}
