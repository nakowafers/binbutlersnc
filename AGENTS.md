# Repository Guidelines

<!-- BEGIN:nextjs-agent-rules -->
## Next.js Version Notice
This project uses Next.js 15.2.0, React 19, App Router, and `eslint-config-next` 16.x. Before changing framework behavior, inspect installed docs or source in `node_modules/next/`; `node_modules/next/dist/docs/` may not exist.
<!-- END:nextjs-agent-rules -->

## Project Structure & Module Organization
Application code lives in `src/`: routes and API handlers in `src/app`, UI in `src/components`, hooks in `src/hooks`, and domain logic in `src/lib`. Keep routing-provider logic behind `src/lib/routing/IRoutingService`; do not import Routific details into handlers. Database adapters live in `src/lib/db/adapters`, cron workers in `workers/`, D1 migrations in `migrations/`, scripts in `scripts/`, assets in `public/`, and tests in `tests/{unit,integration,e2e}`.

## Build, Test, and Development Commands
- `npm run dev`: Next.js dev server.
- `npm run build`: production compile and type check.
- `npm run build:cf`: Cloudflare Pages output via `@cloudflare/next-on-pages`.
- `npm run preview`: Cloudflare build plus `wrangler pages dev`.
- `npm run lint`: ESLint for `src`, `workers`, and config files.
- `npm run test`: Vitest unit and integration tests.
- `npm run test:e2e`: Playwright browser tests.
- `npm run db:seed`: seed local D1-compatible data.

## Coding Style & Naming Conventions
Use TypeScript, Tailwind CSS, and shadcn/ui. Prefer the `@/` alias for `src` imports. Components use PascalCase, route handlers use `route.ts`, tests use `*.test.ts` or `*.spec.ts`, and D1 migrations use numbered SQL. Keep business logic in `src/lib`, not pages or handlers.

## Testing Guidelines
Vitest covers unit and integration tests outside `tests/e2e`; Playwright covers browser flows in `tests/e2e`. Add focused tests for pricing, dispatch, webhook, database-adapter, and auth changes. Schema changes require a D1 migration plus test or seed updates.

## Commit & Pull Request Guidelines
Recent history uses concise imperative subjects, often with PR numbers, for example `Add Stripe config validation and signup fixes (#63)`. Keep commits scoped. PRs should describe behavior changes, link issues, call out migrations or config changes, and include screenshots for UI changes.

## Security & Configuration
Do not hardcode secrets. Local development uses `.dev.vars`; production secrets live in GitHub Actions and Cloudflare. `AUTH_SECRET` is required locally and in CI. Use `wrangler d1 migrations` for schema changes. Preserve fulfillment behavior: D2D signups create immediate `service_history` records; organic signups dispatch by cron.

## Agent-Specific Instructions
For UI or user flows, use Stitch (`mcp_stitch`) tools when available. Align CRM features with Jobatory as the functional reference. After code changes, run `npm run lint` and `npm run build`.
