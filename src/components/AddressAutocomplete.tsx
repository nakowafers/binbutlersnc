'use client';

import { useState } from 'react';
import { Autocomplete, useJsApiLoader } from '@react-google-maps/api';
import { Input } from "@/components/ui/input";

const libraries: ("places")[] = ["places"];

interface AddressAutocompleteProps extends React.ComponentProps<typeof Input> {
    onAddressSelected: (address: string, lat?: number, lng?: number) => void;
}

export function AddressAutocomplete({
    onAddressSelected,
    onChange,
    ...props
}: AddressAutocompleteProps) {
    const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);

    const { isLoaded } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
        libraries
    });

    const onPlaceChanged = () => {
        if (autocomplete !== null) {
            const place = autocomplete.getPlace();
            const formatted = place.formatted_address || '';
            const lat = place.geometry?.location?.lat();
            const lng = place.geometry?.location?.lng();
            
            if (formatted) {
                // Trigger react-hook-form onChange manually or update via setValue in parent
                onAddressSelected(formatted, lat, lng);
            }
        }
    };

    if (!isLoaded) {
        return (
            <Input
                onChange={onChange}
                {...props}
            />
        );
    }

    return (
        <Autocomplete
            onLoad={(auto) => setAutocomplete(auto)}
            onPlaceChanged={onPlaceChanged}
            options={{ componentRestrictions: { country: "us" } }}
        >
            <Input
                onChange={onChange}
                {...props}
            />
        </Autocomplete>
    );
}
