import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export const runtime = 'edge';

export default async function AdminDashboard() {
    const session = await auth();

    if (!session || !session.user || (session.user as { role?: string }).role !== 'ADMIN') {
        redirect('/');
    }

    redirect('/admin/customers');
}
