'use client';

import { useEffect, useRef } from 'react';
import { GeoapifyContext, GeoapifyGeocoderAutocomplete } from '@geoapify/react-geocoder-autocomplete';
import '@geoapify/geocoder-autocomplete/styles/minimal.css';

interface AddressAutocompleteProps {
    id?: string;
    value?: string;
    onChange?: unknown;
    onBlur?: unknown;
    name?: string;
    ref?: unknown;
    onAddressSelected: (address: string, lat?: number, lng?: number) => void;
    placeholder?: string;
    className?: string;
}

export function AddressAutocomplete({
    id,
    value,
    onChange,
    name,
    ref: forwardedRef,
    onAddressSelected,
    placeholder,
    className
}: AddressAutocompleteProps) {
    const apiKey = process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY || '';
    const containerRef = useRef<HTMLDivElement>(null);

    // Assign the id directly to the inner input element so label matching and E2E selectors work,
    // and bind the forwarded React Hook Form ref to the input element for validation tracking.
    useEffect(() => {
        if (containerRef.current && id) {
            const input = containerRef.current.querySelector('input');
            if (input) {
                input.id = id;
                if (forwardedRef) {
                    if (typeof forwardedRef === 'function') {
                        (forwardedRef as (element: HTMLInputElement | null) => void)(input);
                    } else {
                        (forwardedRef as { current: HTMLInputElement | null }).current = input;
                    }
                }
            }
        }
    }, [id, forwardedRef]);

    // Handle selection from autocomplete suggestions dropdown
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handlePlaceSelect = (place: any) => {
        if (place?.properties) {
            const formatted = place.properties.formatted || '';
            const lat = place.properties.lat;
            const lng = place.properties.lon; // Geoapify returns longitude as 'lon'
            
            if (formatted) {
                onAddressSelected(formatted, lat, lng);
            }
        }
    };

    // Handle keystrokes to update react-hook-form state
    const handleUserInput = (val: string) => {
        if (onChange) {
            (onChange as (event: { target: { name: string; value: string } }) => void)({
                target: {
                    name: name || 'address',
                    value: val
                }
            });
        }
    };

    return (
        <div ref={containerRef} className={`relative w-full ${className || ''}`}>
            <GeoapifyContext apiKey={apiKey}>
                <GeoapifyGeocoderAutocomplete
                    placeholder={placeholder || 'Search for an address'}
                    value={value}
                    placeSelect={handlePlaceSelect}
                    onUserInput={handleUserInput}
                    filterByCountryCode={['us']}
                    limit={5}
                />
            </GeoapifyContext>
        </div>
    );
}
