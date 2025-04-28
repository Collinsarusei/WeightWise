// src/components/PwaPrompt.tsx

'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button'; // Assuming you want to use your existing Button component

// Define the event type for beforeinstallprompt
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: Array<string>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed', platform: string }>;
  prompt(): Promise<void>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

export default function PwaPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    const handler = (e: BeforeInstallPromptEvent) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
      // Update UI notify the user they can add to home screen
      setShowButton(true);
      console.log("'beforeinstallprompt' event fired.");
    };

    // Listen for the event
    window.addEventListener('beforeinstallprompt', handler);

    // Optional: Listen for the appinstalled event to hide the button if the app is already installed
    const handleAppInstalled = () => {
      setShowButton(false);
      console.log('PWA was installed');
    };
    window.addEventListener('appinstalled', handleAppInstalled);

    // Clean up the event listeners on component unmount
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []); // Empty dependency array means this effect runs only once on mount

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      // The deferred prompt isn't available.
      return;
    }

    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);

    // We no longer need the prompt. Clear it.
    setDeferredPrompt(null);

    // Hide the button regardless of user choice
    if (outcome === 'accepted') {
      console.log('User accepted the A2HS prompt');
    } else {
      console.log('User dismissed the A2HS prompt');
    }

    setShowButton(false);
  };

  // Only render the button if the prompt is available and we decide to show the button
  if (!showButton || !deferredPrompt) {
    return null;
  }

  // Render a button to trigger the install prompt
  return (
    <div className="p-4 text-center">
      <Button onClick={handleInstallClick}>
        Add to Home Screen
      </Button>
    </div>
  );
}
