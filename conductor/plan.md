# Plan: Fix Admin Login Redirect

## Objective
Ensure that users attempting to log into the admin dashboard (`/admin`) are correctly redirected back to the admin page after authentication, instead of being unconditionally redirected to the landing page.

## Key Files & Context
- `src/app/signin/page.tsx`: Contains the client-side sign-in form. Currently, the `signIn` function is called with a hardcoded `callbackUrl: '/'`.

## Implementation Steps
1. **Update `SignInPage` to read `callbackUrl` from the URL:**
   - Import `useSearchParams` from `next/navigation` and `Suspense` from `react`.
   - Create an inner component (e.g., `SignInForm`) that uses `useSearchParams()` to retrieve the `callbackUrl` from the current URL query parameters. If no `callbackUrl` is present, it will default to `/`.
   - Update the `signIn` call in `handleSubmit` to use this dynamic `callbackUrl` instead of the hardcoded `/`.
   - Wrap `SignInForm` in a `<Suspense>` boundary within `SignInPage` to comply with Next.js client component rules for `useSearchParams`.

## Verification & Testing
1. Navigate to `/admin` while logged out.
2. Confirm the app redirects to `/signin?callbackUrl=/admin`.
3. Enter your email and send the magic link.
4. Check the email and click the login link.
5. Verify that upon successful login, the app correctly redirects you to `/admin` instead of `/`.
