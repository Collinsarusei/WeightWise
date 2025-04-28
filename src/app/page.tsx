'use client';

import Link from "next/link";
import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { useAuth } from '@/components/AuthProvider';
import { Icons } from '@/components/icons';
import { sendEmailVerification } from '@/lib/firebase/authService'; // Keep sendEmailVerification
import { useToast } from '@/hooks/use-toast';
// Removed Input and Label imports
// Removed updateUserEmailAndSendVerification import

export default function WelcomePage() {
  const { loading, user } = useAuth();
  const { toast } = useToast();

  const [isResendingEmail, setIsResendingEmail] = useState(false);

  // Removed state for Email Update

  // Handler for resending verification email
  const handleResendVerification = async () => {
    if (!user) return;

    setIsResendingEmail(true);
    try {
      await sendEmailVerification(user);
      toast({
        title: "Verification Email Sent",
        description: "Please check your inbox (and spam folder) for the verification link.",
      });
    } catch (error: any) {
      console.error("Failed to resend verification email:", error);
       toast({
        title: "Failed to Send Email",
        description: `Could not resend verification email: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsResendingEmail(false);
    }
  };

  // Removed handleEmailUpdate function

  // Show a loading spinner while AuthProvider is doing its initial check
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Icons.spinner className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  // Render normal home page content once AuthProvider is done loading
  return (
    <div className="flex flex-col min-h-screen w-full bg-gradient-to-br from-green-50 via-blue-50 to-purple-50">

      {/* Main Content */}
      <div className="flex-grow w-full px-4 py-8">
        <div className="container mx-auto max-w-6xl">

          {/* --- Email Verification Message (Updated) --- */}
          {user && !user.emailVerified && (
            <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-8 rounded-md" role="alert">
              <p className="font-bold">Email Verification Required</p>
              <p className="text-sm mb-3">Please check your inbox for a verification link to unlock all features.</p>
              <p className="text-sm">Did not receive the email or entered the wrong address? Please sign up again with the correct email.</p>

              {/* Resend Button */}
              <Button
                onClick={handleResendVerification}
                disabled={isResendingEmail}
                variant="link"
                className="p-0 h-auto mt-2 text-yellow-700 hover:text-yellow-800 font-semibold"
              >
                {isResendingEmail ? (
                  <><Icons.spinner className="mr-2 h-4 w-4 animate-spin" /> Resending...</>
                ) : (
                  "Resend Verification Email"
                )}
              </Button>

              {/* Removed Email Update Form */}
            </div>
          )}
          {/* --- End Email Verification Message --- */}

          {/* Header (adjusted margin top if verification message is shown) */}
          <div className={`text-center mb-12 md:mb-16 ${user && !user.emailVerified ? 'mt-8' : ''}`}> 
            <h1 className="text-4xl md:text-5xl font-extrabold text-gray-800 mb-3">
              Welcome to <span className="text-green-600">WeightWise</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-600 max-w-2xl mx-auto">
              Your intuitive partner for tracking progress, building healthy habits, and achieving your fitness goals.
            </p>
          </div>

          {/* Grid Layout */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 items-center mb-12 md:mb-16">

            {/* Left Section */}
            <div className="flex flex-col items-center text-center md:items-start md:text-left order-2 md:order-1 transform transition duration-300 hover:scale-105 hover:-translate-y-1">
              <img
                src="/images/Fitness stats-bro.png"
                alt="Fitness stats bro illustration"
                className="w-3/4 md:w-full h-auto max-w-xs mb-4 rounded-lg shadow-md"
              />
              <h2 className="text-xl font-semibold text-gray-700 mb-2">Track Your Journey</h2>
              <p className="text-gray-600">
                Log your weight, activities, and measurements with ease. Visualize your progress and stay motivated.
              </p>
            </div>

            {/* Center CTA */}
            <div className="flex flex-col items-center order-1 md:order-2 bg-white/80 backdrop-blur-sm p-6 md:p-8 rounded-xl shadow-lg border border-gray-200 transform transition duration-300 hover:scale-105 hover:-translate-y-1">
              <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">Ready to Start?</h2>
              <p className="text-gray-700 text-center mb-6">
                Join our community and take the first step towards a healthier you.
              </p>
              {/* Show CTA buttons only if user is NOT logged in or email is verified */}
              {(!user || user.emailVerified) && (
                 <div className="w-full flex flex-col gap-3">
                    <Button asChild size="lg" className="w-full bg-green-600 hover:bg-green-700 text-white rounded-lg shadow transition transform hover:-translate-y-0.5">
                      <Link href="/signup">Create Account</Link>
                    </Button>
                    <Button asChild size="lg" variant="outline" className="w-full border-green-600 text-green-600 hover:bg-green-50 hover:text-green-700 rounded-lg shadow-sm transition transform hover:-translate-y-0.5">
                      <Link href="/login">Log In</Link>
                    </Button>
                 </div>
              )}
            </div>

            {/* Right Section */}
            <div className="flex flex-col items-center text-center md:items-start md:text-left order-3 md:order-3 transform transition duration-300 hover:scale-105 hover:-translate-y-1">
              <img
                src="/images/Fitness tracker-amico.png"
                alt="Fitness tracker illustration"
                className="w-3/4 md:w-full h-auto max-w-xs mb-4 rounded-lg shadow-md"
              />
              <h2 className="text-xl font-semibold text-gray-700 mb-2">Gain Insights</h2>
              <p className="text-gray-600">
                Understand your trends with clear charts and summaries. Make informed decisions on your fitness path.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Full-Width Footer */}
      <footer className="w-full bg-black py-4">
        <div className="text-center text-white text-sm">
          Built for your success. Powered by motivation.<br />
          &copy; {new Date().getFullYear()} WeightWise. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
