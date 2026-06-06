import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

export function normalizeAddress(address: string): string {
    return address.trim().toLowerCase().replace(/\s+/g, ' ');
}
