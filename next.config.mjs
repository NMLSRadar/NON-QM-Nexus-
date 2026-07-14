/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The deterministic domain layer is framework-agnostic and lives under src/domain.
  // Keep server-only secrets out of the client bundle by never importing them into
  // "use client" components.
};

export default nextConfig;
