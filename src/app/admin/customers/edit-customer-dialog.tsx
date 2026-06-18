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
import { Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import type { CustomerWithDetails } from '@/lib/types';

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

const DAY_LABELS: Record<string, string> = {
    MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday',
    THU: 'Thursday', FRI: 'Friday',
};

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

    if (!customer) return null;

    const name = [customer.first_name, customer.last_name].filter(Boolean).join(' ') || '—';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg rounded-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-[#1C3D5A] flex items-center gap-2">
                        <Pencil size={18} className="text-[#7AC142]" />
                        Edit Customer
                    </DialogTitle>
                    <DialogDescription>
                        Updating details for <strong>{name}</strong>
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 py-2">
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
                                    <SelectItem key={day} value={day}>{DAY_LABELS[day]}</SelectItem>
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
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
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
