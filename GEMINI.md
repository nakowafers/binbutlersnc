# Bin Butlers NC: Agent Instructions

## Design & UX Workflow
When implementing UI, screens, or user flows, the agent MUST leverage the **Stitch (mcp_stitch)** tools to enhance design prompts and generate high-fidelity UI screens.

### Protocol:
1.  **Iterative Design:** Use `mcp_stitch_generate_screen_from_text` to draft initial UI concepts based on the requirements.
2.  **Design System Alignment:** Ensure all generated screens adhere to the specified tech stack (Next.js, Tailwind CSS, Shadcn UI).
3.  **Refinement:** Use `mcp_stitch_edit_screens` or `mcp_stitch_generate_variants` to polish the UX based on feedback or reference architectures (Jobatory).

## Tech Stack Enforcement
- **Frontend:** Next.js (App Router), Tailwind CSS, Shadcn UI.
- **Backend:** Next.js Edge API (@cloudflare/next-on-pages).
- **Database:** Cloudflare D1.
- **Storage:** Cloudflare R2.
- **Auth:** Auth.js (Magic Links).
