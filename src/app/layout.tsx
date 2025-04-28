import type {Metadata, Viewport} from 'next'; // Import Viewport
import {Geist, Geist_Mono} from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/components/AuthProvider'; // <-- Import AuthProvider
import { Toaster } from "@/components/ui/toaster"; // <-- Import Toaster

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

// Define application name and description for PWA
const APP_NAME = "WeighWise";
const APP_DESCRIPTION = "Your AI-powered fitness and weight tracking companion.";

export const metadata: Metadata = {
  title: 'WeightWise', // Updated title
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: APP_NAME,
    // startupImage: [], // Optionally add startup images for iOS
  },
  formatDetection: {
    telephone: false,
  },
  manifest: "/manifest.json", // Link to manifest
};

// Define viewport settings, including theme color
export const viewport: Viewport = {
  themeColor: '#4DB6AC', // Theme color from blueprint
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AuthProvider> {/* <-- Wrap children with AuthProvider */}
          {children}
          <Toaster /> {/* <-- Make sure Toaster is inside AuthProvider or accessible */}
        </AuthProvider>
      </body>
    </html>
  );
}
