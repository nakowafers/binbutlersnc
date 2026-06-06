export interface Lead {
    id: string;
    email: string;
    address: string;
    first_name?: string;
    last_name?: string;
    sales_rep_id?: string;
    tos_accepted_at?: string;
    converted: boolean;
    created_at: string;
}

export interface Customer {
    id: string;
    email: string;
    name?: string;
    first_name?: string;
    last_name?: string;
    stripe_customer_id?: string;
    phone_number?: string;
    address_id?: string;
    bin_quantity?: number;
    sales_rep_id?: string;
    tos_accepted_at?: string;
    created_at: string;
}

export interface Address {
    id: string;
    customer_id: string;
    raw_address: string;
    latitude?: number;
    longitude?: number;
    trash_day?: 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI';
    service_day?: string;
    notes?: string;
    created_at: string;
}

export interface Subscription {
    id: string;
    customer_id: string;
    stripe_subscription_id?: string;
    status: string;
    current_period_end?: string;
    is_paused: boolean;
    frequency_days: number;
    created_at: string;
}

export interface ServiceHistory {
    id: string;
    customer_id: string;
    subscription_id: string;
    service_date: string;
    dispatch_status: string;
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
    ROUTIFIC_WORKSPACE_ID: string;
    ROUTIFIC_WEBHOOK_SECRET: string;
    RESEND_API_KEY: string;
    GOOGLE_MAPS_API_KEY: string;
    AUTH_SECRET: string;
}
