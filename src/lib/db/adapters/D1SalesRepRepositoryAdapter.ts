import { ISalesRepRepository } from '../types';

export class D1SalesRepRepositoryAdapter implements ISalesRepRepository {
    constructor(private readonly db: D1Database) {}

    async isSalesRepAllowedToOverrideFee(salesRepId: string): Promise<boolean> {
        const result = await this.db.prepare(
            'SELECT can_override_fee FROM sales_reps WHERE LOWER(id) = LOWER(?) AND can_override_fee = 1'
        ).bind(salesRepId).first<{ can_override_fee: number }>();
        return result !== null;
    }
}
