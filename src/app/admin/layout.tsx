import { AdminSidebar } from './admin-sidebar';

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex h-screen bg-[#F8FAFC]">
            <AdminSidebar />
            <main className="flex-grow overflow-y-auto p-8">
                {children}
            </main>
        </div>
    );
}
