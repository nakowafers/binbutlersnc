export class WebhookHttpError extends Error {
    constructor(public status: number, message: string) {
        super(message);
        this.name = 'WebhookHttpError';
    }
}
