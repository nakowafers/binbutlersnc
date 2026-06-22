<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Bin Butlers NC: Agent Instructions

## Design & UX Workflow
When implementing UI, screens, or user flows, the agent MUST leverage the Stitch (`mcp_stitch`) tools to enhance design prompts and generate high-fidelity UI screens.

### Protocol:
1. Iterative Design: Use `mcp_stitch_generate_screen_from_text` to draft concepts.
2. Design System Alignment: Adhere to Next.js, Tailwind CSS, and Shadcn UI. Priority: Mobile-First Responsiveness.
3. Refinement: Use Jobatory as the primary functional reference for all CRM features.

## Tech Stack & Architecture Enforcement
- Frontend: Next.js (App Router), Tailwind CSS, Shadcn UI.
- Backend: Next.js Edge API (`@cloudflare/next-on-pages`). Run local via `wrangler pages dev`.
- Database: Cloudflare D1. Use `wrangler d1 migrations` for all schema changes.
- Routing: Strict Adapter Pattern. Logic must live in `src/lib/routing/` using `IRoutingService`.
- Fulfillment: D2D signups create immediate `service_history` records; Organic signups are dispatched via weekly cron.
- Auth: Auth.js (Magic Links).

## Verification
- After making any code changes, run `npm run lint` to check for ESLint violations before committing.
- After making any code changes, run `npm run build` to verify there are no compile or type errors before considering the work complete.

## Deployment Prerequisites
- `AUTH_SECRET` must be set as a **GitHub Actions secret** (`https://github.com/binbutlersnc/binbutlersnc/settings/secrets/actions`) and is deployed via CI to Cloudflare Workers as a secret. Do not hardcode it anywhere.
- For local dev, add `AUTH_SECRET=<value>` to `.dev.vars`.
