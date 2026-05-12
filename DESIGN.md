# Bin Butlers NC: Design System & Guidelines

## 1. Visual Identity & Brand Concept
The brand identity for Bin Butlers NC is built on **trust, sanitation, and professional reliability**. The design should feel "clean" and "refreshing," utilizing a palette that evokes water, hygiene, and local North Carolina friendliness.

## 2. Color Palette
Based on the brand logo and industry standards (Jobatory/MN Bin Bath):

*   **Primary (Navy Blue):** `#1C3D5A`
    *   *Usage:* Headers, primary buttons, hero text, and footers. Represents stability and professional service.
*   **Secondary (Lime Green):** `#7AC142`
    *   *Usage:* Accent badges, "Success" states, icons, and CTA highlights. Represents eco-friendly cleaning and "Go" for service.
*   **Background (Soft Gray/White):** `#F8FAFC` / `#FFFFFF`
    *   *Usage:* Main page backgrounds and card surfaces to maintain a clean, airy feel.
*   **Warning/Error (Coral):** `#EF4444`
    *   *Usage:* Required field errors, failed payment alerts.

## 3. Typography
The system uses the **Outfit** font family (Google Fonts) for a modern, geometric, yet friendly feel.

*   **Headlines (Bold 800):** Used for H1/H2 to create strong visual hierarchy.
*   **Body (Regular 400):** Optimized for readability at 16px.
*   **Accents (Semi-Bold 600):** Used for navigation links and button labels.

## 4. Component Style (Shadcn UI + Tailwind)
All components should adhere to the following stylistic rules:
*   **Roundness:** Medium-to-Large (`rounded-xl` / `12px`). Evokes a modern, friendly "app-like" feel.
*   **Shadows:** Soft, diffused shadows (`shadow-sm` for cards, `shadow-md` for hovered elements).
*   **Interactions:** Micro-interactions on buttons (scale down on click) to feel responsive on mobile (iPad) devices.

## 5. Industry-Specific UX Patterns (Reference: Jobatory)
*   **The "Trust Badge" Hero:** Hero sections must feature a "100% Satisfaction Guaranteed" or "Top-Rated Service" badge.
*   **Service Day Selector:** Dropdowns must be clearly labeled and high-contrast, as they are the primary "Source of Truth" for operations.
*   **Frictionless Checkout:** Minimize fields. Use Google Address Autocomplete to reduce typing.
*   **Status Transparency:** The Customer Portal should use visual "Progress Steps" for the next cleaning cycle (e.g., Scheduled -> Dispatched -> Completed).

## 6. Imagery & Assets
*   **Realism:** Use high-quality photos of bins being cleaned (e.g., `assets/trash_bins_cleaning.png`).
*   **Service Stickers:** Design placeholders or icons for the "Service Stickers" used for bin identification.
*   **Verification Photos:** Display driver-captured photos in a "Polaroid" or "Gallery" card format within the portal to prove service.

## 7. Stitch Design Prompts
When using `/stitch`, use the following "Style Seed":
> "Modern, clean, mobile-first service CRM interface. Primary Navy #1C3D5A, Secondary Lime #7AC142. Typography: Outfit. Style: Shadcn/Tailwind with large rounded corners and high white space. Industry: Professional Sanitation/Home Services."
