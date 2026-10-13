export interface BusinessStatusConfig {
    signupsPaused: boolean;
    pauseTitle: string;
    pauseMessage: string;
    contactEmail?: string;
    contactPhone?: string;
}

export const BUSINESS_CONFIG: BusinessStatusConfig = {
    signupsPaused: true,
    pauseTitle: 'Signups Temporarily Paused',
    pauseMessage: 'We are temporarily pausing new signups while we update our schedule and operations. Check back soon!',
    contactEmail: 'info@binbutlersnc.com',
    contactPhone: '(980) 255-3591',
};

export function setSignupsPausedForTesting(paused: boolean): void {
    BUSINESS_CONFIG.signupsPaused = paused;
}
