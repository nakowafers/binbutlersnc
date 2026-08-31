<!-- triage: ready-for-agent -->
# 0001 Mobile-Friendly Optimization

## Problem Statement

Homeowners and potential clients accessing the Bin Butlers NC website from smartphones and small mobile devices encounter severe layout breakages, horizontal viewport overflow, and occluded interactive controls.

Specifically:
- The circular brand crest medallion overflows narrow phone screens (320px–375px wide) and covers underlying hero headlines.
- Opening the mobile navigation menu causes navigation links to be trapped beneath the brand medallion.
- Floating testimonial and satisfaction badges push 32px past the left screen margin, triggering unintentional horizontal scrolling on mobile browsers.
- Multi-step signup forms present rigid connector lines that push step indicators off-screen, excessive card padding that severely compresses text inputs, and scroll traps in the Service Agreement terms box.
- Interactive tap targets across footer links and form controls fall below standard mobile thumb ergonomics (44x44px), frustrating users trying to tap links or checkboxes.

## Solution

A fully responsive, mobile-first design overhaul across the landing page, navigation header, customer onboarding flow, authentication views, and admin management dialogs.

The solution ensures that:
- The brand crest medallion dynamically scales to mobile screen dimensions while preserving its circular crest identity on larger displays.
- The mobile navigation drawer opens in a high-priority, full-screen overlay layer with an accessible backdrop, preventing any layer occlusion.
- All off-screen negative margins are constrained within the mobile viewport.
- The signup flow utilizes flexible relative progress connectors, ergonomic card paddings, and smooth touch scrolling for legal disclosures.
- All interactive controls (buttons, links, form selectors) adhere to a minimum 44x44px tap target size.

## User Stories

1. As a mobile website visitor, I want the header logo medallion to fit within my phone's screen without clipping or horizontal scrolling, so that I can see the full brand crest cleanly.
2. As a mobile website visitor, I want the hero title and call-to-action buttons to appear cleanly below the header without being obscured by overlapping logos, so that I can immediately understand the service offerings.
3. As a mobile website visitor, I want to tap the hamburger menu and have the navigation links appear above all other content, so that I can navigate to sections like Pricing, FAQ, or About without mis-taps.
4. As a mobile website visitor, I want the utility top ribbon to present service area and phone contact details in a readable format without awkward line breaks, so that I can immediately see service locations and call if needed.
5. As a mobile website visitor, I want to browse the value metrics (e.g., hot water, 99.9% sanitized) in a neat grid that fits my screen, so that I can quickly evaluate service quality.
6. As a mobile website visitor, I want to view the "About Us" section without the satisfaction badge forcing horizontal page jitter, so that my browsing experience is smooth and frustration-free.
7. As a mobile website visitor, I want the featured pricing plan card to fit flush with standard card margins on my phone, so that it does not extend beyond my screen edges when stacked vertically.
8. As a mobile website visitor, I want footer navigation links, phone numbers, and social media links to have generous touch targets (at least 44x44px), so that I can easily tap them with my thumb.
9. As a prospective customer on a smartphone, I want the multi-step signup progress bar to resize fluidly to my screen width, so that I can clearly see all three steps without horizontal overflow.
10. As a prospective customer on a smartphone, I want the signup form card to utilize screen-appropriate padding, so that input fields and address search bars have maximum room for easy typing.
11. As a prospective customer on an iPhone, I want form input text to maintain a 16px minimum font size, so that iOS Safari does not aggressively zoom into inputs upon focus.
12. As a prospective customer selecting a service frequency, I want the plan options to display price, title, and cadence clearly without crowding or squishing the radio button, so that I can choose my plan with confidence.
13. As a prospective customer reviewing the Service Agreement in Step 3, I want the terms box to be comfortably sized with momentum touch scrolling, so that I can read the agreement without getting stuck in a scroll trap.
14. As a prospective customer completing signup, I want consent checkboxes to have clear, easily tappable hit areas, so that I can quickly confirm my agreement and proceed to payment.
15. As a returning customer signing in on mobile, I want the email and Google sign-in buttons to be sized comfortably with responsive padding, so that I can quickly log in to my account.
16. As an administrator reviewing customer records on a mobile device, I want the edit customer dialog to remain usable with the software keyboard open, so that I can update details without losing access to the save action.

## Implementation Decisions

- **Responsive Brand Crest Component**: Implement tiered viewport scaling for the circular crest medallion (small mobile, tablet, desktop) while preserving its circular ring border, inner crest graphic, and rating badge.
- **Top-Layer Mobile Navigation Overlay**: Transition the mobile navigation drawer from an in-flow container to an elevated overlay system with a backdrop layer, ensuring an interactive hierarchy that sits above all background and hero elements.
- **Responsive Viewport Containment**: Replace fixed negative outer offsets on mobile viewports with container-relative alignments that transition to overlapping offsets only on tablet breakpoints and above.
- **Flexible Progress Stepper Architecture**: Convert fixed-pixel horizontal connector bars in multi-step wizard flows into flexible relative lines that shrink or expand between step badges based on available viewport width.
- **Adaptive Card Padding**: Standardize card padding across onboarding and authentication views to scale gracefully from mobile devices to desktop displays.
- **Touch Ergonomics Enforcement**: Ensure all anchor links, buttons, and form toggle items maintain minimum 44x44px tap boundaries across mobile layouts.
- **Keyboard-Safe Modal Layouts**: Update full-detail editing dialogs to utilize flex-column scrollable body structures with pinned action footers, ensuring action buttons remain visible and operable when mobile on-screen keyboards are active.

## Testing Decisions

- **External Behavior Testing**: Test only user-observable responsive behaviors and interactive flows rather than private component states.
- **Modules Tested**:
  - Landing page navigation and section rendering under various viewport dimensions (320px, 375px, 768px, 1280px).
  - Multi-step customer onboarding and checkout initialization across small-screen viewports.
  - Authentication and account verification views.
  - Driver dispatch and customer management views on mobile viewports.
- **Prior Art**:
  - Existing Playwright end-to-end suite (`tests/e2e/onboarding.spec.ts`, `tests/e2e/dispatch.spec.ts`) validating form validation, address autocomplete, and API payloads.
  - Vitest unit and integration test suite (`tests/unit/`, `tests/integration/`) validating pricing calculation, dispatch routing, and data consistency.

## Out of Scope

- Introducing new authentication providers or changing authentication protocols.
- Modifying backend pricing logic, Stripe billing configurations, or webhook handlers.
- Redesigning the desktop layout or altering brand color palettes.
- Modifying dispatch route optimization algorithms or database schemas.

## Further Notes

All visual updates strictly follow repository design mandates (Jobatory CRM functional alignment, Tailwind CSS design system, and WCAG accessibility standards).
