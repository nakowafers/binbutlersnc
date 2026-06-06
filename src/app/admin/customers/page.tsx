import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { CustomerTable } from './customer-table';

export const runtime = 'edge';

export default async function CustomersPage() {
    const session = await auth();

    if (!session || !session.user || (session.user as { role?: string }).role !== 'ADMIN') {
        redirect('/');
    }

    return (
        <>
            <header className="mb-8">
                <h1 className="text-3xl font-extrabold text-[#1C3D5A]">Customer Management</h1>
                <p className="text-slate-500">View, search, and manage all customer records.</p>
            </header>

            <CustomerTable />
        </>
    );
}
