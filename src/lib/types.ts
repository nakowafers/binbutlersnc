export interface Lead {
    id: string;
    email: string;
    address: string;
    sales_rep_id?: string;
    tos_accepted_at?: string;
    converted: boolean;
    created_at: string;
}

export interface Customer {
    id: string;
    email: string;
    stripe_customer_id?: string;
    phone_number?: string;
    address_id?: string;
    bin_quantity?: number;
    sales_rep_id?: string;
    tos_accepted_at?: string;
    external_routing_id?: string;
    created_at: string;
}

export interface Address {
    id: string;
    raw_address: string;
    latitude?: number;
    longitude?: number;
    trash_day?: 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI';
    service_day?: string;
    provider_name?: string;
    gate_code?: string;
    hoa_name?: string;
    access_notes?: string;
    created_at: string;
}

export interface Subscription {
    id: string;
    customer_id: string;
    stripe_subscription_id?: string;
    status: string;
    tier?: string;
    current_period_end?: string;
    is_paused: boolean;
    last_service_date?: string;
    frequency_days: number;
    created_at: string;
}

export interface ServiceHistory {
    id: string;
    customer_id: string;
    subscription_id: string;
    service_date: string;
    dispatch_status: string;
    photo_url?: string;
    sales_rep_id?: string;
    created_at: string;
}

export interface Env {
    DB: D1Database;
    STRIPE_SECRET_KEY: string;
    STRIPE_WEBHOOK_SECRET: string;
    STRIPE_MONTHLY_PRICE_ID: string;
    STRIPE_QUARTERLY_PRICE_ID: string;
    STRIPE_ONETIME_PRICE_ID: string;
    STRIPE_SETUP_FEE_PRICE_ID: string;
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: string;
    ROUTIFIC_API_KEY: string;
    RESEND_API_KEY: string;
    GOOGLE_MAPS_API_KEY: string;
    AUTH_SECRET: string;
}
