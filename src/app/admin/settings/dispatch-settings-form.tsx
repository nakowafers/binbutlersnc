'use client';

import { useState } from 'react';
import { Save } from 'lucide-react';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';
import { SalesRep } from '@/lib/types';

type DispatchSettingsFormProps = {
    drivers: SalesRep[];
    selectedDriverId: string;
    depotAddress: string;
    depotLat: number | null;
    depotLng: number | null;
    action: (formData: FormData) => void | Promise<void>;
};

function driverLabel(driver: SalesRep): string {
    return driver.email ? `${driver.id} (${driver.email})` : driver.id;
}

export function DispatchSettingsForm({
    drivers,
    selectedDriverId,
    depotAddress,
    depotLat,
    depotLng,
    action,
}: DispatchSettingsFormProps) {
    const [address, setAddress] = useState(depotAddress);
    const [lat, setLat] = useState(depotLat === null ? '' : String(depotLat));
    const [lng, setLng] = useState(depotLng === null ? '' : String(depotLng));

    return (
        <form action={action} className="mt-4 grid gap-4">
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
                Default Admin-Driver
                <select
                    name="default_driver_sales_rep_id"
                    defaultValue={selectedDriverId}
                    className="h-11 rounded-md border border-slate-300 bg-white px-3 text-base text-slate-950"
                >
                    <option value="">Select driver</option>
                    {drivers.map((driver) => (
                        <option key={driver.id} value={driver.id}>
                            {driverLabel(driver)}
                        </option>
                    ))}
                </select>
            </label>

            <div className="grid gap-1 text-sm font-semibold text-slate-700">
                <label htmlFor="route_depot_address">Depot Address</label>
                <AddressAutocomplete
                    id="route_depot_address"
                    value={address}
                    onChange={(event: { target: { value: string } }) => setAddress(event.target.value)}
                    onAddressSelected={(formatted, selectedLat, selectedLng) => {
                        setAddress(formatted);
                        setLat(selectedLat === undefined ? '' : String(selectedLat));
                        setLng(selectedLng === undefined ? '' : String(selectedLng));
                    }}
                    onAddressCleared={() => {
                        setLat('');
                        setLng('');
                    }}
                    placeholder="Search for depot address"
                />
                <input type="hidden" name="route_depot_address" value={address} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-semibold text-slate-700">
                    Depot Latitude
                    <input
                        name="route_depot_lat"
                        value={lat}
                        onChange={(event) => setLat(event.target.value)}
                        inputMode="decimal"
                        className="h-11 rounded-md border border-slate-300 px-3 text-base"
                    />
                </label>
                <label className="grid gap-1 text-sm font-semibold text-slate-700">
                    Depot Longitude
                    <input
                        name="route_depot_lng"
                        value={lng}
                        onChange={(event) => setLng(event.target.value)}
                        inputMode="decimal"
                        className="h-11 rounded-md border border-slate-300 px-3 text-base"
                    />
                </label>
            </div>

            <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#1C3D5A] px-4 font-bold text-white">
                <Save size={18} />
                Save Dispatch Settings
            </button>
        </form>
    );
}
