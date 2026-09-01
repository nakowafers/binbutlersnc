'use client';

import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';
import { AlertTriangle, CalendarClock, CheckCircle2, Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import type { CustomerWithDetails } from '@/lib/types';
import { getDayLabel } from '@/lib/date-utils';
import type { BinQuantityAdjustmentPreview, BinQuantityPreviewBeforeState } from '@/lib/admin/BinQuantityAdjustmentService';

interface EditCustomerDialogProps {
    customer: CustomerWithDetails | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
}

const SCENTS = [
    { value: 'lavender', label: 'Lavender' },
    { value: 'ocean_breeze', label: 'Ocean Breeze' },
    { value: 'tropical', label: 'Tropical' },
] as const;

const TRASH_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'] as const;

export function EditCustomerDialog({ customer, open, onOpenChange, onSaved }: EditCustomerDialogProps) {
    const [firstName, setFirstName] = useState(customer?.first_name || '');
    const [lastName, setLastName] = useState(customer?.last_name || '');
    const [phoneNumber, setPhoneNumber] = useState(customer?.phone_number || '');
    const [rawAddress, setRawAddress] = useState(customer?.raw_address || '');
    const [latitude, setLatitude] = useState<number | null>(null);
    const [longitude, setLongitude] = useState<number | null>(null);
    const [trashDay, setTrashDay] = useState(customer?.trash_day || '');
    const [scentPreference, setScentPreference] = useState(customer?.scent_preference || 'lavender');
    const [notes, setNotes] = useState(customer?.notes || '');
    const [saving, setSaving] = useState(false);
    const [manualRescheduleDate, setManualRescheduleDate] = useState(customer?.next_service_date || '');
    const [rescheduling, setRescheduling] = useState(false);
    const [targetBins, setTargetBins] = useState(customer?.bin_quantity ?? 1);
    const [binReason, setBinReason] = useState('');
    const [binCorrelationKey, setBinCorrelationKey] = useState('');
    const [binPreview, setBinPreview] = useState<BinQuantityAdjustmentPreview | null>(null);
    const [binBefore, setBinBefore] = useState<BinQuantityPreviewBeforeState | null>(null);
    const [previewingBins, setPreviewingBins] = useState(false);
    const [confirmingBins, setConfirmingBins] = useState(false);
    const [confirmBins, setConfirmBins] = useState(false);
    const [binError, setBinError] = useState<string | null>(null);

    const createCorrelationKey = () => {
        if (binCorrelationKey) return binCorrelationKey;
        const key = `admin-bin-quantity:${customer?.id}:${Date.now()}`;
        setBinCorrelationKey(key);
        return key;
    };

    const handleBinPreview = async () => {
        if (!customer) return;
        setPreviewingBins(true);
        setBinError(null);
        try {
            const correlationKey = createCorrelationKey();
            const res = await fetch('/api/admin/customers/bin-quantity/preview', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customerId: customer.id, targetBins, reason: binReason, correlationKey }),
            });
            const data = await res.json() as BinQuantityAdjustmentPreview & { error?: string };
            if (!res.ok) throw new Error(data.error || 'Unable to preview bin quantity change');
            if (!data.before) throw new Error('Preview did not include the exact before-state');
            setBinPreview(data);
            setBinBefore(data.before);
            setConfirmBins(false);
        } catch (error) {
            setBinError(error instanceof Error ? error.message : 'Unable to preview bin quantity change');
        } finally {
            setPreviewingBins(false);
        }
    };

    const handleBinConfirm = async () => {
        if (!customer || !binBefore || !binPreview || !confirmBins) return;
        setConfirmingBins(true);
        setBinError(null);
        try {
            const res = await fetch('/api/admin/customers/bin-quantity/confirm', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customerId: customer.id, targetBins, reason: binReason, correlationKey: binCorrelationKey, previewBefore: binBefore }),
            });
            const data = await res.json() as { error?: string };
            if (!res.ok) throw new Error(data.error || 'Unable to confirm bin quantity change');
            toast.success('Bin quantity updated');
            onOpenChange(false);
            onSaved();
        } catch (error) {
            setBinError(error instanceof Error ? error.message : 'Unable to confirm bin quantity change');
        } finally {
            setConfirmingBins(false);
        }
    };

    const handleAddressSelected = (address: string, lat?: number, lng?: number) => {
        setRawAddress(address);
        if (lat !== undefined) setLatitude(lat);
        if (lng !== undefined) setLongitude(lng);
    };

    const handleAddressCleared = () => {
        setRawAddress('');
        setLatitude(null);
        setLongitude(null);
    };

    const handleSave = async () => {
        if (!customer) return;
        setSaving(true);

        try {
            const body: Record<string, unknown> = {
                customerId: customer.id,
                addressId: customer.address_id || '',
                firstName,
                lastName,
                phoneNumber,
            };

            const hasAddressChanges = rawAddress !== customer.raw_address ||
                trashDay !== customer.trash_day ||
                scentPreference !== customer.scent_preference ||
                notes !== customer.notes;

            if (customer.address_id && hasAddressChanges) {
                body.rawAddress = rawAddress || undefined;
                body.latitude = latitude;
                body.longitude = longitude;
                body.trashDay = trashDay || undefined;
                body.notes = notes || undefined;
                body.scentPreference = scentPreference || undefined;
            }

            const res = await fetch('/api/admin/customers/update', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const data = await res.json() as { error?: string };
                throw new Error(data.error || 'Failed to save');
            }

            toast.success('Customer updated');
            onOpenChange(false);
            onSaved();
        } catch (error) {
            console.error('Error saving customer:', error);
            toast.error(error instanceof Error ? error.message : 'Failed to save customer');
        } finally {
            setSaving(false);
        }
    };

    const handleManualReschedule = async () => {
        if (!customer) return;
        setRescheduling(true);

        try {
            const res = await fetch('/api/admin/customers/update', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    customerId: customer.id,
                    addressId: customer.address_id || '',
                    manualRescheduleFirstServiceDate: manualRescheduleDate,
                    serviceDay: customer.service_day,
                }),
            });

            if (!res.ok) {
                const data = await res.json() as { error?: string };
                throw new Error(data.error || 'Failed to reschedule');
            }

            toast.success('First Service Date updated');
            onOpenChange(false);
            onSaved();
        } catch (error) {
            console.error('Error rescheduling first service:', error);
            toast.error(error instanceof Error ? error.message : 'Failed to reschedule first service');
        } finally {
            setRescheduling(false);
        }
    };

    if (!customer) return null;

    const name = [customer.first_name, customer.last_name].filter(Boolean).join(' ') || '—';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg rounded-2xl max-h-[90dvh] flex flex-col p-0 overflow-hidden">
                <DialogHeader className="px-6 pt-6 pb-2 shrink-0 text-left">
                    <DialogTitle className="text-[#1C3D5A] flex items-center gap-2">
                        <Pencil size={18} className="text-[#7AC142]" />
                        Edit Customer
                    </DialogTitle>
                    <DialogDescription>
                        Updating details for <strong>{name}</strong>
                    </DialogDescription>
                </DialogHeader>

                <div className="px-6 py-2 flex-1 overflow-y-auto space-y-5 [-webkit-overflow-scrolling:touch]">
                    {/* Name fields */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-[#1C3D5A] font-semibold text-xs">First Name</Label>
                            <Input
                                value={firstName}
                                onChange={e => setFirstName(e.target.value)}
                                className="rounded-xl border-slate-200 focus:border-[#7AC142] focus:ring-[#7AC142]"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[#1C3D5A] font-semibold text-xs">Last Name</Label>
                            <Input
                                value={lastName}
                                onChange={e => setLastName(e.target.value)}
                                className="rounded-xl border-slate-200 focus:border-[#7AC142] focus:ring-[#7AC142]"
                            />
                        </div>
                    </div>

                    {/* Phone */}
                    <div className="space-y-1.5">
                        <Label className="text-[#1C3D5A] font-semibold text-xs">Phone</Label>
                        <Input
                            value={phoneNumber}
                            onChange={e => setPhoneNumber(e.target.value)}
                            className="rounded-xl border-slate-200 focus:border-[#7AC142] focus:ring-[#7AC142]"
                        />
                    </div>

                    {/* Address */}
                    <div className="space-y-1.5">
                        <Label className="text-[#1C3D5A] font-semibold text-xs">Service Address</Label>
                        <AddressAutocomplete
                            value={rawAddress}
                            onAddressSelected={handleAddressSelected}
                            onAddressCleared={handleAddressCleared}
                            placeholder="Search for an address..."
                        />
                    </div>

                    {/* Trash Day */}
                    <div className="space-y-1.5">
                        <Label className="text-[#1C3D5A] font-semibold text-xs">Trash Day</Label>
                        <Select value={trashDay} onValueChange={(val) => setTrashDay(val ?? '')}>
                            <SelectTrigger className="w-full rounded-xl border-slate-200">
                                <SelectValue placeholder="Select trash day" />
                            </SelectTrigger>
                            <SelectContent>
                                {TRASH_DAYS.map(day => (
                                    <SelectItem key={day} value={day}>{getDayLabel(day)}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Scent Preference */}
                    <div className="space-y-1.5">
                        <Label className="text-[#1C3D5A] font-semibold text-xs">Scent Preference</Label>
                        <Select value={scentPreference} onValueChange={(val) => setScentPreference(val ?? 'lavender')}>
                            <SelectTrigger className="w-full rounded-xl border-slate-200">
                                <SelectValue placeholder="Select scent" />
                            </SelectTrigger>
                            <SelectContent>
                                {SCENTS.map(scent => (
                                    <SelectItem key={scent.value} value={scent.value}>{scent.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Notes */}
                    <div className="space-y-1.5">
                        <Label className="text-[#1C3D5A] font-semibold text-xs">Notes</Label>
                        <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            className="w-full min-h-[80px] text-sm border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-[#7AC142]/30 focus:border-[#7AC142] resize-y"
                        />
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3" data-testid="bin-quantity-adjustment">
                        <div>
                            <Label className="text-[#1C3D5A] font-semibold text-sm">Bin Quantity Adjustment</Label>
                            <p className="text-xs text-slate-500 mt-1">Current D1 bins: <strong>{customer.bin_quantity ?? '—'}</strong>. Preview the provider state before confirming.</p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="target-bins" className="text-xs">Target total bins</Label>
                                <Input id="target-bins" type="number" min={1} step={1} value={targetBins} onChange={e => { setTargetBins(Number(e.target.value)); setBinPreview(null); }} className="rounded-xl bg-white" />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="bin-reason" className="text-xs">Reason <span className="text-red-600">*</span></Label>
                                <Input id="bin-reason" value={binReason} onChange={e => { setBinReason(e.target.value); setBinPreview(null); }} placeholder="Customer requested change" className="rounded-xl bg-white" />
                            </div>
                        </div>
                        <Button type="button" variant="outline" onClick={handleBinPreview} disabled={previewingBins || !binReason.trim() || !Number.isInteger(targetBins) || targetBins < 1} className="rounded-xl">
                            {previewingBins ? <><Loader2 size={16} className="mr-2 animate-spin" />Previewing...</> : 'Preview bin change'}
                        </Button>
                        {binPreview ? <div className="space-y-3 rounded-lg border border-white bg-white p-3 text-sm">
                            <div className="flex items-center gap-2 font-semibold text-[#1C3D5A]"><CheckCircle2 size={16} className="text-[#7AC142]" /> Verified preview</div>
                            <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                                <span>D1 bins: <strong>{binPreview.before!.d1Bins}</strong></span>
                                <span>Target: <strong>{binPreview.targetBins}</strong></span>
                                <span>Observed extra bins: <strong>{binPreview.before!.stripeExtraBinQuantity}</strong></span>
                                <span>Observed Price ID: <strong>{binPreview.before!.stripeExtraBinPriceId || 'none'}</strong></span>
                            </div>
                            {binPreview.mismatch ? <p className="text-amber-700">Mismatch detected between D1 and Stripe. The service will reconcile this only after this exact preview is confirmed.</p> : null}
                            {binPreview.requiresNoProration ? <p className="flex gap-2 text-amber-700"><AlertTriangle size={16} className="shrink-0" />No proration: this adjustment will not create an immediate prorated charge.</p> : null}
                            <label className="flex items-start gap-2 text-xs text-slate-700"><input type="checkbox" checked={confirmBins} onChange={e => setConfirmBins(e.target.checked)} className="mt-0.5" /> I confirm this exact preview and authorize the bin quantity adjustment.</label>
                            <Button type="button" onClick={handleBinConfirm} disabled={confirmingBins || !confirmBins} className="rounded-xl bg-[#1C3D5A] hover:bg-[#153149] text-white">
                                {confirmingBins ? <><Loader2 size={16} className="mr-2 animate-spin" />Applying...</> : 'Confirm bin quantity adjustment'}
                            </Button>
                        </div> : null}
                        {binError ? <p role="alert" className="text-sm text-red-700">{binError}</p> : null}
                    </div>

                    {customer.needs_first_service_reschedule ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <CalendarClock size={18} className="text-amber-700" />
                                <Label htmlFor="manual-reschedule-date" className="text-[#1C3D5A] font-semibold text-sm">
                                    Manual Reschedule
                                </Label>
                            </div>
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <Input
                                    id="manual-reschedule-date"
                                    type="date"
                                    value={manualRescheduleDate}
                                    onChange={e => setManualRescheduleDate(e.target.value)}
                                    className="rounded-xl border-amber-200 bg-white focus:border-amber-500 focus:ring-amber-500"
                                />
                                <Button
                                    type="button"
                                    onClick={handleManualReschedule}
                                    disabled={rescheduling}
                                    className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white sm:w-auto"
                                >
                                    {rescheduling ? (
                                        <>
                                            <Loader2 size={16} className="mr-2 animate-spin" />
                                            Rescheduling...
                                        </>
                                    ) : (
                                        'Manual Reschedule'
                                    )}
                                </Button>
                            </div>
                        </div>
                    ) : null}
                </div>

                <DialogFooter className="px-6 py-4 bg-slate-50 border-t shrink-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                    <Button
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        disabled={saving}
                        className="rounded-xl"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={saving}
                        className="rounded-xl bg-[#7AC142] hover:bg-[#6BB038] text-white"
                    >
                        {saving ? (
                            <>
                                <Loader2 size={16} className="mr-2 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            'Save Changes'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
