import type { NextConfig } from 'next';
// @ts-ignore // Ignore implicit any type error for next-pwa if @types/next-pwa is not installed or problematic
import withPWAInit from 'next-pwa';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

const withPWA = withPWAInit({
  dest: 'public',
  // disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  // other PWA options if needed
});

export default withPWA(nextConfig);
