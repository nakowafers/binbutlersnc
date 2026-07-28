export interface SalesRep {
    id: string;
    email?: string;
    can_override_fee: number;
    is_admin: number;
    is_active?: number;
    created_at: string;
}

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
    scent_preference?: string;
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
    next_service_date?: string | null;
    created_at: string;
}

export interface ServiceHistory {
    id: string;
    customer_id: string;
    subscription_id: string;
    service_date: string;
    dispatch_status: string;
    sales_rep_id?: string;
    bin_quantity?: number;
    created_at: string;
}

export type DispatchStopStatus = 'assigned' | 'completed' | 'skipped';

export interface DispatchStop {
    id: string;
    subscription_id: string;
    service_history_id: string;
    service_date: string;
    driver_sales_rep_id: string;
    route_sequence_order: number;
    dispatch_status: DispatchStopStatus;
    customer_name?: string | null;
    raw_address: string;
    latitude?: number | null;
    longitude?: number | null;
    bin_count: number;
    customer_scent?: string | null;
    service_notes?: string | null;
    customer_phone?: string | null;
    skip_reason?: string | null;
    completed_at?: string | null;
    updated_by_sales_rep_id?: string | null;
    created_at: string;
    updated_at: string;
}

export interface Env {
    DB: D1Database;
    STRIPE_SECRET_KEY: string;
    STRIPE_WEBHOOK_SECRET: string;
    STRIPE_MONTHLY_PRICE_ID: string;
    STRIPE_BIMONTHLY_PRICE_ID: string;
    STRIPE_QUARTERLY_PRICE_ID: string;
    STRIPE_QUARTERLY_PRICE_ID_V2: string;
    STRIPE_ONETIME_PRICE_ID: string;
    STRIPE_SETUP_FEE_PRICE_ID: string;
    STRIPE_EXTRA_BIN_MONTHLY_PRICE_ID: string;
    STRIPE_EXTRA_BIN_BIMONTHLY_PRICE_ID: string;
    STRIPE_EXTRA_BIN_QUARTERLY_PRICE_ID: string;
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: string;
    RESEND_API_KEY: string;
    GOOGLE_MAPS_API_KEY: string;
    GEOAPIFY_API_KEY?: string;
    AUTH_GOOGLE_ID: string;
    AUTH_GOOGLE_SECRET: string;
    AUTH_SECRET: string;
    AUTH_URL?: string;
    NEXTAUTH_URL?: string;
    SERVICEABLE_ZIP_CODES: string;
}

export interface CustomerWithDetails {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
    phone_number?: string;
    bin_quantity?: number;
    sales_rep_id?: string;
    created_at: string;
    address_id?: string;
    raw_address?: string;
    trash_day?: string;
    service_day?: string;
    notes?: string;
    scent_preference?: string;
    subscription_id?: string;
    subscription_status?: string;
    frequency_days?: number;
    current_period_end?: string;
    next_service_date?: string;
    is_paused?: boolean;
    needs_first_service_reschedule?: boolean | number;
    completed_service_count?: number;
    skipped_service_count?: number;
    completedServiceCount?: number;
    skippedServiceCount?: number;
}
