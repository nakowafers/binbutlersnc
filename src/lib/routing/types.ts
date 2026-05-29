export interface Stop {
    id: string;
    address: string;
    lat?: number;
    lng?: number;
    customer_id: string;
    subscription_id: string;
}

export interface RoutingJob {
    id: string;
    stops: Stop[];
    date: string;
}

export interface IRoutingService {
    createJob(job: RoutingJob): Promise<string>;
    getJobStatus(jobId: string): Promise<string>;
    deleteTarget(targetId: string): Promise<void>;
}
