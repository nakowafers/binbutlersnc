/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
};

if (process.env.NODE_ENV === "development") {
  import("@cloudflare/next-on-pages/next-dev").then(({ setupDevPlatform }) => {
    setupDevPlatform();
  });
}

export default nextConfig;
