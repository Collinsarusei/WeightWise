// src/components/Footer.tsx
import React from 'react';

export function Footer() {
  return (
    <footer className="w-full bg-black py-4 mt-auto"> {/* Added mt-auto to help push it down */}
      <div className="text-center text-white text-sm">
        Built for your success. Powered by motivation.<br />
        &copy; {new Date().getFullYear()} WeightWise. All rights reserved.
      </div>
    </footer>
  );
}
