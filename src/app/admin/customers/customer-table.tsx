'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Sheet,
    SheetClose,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import {
    Search,
    ArrowUpDown,
    Trash2,
    Check,
    Loader2,
    Users,
    MapPin,
    ChevronDown,
    ChevronUp,
    X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { CustomerWithDetails } from '@/lib/types';
import { useMediaQuery } from '@/hooks/use-media-query';

type SortField = 'name' | 'email' | 'subscription_status' | 'created_at';
type SortDirection = 'asc' | 'desc';

function SortableHeader({
    field,
    children,
    sortField,
    onToggleSort,
}: {
    field: SortField;
    children: React.ReactNode;
    sortField: SortField;
    onToggleSort: (field: SortField) => void;
}) {
    return (
        <th
            className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-[#1C3D5A] transition-colors select-none"
            onClick={() => onToggleSort(field)}
        >
            <div className="flex items-center gap-1">
                {children}
                <ArrowUpDown
                    size={14}
                    className={sortField === field ? 'text-[#7AC142]' : 'text-slate-300'}
                />
            </div>
        </th>
    );
}

export function CustomerTable() {
    const isMobile = useMediaQuery('(max-width: 767px)');

    const [customers, setCustomers] = useState<CustomerWithDetails[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [dayFilter, setDayFilter] = useState<string>('all');
    const [sortField, setSortField] = useState<SortField>('created_at');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    // Notes editing state
    const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
    const [editingNotesValue, setEditingNotesValue] = useState('');
    const [savingNotes, setSavingNotes] = useState(false);

    // Delete confirmation state
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    // Mobile detail sheet state
    const [detailCustomer, setDetailCustomer] = useState<CustomerWithDetails | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);
    const [showMoreInfo, setShowMoreInfo] = useState(false);

    // Mobile inline notes editing in detail sheet
    const [mobileNotesId, setMobileNotesId] = useState<string | null>(null);
    const [mobileNotesValue, setMobileNotesValue] = useState('');
    const [savingMobileNotes, setSavingMobileNotes] = useState(false);

    useEffect(() => {
        fetch('/api/admin/customers')
            .then(res => {
                if (!res.ok) throw new Error('Failed to fetch');
                return res.json() as Promise<CustomerWithDetails[]>;
            })
            .then(data => {
                setCustomers(data);
                setLoading(false);
            })
            .catch(error => {
                console.error('Error fetching customers:', error);
                toast.error('Failed to load customers');
                setLoading(false);
            });
    }, []);

    const handleSaveNotes = async (addressId: string) => {
        setSavingNotes(true);
        try {
            const res = await fetch('/api/admin/customers/notes', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ addressId, notes: editingNotesValue }),
            });
            if (!res.ok) throw new Error('Failed to save');
            setCustomers(prev =>
                prev.map(c =>
                    c.address_id === addressId ? { ...c, notes: editingNotesValue } : c
                )
            );
            setEditingNotesId(null);
            toast.success('Notes saved');
        } catch (error) {
            console.error('Error saving notes:', error);
            toast.error('Failed to save notes');
        } finally {
            setSavingNotes(false);
        }
    };

    const handleMobileSaveNotes = async (addressId: string) => {
        setSavingMobileNotes(true);
        try {
            const res = await fetch('/api/admin/customers/notes', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ addressId, notes: mobileNotesValue }),
            });
            if (!res.ok) throw new Error('Failed to save');
            setCustomers(prev =>
                prev.map(c =>
                    c.address_id === addressId ? { ...c, notes: mobileNotesValue } : c
                )
            );
            if (detailCustomer && detailCustomer.address_id === addressId) {
                setDetailCustomer(prev => prev ? { ...prev, notes: mobileNotesValue } : null);
            }
            setMobileNotesId(null);
            toast.success('Notes saved');
        } catch (error) {
            console.error('Error saving notes:', error);
            toast.error('Failed to save notes');
        } finally {
            setSavingMobileNotes(false);
        }
    };

    const handleDelete = async (customerId: string) => {
        setDeleting(true);
        try {
            const res = await fetch('/api/admin/customers/delete', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customerId }),
            });
            if (!res.ok) {
                const data = await res.json() as { error?: string };
                throw new Error(data.error || 'Failed to delete');
            }
            setCustomers(prev => prev.filter(c => c.id !== customerId));
            setDeleteConfirmId(null);
            setDetailOpen(false);
            toast.success('Customer deleted');
        } catch (error) {
            console.error('Error deleting customer:', error);
            toast.error(error instanceof Error ? error.message : 'Failed to delete customer');
        } finally {
            setDeleting(false);
        }
    };

    const toggleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const filteredAndSorted = useMemo(() => {
        let result = [...customers];

        // Search filter
        if (search) {
            const q = search.toLowerCase();
            result = result.filter(c =>
                `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase().includes(q) ||
                c.email.toLowerCase().includes(q) ||
                (c.raw_address || '').toLowerCase().includes(q)
            );
        }

        // Status filter
        if (statusFilter !== 'all') {
            result = result.filter(c => c.subscription_status === statusFilter);
        }

        // Service day filter
        if (dayFilter !== 'all') {
            result = result.filter(c => c.service_day === dayFilter);
        }

        // Sort
        result.sort((a, b) => {
            let aVal: string;
            let bVal: string;

            switch (sortField) {
                case 'name':
                    aVal = `${a.first_name || ''} ${a.last_name || ''}`.trim().toLowerCase();
                    bVal = `${b.first_name || ''} ${b.last_name || ''}`.trim().toLowerCase();
                    break;
                case 'email':
                    aVal = a.email.toLowerCase();
                    bVal = b.email.toLowerCase();
                    break;
                case 'subscription_status':
                    aVal = (a.subscription_status || '').toLowerCase();
                    bVal = (b.subscription_status || '').toLowerCase();
                    break;
                case 'created_at':
                    aVal = a.created_at;
                    bVal = b.created_at;
                    break;
                default:
                    return 0;
            }

            if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });

        return result;
    }, [customers, search, statusFilter, dayFilter, sortField, sortDirection]);

    const getFrequencyLabel = (days?: number) => {
        if (!days) return '—';
        if (days === 28) return 'Monthly';
        if (days === 56) return 'Bi-Monthly';
        if (days === 84) return 'Quarterly';
        if (days === 0) return 'One-Time';
        return `${days}d`;
    };

    const getStatusBadge = (status?: string, large?: boolean) => {
        const size = large
            ? 'inline-flex items-center px-3.5 py-1.5 rounded-full text-sm font-bold'
            : 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold';
        switch (status) {
            case 'active':
                return <span className={`${size} bg-lime-100 text-[#7AC142]`}>Active</span>;
            case 'canceled':
                return <span className={`${size} bg-red-100 text-red-700`}>Canceled</span>;
            case 'one-time':
                return <span className={`${size} bg-blue-100 text-blue-700`}>One-Time</span>;
            case 'incomplete':
                return <span className={`${size} bg-amber-100 text-amber-700`}>Incomplete</span>;
            default:
                return <span className={`${size} bg-slate-100 text-slate-500`}>{status || '—'}</span>;
        }
    };

    const getDayLabel = (day?: string) => {
        if (!day) return '—';
        const map: Record<string, string> = {
            MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday',
            THU: 'Thursday', FRI: 'Friday',
        };
        return map[day] || day;
    };

    const openMaps = (address: string) => {
        const encoded = encodeURIComponent(address);
        const isMobileDevice = /Mobi|Android|iPhone|iPad|iPod/.test(navigator.userAgent);

        if (isMobileDevice) {
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

            const fallbackTimer = setTimeout(() => {
                window.location.href = `https://maps.google.com/?q=${encoded}`;
            }, 3000);

            const onBlur = () => clearTimeout(fallbackTimer);
            window.addEventListener('blur', onBlur, { once: true });

            if (isIOS) {
                window.location.href = `maps://?q=${encoded}`;
            } else {
                window.location.href = `comgooglemaps://?q=${encoded}`;
            }
        } else {
            window.open(`https://maps.google.com/?q=${encoded}`, '_blank');
        }
    };

    const openDetail = (customer: CustomerWithDetails) => {
        setDetailCustomer(customer);
        setMobileNotesId(null);
        setShowMoreInfo(false);
        setDetailOpen(true);
    };

    const deleteTarget = customers.find(c => c.id === deleteConfirmId);

    const customerName = (c: CustomerWithDetails) =>
        c.first_name || c.last_name
            ? `${c.first_name || ''} ${c.last_name || ''}`.trim()
            : '—';

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-[#1C3D5A]" />
            </div>
        );
    }

    return (
        <>
            <Card className="border-none shadow-md rounded-[2rem] overflow-hidden">
                <CardHeader className="bg-white border-b px-6 py-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <CardTitle className="text-xl font-bold text-[#1C3D5A] flex items-center gap-2">
                            <Users size={22} className="text-[#7AC142]" />
                            All Customers
                            <span className="text-sm font-normal text-slate-400 ml-1">
                                ({filteredAndSorted.length})
                            </span>
                        </CardTitle>

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <Input
                                    placeholder="Search name, email, address..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    className="pl-9 w-full sm:w-64 rounded-xl border-slate-200 focus:border-[#7AC142] focus:ring-[#7AC142]"
                                />
                            </div>

                            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value ?? 'all')}>
                                <SelectTrigger className="w-full sm:w-36 rounded-xl border-slate-200">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Statuses</SelectItem>
                                    <SelectItem value="active">Active</SelectItem>
                                    <SelectItem value="canceled">Canceled</SelectItem>
                                    <SelectItem value="one-time">One-Time</SelectItem>
                                    <SelectItem value="incomplete">Incomplete</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={dayFilter} onValueChange={(value) => setDayFilter(value ?? 'all')}>
                                <SelectTrigger className="w-full sm:w-36 rounded-xl border-slate-200">
                                    <SelectValue placeholder="Service Day" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Days</SelectItem>
                                    <SelectItem value="MON">Monday</SelectItem>
                                    <SelectItem value="TUE">Tuesday</SelectItem>
                                    <SelectItem value="WED">Wednesday</SelectItem>
                                    <SelectItem value="THU">Thursday</SelectItem>
                                    <SelectItem value="FRI">Friday</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="p-0">
                    {/* ─── Desktop Table ─── */}
                    {!isMobile && (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-slate-50 border-b">
                                    <tr>
                                        <SortableHeader field="name" sortField={sortField} onToggleSort={toggleSort}>Name</SortableHeader>
                                        <SortableHeader field="email" sortField={sortField} onToggleSort={toggleSort}>Email</SortableHeader>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Phone</th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Bins</th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Scent</th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Address</th>
                                        <SortableHeader field="subscription_status" sortField={sortField} onToggleSort={toggleSort}>Status</SortableHeader>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Freq.</th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Day</th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider min-w-[200px]">Notes</th>
                                        <SortableHeader field="created_at" sortField={sortField} onToggleSort={toggleSort}>Created</SortableHeader>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredAndSorted.length === 0 ? (
                                        <tr>
                                            <td colSpan={11} className="px-4 py-12 text-center text-slate-400">
                                                No customers found.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredAndSorted.map(customer => (
                                            <tr
                                                key={customer.id}
                                                className="hover:bg-slate-50/50 transition-colors"
                                            >
                                                <td className="px-4 py-3 text-sm font-semibold text-[#1C3D5A] whitespace-nowrap">
                                                    {customerName(customer)}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-slate-600">{customer.email}</td>
                                                <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                                                    {customer.phone_number || '—'}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap text-center">
                                                    {customer.bin_quantity ? `${customer.bin_quantity}` : '—'}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap capitalize">
                                                    {customer.scent_preference?.replace(/_/g, ' ') || '—'}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-slate-600 max-w-[200px] truncate" title={customer.raw_address || ''}>
                                                    {customer.raw_address || '—'}
                                                </td>
                                                <td className="px-4 py-3">{getStatusBadge(customer.subscription_status)}</td>
                                                <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                                                    {getFrequencyLabel(customer.frequency_days)}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                                                    {getDayLabel(customer.service_day)}
                                                </td>

                                                {/* Inline Notes Editing */}
                                                <td className="px-4 py-3 text-sm">
                                                    {customer.address_id && editingNotesId === customer.address_id ? (
                                                        <div className="flex items-start gap-1">
                                                            <textarea
                                                                className="w-full min-h-[60px] text-sm border border-[#7AC142] rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-[#7AC142]/30 resize-y"
                                                                value={editingNotesValue}
                                                                onChange={e => setEditingNotesValue(e.target.value)}
                                                                autoFocus
                                                            />
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="h-7 w-7 p-0 text-[#7AC142] hover:bg-lime-50"
                                                                onClick={() => customer.address_id && handleSaveNotes(customer.address_id)}
                                                                disabled={savingNotes}
                                                            >
                                                                {savingNotes ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <div
                                                            className={`cursor-pointer rounded-lg px-2 py-1 -mx-2 -my-1 hover:bg-[#7AC142]/10 transition-colors min-h-[28px] ${
                                                                customer.address_id ? '' : 'pointer-events-none'
                                                            }`}
                                                            onClick={() => {
                                                                if (customer.address_id) {
                                                                    setEditingNotesId(customer.address_id);
                                                                    setEditingNotesValue(customer.notes || '');
                                                                }
                                                            }}
                                                            title={customer.address_id ? 'Click to edit notes' : 'No address linked'}
                                                        >
                                                            <span className={customer.notes ? 'text-slate-600' : 'text-slate-300 italic'}>
                                                                {customer.notes || (customer.address_id ? 'Click to add notes...' : '—')}
                                                            </span>
                                                        </div>
                                                    )}
                                                </td>

                                                <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                                                    {new Date(customer.created_at).toLocaleDateString()}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {(!customer.subscription_status || customer.subscription_status === 'canceled') && (
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                                                            onClick={() => setDeleteConfirmId(customer.id)}
                                                            title="Delete customer"
                                                        >
                                                            <Trash2 size={16} />
                                                        </Button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* ─── Mobile Card List ─── */}
                    {isMobile && (
                        <div className="p-4 space-y-3">
                            {filteredAndSorted.length === 0 ? (
                                <div className="py-12 text-center text-slate-400">
                                    No customers found.
                                </div>
                            ) : (
                                filteredAndSorted.map(customer => (
                                    <button
                                        key={customer.id}
                                        type="button"
                                        onClick={() => openDetail(customer)}
                                        className="w-full text-left bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:shadow-md transition-shadow active:scale-[0.98]"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <span className="text-base font-bold text-[#1C3D5A]">
                                                {customerName(customer)}
                                            </span>
                                            {getStatusBadge(customer.subscription_status)}
                                        </div>
                                        <p className="text-sm text-slate-500 mt-1 truncate">
                                            {customer.raw_address || '—'}
                                        </p>
                                        <div className="flex items-center gap-3 mt-3 text-xs text-slate-500">
                                            <span>🗑️ {customer.bin_quantity ?? '—'} bin{customer.bin_quantity !== 1 ? 's' : ''}</span>
                                            <span className="text-slate-300">·</span>
                                            <span className="capitalize">{customer.scent_preference?.replace(/_/g, ' ') || 'No scent'}</span>
                                            <span className="text-slate-300">·</span>
                                            <span>{getFrequencyLabel(customer.frequency_days)}</span>
                                            <span className="text-slate-300">·</span>
                                            <span>{getDayLabel(customer.service_day)}</span>
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ─── Mobile Customer Detail Sheet ─── */}
            <Sheet open={detailOpen} onOpenChange={(open) => {
                if (!open) {
                    setDetailOpen(false);
                    setMobileNotesId(null);
                }
            }}>
                <SheetContent side="right" showCloseButton={false} className="overflow-y-auto">
                    {detailCustomer && (
                        <div className="flex flex-col h-full">
                            {/* Sheet header */}
                            <div className="sticky top-0 bg-white z-10 border-b border-slate-100 px-6 py-5">
                                <SheetHeader>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <SheetTitle className="text-xl font-bold text-[#1C3D5A]">
                                                {customerName(detailCustomer)}
                                            </SheetTitle>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {getStatusBadge(detailCustomer.subscription_status, true)}
                                            <SheetClose className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors text-slate-400 hover:text-[#1C3D5A]">
                                                <X size={20} />
                                            </SheetClose>
                                        </div>
                                    </div>
                                </SheetHeader>
                            </div>

                            <div className="flex-1 px-6 py-5 space-y-6">
                                {/* Address + Navigate */}
                                {detailCustomer.raw_address && (
                                    <div>
                                        <div className="flex items-start gap-3">
                                            <MapPin size={20} className="text-[#7AC142] mt-0.5 shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-[#1C3D5A]">
                                                    {detailCustomer.raw_address}
                                                </p>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="mt-2 rounded-xl h-11 border-[#7AC142] text-[#7AC142] font-bold text-sm"
                                                    onClick={() => detailCustomer.raw_address && openMaps(detailCustomer.raw_address)}
                                                >
                                                    <MapPin size={16} className="mr-1.5" />
                                                    Navigate
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Notes */}
                                <div>
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Notes</h4>
                                    {detailCustomer.address_id && mobileNotesId === detailCustomer.address_id ? (
                                        <div className="flex items-start gap-2">
                                            <textarea
                                                className="flex-1 min-h-[80px] text-sm border border-[#7AC142] rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-[#7AC142]/30 resize-y"
                                                value={mobileNotesValue}
                                                onChange={e => setMobileNotesValue(e.target.value)}
                                                autoFocus
                                            />
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-11 w-11 shrink-0 text-[#7AC142] hover:bg-lime-50 rounded-xl"
                                                onClick={() => detailCustomer.address_id && handleMobileSaveNotes(detailCustomer.address_id)}
                                                disabled={savingMobileNotes}
                                            >
                                                {savingMobileNotes ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                                            </Button>
                                        </div>
                                    ) : (
                                        <div
                                            className={`rounded-xl border border-slate-200 p-3 min-h-[48px] ${
                                                detailCustomer.address_id ? 'cursor-pointer hover:border-[#7AC142] hover:bg-[#7AC142]/5 transition-colors' : ''
                                            }`}
                                            onClick={() => {
                                                if (detailCustomer.address_id) {
                                                    setMobileNotesId(detailCustomer.address_id);
                                                    setMobileNotesValue(detailCustomer.notes || '');
                                                }
                                            }}
                                        >
                                            <span className={detailCustomer.notes ? 'text-sm text-slate-600' : 'text-sm text-slate-300 italic'}>
                                                {detailCustomer.notes || (detailCustomer.address_id ? 'Tap to add notes...' : '—')}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Details */}
                                <div>
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Details</h4>
                                    <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                                        <DetailRow label="Bins" value={detailCustomer.bin_quantity ? `${detailCustomer.bin_quantity}` : '—'} />
                                        <DetailRow label="Scent" value={detailCustomer.scent_preference?.replace(/_/g, ' ') || '—'} />
                                        <DetailRow label="Service Day" value={getDayLabel(detailCustomer.service_day)} />
                                        <DetailRow label="Frequency" value={getFrequencyLabel(detailCustomer.frequency_days)} />
                                        <DetailRow label="Trash Day" value={getDayLabel(detailCustomer.trash_day)} />
                                    </div>
                                </div>

                                {/* More Info (expandable) */}
                                {detailCustomer.email && (
                                    <div>
                                        <button
                                            type="button"
                                            onClick={() => setShowMoreInfo(!showMoreInfo)}
                                            className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-[#1C3D5A] transition-colors min-h-[44px]"
                                        >
                                            {showMoreInfo ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                            More Info
                                        </button>
                                        {showMoreInfo && (
                                            <div className="mt-2 bg-slate-50 rounded-xl p-4 space-y-3">
                                                <DetailRow label="Email" value={detailCustomer.email} />
                                                <DetailRow label="Phone" value={detailCustomer.phone_number || '—'} />
                                                <DetailRow label="Created" value={new Date(detailCustomer.created_at).toLocaleDateString()} />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Delete (only if canceled) */}
                                {(!detailCustomer.subscription_status || detailCustomer.subscription_status === 'canceled') && (
                                    <div className="pt-4 border-t border-slate-100">
                                        <Button
                                            variant="destructive"
                                            className="w-full rounded-xl h-12 text-sm font-bold"
                                            onClick={() => setDeleteConfirmId(detailCustomer.id)}
                                        >
                                            <Trash2 size={16} className="mr-2" />
                                            Delete Customer
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </SheetContent>
            </Sheet>

            {/* ─── Delete Confirmation Dialog ─── */}
            <Dialog open={!!deleteConfirmId} onOpenChange={open => !open && setDeleteConfirmId(null)}>
                <DialogContent className="sm:max-w-md rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-[#1C3D5A]">Delete Customer</DialogTitle>
                        <DialogDescription>
                            This will permanently delete{' '}
                            <strong>{deleteTarget?.first_name} {deleteTarget?.last_name}</strong>
                            {' '}({deleteTarget?.email}) and all associated data including their address,
                            subscription, and service history. This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            variant="ghost"
                            onClick={() => setDeleteConfirmId(null)}
                            disabled={deleting}
                            className="rounded-xl"
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
                            disabled={deleting}
                            className="rounded-xl bg-red-600 hover:bg-red-700"
                        >
                            {deleting ? (
                                <>
                                    <Loader2 size={16} className="mr-2 animate-spin" />
                                    Deleting...
                                </>
                            ) : (
                                'Delete Permanently'
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">{label}</span>
            <span className="text-sm font-semibold text-[#1C3D5A]">{value}</span>
        </div>
    );
}
