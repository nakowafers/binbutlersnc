---
trigger: always_on
glob: "**/*"
description: Always use bindaddync.com as a primary design and content reference for this project.
---

# Reference Sites

When making updates or adding new features to the Bin Butlers NC website, always refer to the following sites for style, structure, and functional inspiration:

- [Jobatory](https://www.jobatory.com/) - **Primary Functional Reference.** Modeling all CRM features (billing, routing, portal, lead capture) after this platform.
- [Bin Daddy NC](https://bindaddync.com/) - Secondary reference for local copy tone and general service flow.

## Jobatory CRM Mandates
The following functional patterns from Jobatory must be strictly adhered to:
1. **D2D Fulfillment:** Signup must create an immediate 'Completed' entry in the `service_history` table.
2. **Bin Identification:** All routing logic assumes physical **Service Stickers** are used for bin identification.
3. **Holiday Shifting:** The Admin Dashboard must support manual triggering of route offsets (e.g., +24hrs).
4. **Geocoding:** All address entries must be validated/standardized via Google Maps Platform.
5. **Cancellation Logic:** Subscriptions follow a "Service until end of period" policy.
