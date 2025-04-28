'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithGoogleRedirect,
  handleGoogleRedirectResult,
  signUpWithEmail
} from '@/lib/firebase/authService';
import { Button } from '@/components/ui/button';
import {
  Card, CardHeader, CardTitle, CardDescription,
  CardContent, CardFooter
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Icons } from "@/components/icons";
import { useToast } from '@/hooks/use-toast';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/components/AuthProvider'; // Import useAuth hook

// Helper function to trigger the welcome email API
const triggerWelcomeEmail = async (email: string, name?: string) => {
  try {
    const response = await fetch('/api/send-welcome-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, name: name || '' }), // Send email and name
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Failed to send welcome email:', errorData);
    } else {
      console.log('Welcome email request sent successfully.');
    }
  } catch (error) {
    console.error('Error calling send-welcome-email API:', error);
  }
};

export default function SignUpPage() {
  const router = useRouter();
  // Get loading and isTransitioning states from AuthProvider
  const { loading: authLoading, isTransitioning } = useAuth();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  // Keep local isLoading for form submission feedback on buttons, separate from global auth loading
  const [isLoading, setIsLoading] = useState(false);
  // isCheckingAuth is potentially redundant now with authLoading/isTransitioning,
  // but keeping for now if there's specific Google redirect logic needed.
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Determine if a global loading state should be shown instead of the form
  // This covers initial auth loading AND transitions initiated by AuthProvider after actions (like signup).
  const showOverallLoading = authLoading || isTransitioning; // Use authLoading here

  // Check Google redirect result
  useEffect(() => {
    // Only check redirect result if AuthProvider is not already handling a transition
    // and local initial check hasn't completed.
    // Re-evaluate condition based on new loading states
    if (!showOverallLoading && isCheckingAuth) { // Use showOverallLoading
        const checkAuth = async () => {
          setError(null);
          try {
            const { user, error: authError } = await handleGoogleRedirectResult();
            if (authError) {
              let friendlyMessage = "An unknown sign-in error occurred.";
              if (authError.code === 'auth/unauthorized-domain') {
                friendlyMessage = "Domain not authorized. Contact support.";
              } else if (authError.code === 'auth/cancelled-popup-request') {
                friendlyMessage = "Sign-up process cancelled.";
              } else if (authError.message) {
                friendlyMessage = authError.message;
              }
              setError(friendlyMessage);
              toast({ title: "Sign Up Failed", description: friendlyMessage, variant: "destructive" });
            } else if (user) {
              // --- Google Sign-Up Success: Create Firestore Doc ---
              const userData = {
                  email: user.email,
                  username: user.displayName || 'User', // Use display name or default
                  onboardingComplete: false, // <-- *** Explicitly set onboarding to false ***
                  plan: 'free',             // <-- Initialize plan
                  planStatus: 'active',       // <-- Initialize plan status
                  // Initialize other fields if necessary
              };
              try {
                  // Use merge: true to avoid overwriting potential existing data (though less likely for signup)
                  await setDoc(doc(db, "users", user.uid), userData, { merge: true });
                  console.log("User document created/updated in Firestore for Google Sign-In.");

                  // Trigger welcome email ONLY AFTER Firestore write succeeds
                  if (user.email) {
                      triggerWelcomeEmail(user.email, user.displayName || undefined);
                  }

                  // Toast can remain, redirect is handled by AuthProvider
                  toast({ title: "Sign Up Successful", description: `Welcome, ${user.displayName || 'User'}!` });

              } catch (dbError) {
                  console.error("Failed to save user data to Firestore after Google Sign-In:", dbError);
                  setError("Sign up successful, but failed to save initial profile data.");
                  toast({ title: "Sign Up Error", description: "Could not save profile data.", variant: "destructive" });
                  // Optionally sign the user out here if saving profile is critical
                  // await signOut(); // Requires importing signOut from authService
              }
              // --- End Firestore Doc Creation ---
            }
          } catch (e: any) {
            console.error("Unexpected error checking redirect result:", e);
            setError("An unexpected error occurred during sign up.");
            toast({ title: "Error", description: "An unexpected error occurred. Please try again.", variant: "destructive" });
          } finally {
            setIsCheckingAuth(false); // Local check complete
          }
        };
       checkAuth();
    }
     // Update local isCheckingAuth based on overall loading state after initial check
     if (authLoading === false && isTransitioning === false) {
         setIsCheckingAuth(false);
     }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, toast, showOverallLoading]); // Added showOverallLoading to dependencies

  const handleGoogleSignInRedirect = async () => {
    setIsLoading(true); // Set local loading for button feedback
    setError(null);
    try {
      await signInWithGoogleRedirect();
      // Redirect will happen upon returning to the page, handled by useEffect in AuthProvider
    } catch (error: any) {
      console.error("Google Sign-In Redirect initiation error:", error);
      setError("Could not start Google Sign-In. Please try again.");
      toast({ title: "Sign Up Error", description: "Could not start Google Sign-In.", variant: "destructive" });
      setIsLoading(false); // Reset local loading on error
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      toast({ title: "Sign Up Error", description: "Passwords do not match.", variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      setError("Password should be at least 6 characters long.");
      toast({ title: "Sign Up Error", description: "Password should be at least 6 characters long.", variant: "destructive" });
      return;
    }
    if (!username.trim()) {
      setError("Username is required.");
      toast({ title: "Sign Up Error", description: "Username is required.", variant: "destructive" });
      return;
    }

    setIsLoading(true); // Set local loading for button feedback

    const { user, error: authError } = await signUpWithEmail(email, username, password);

    if (user) {
      try {
        await setDoc(doc(db, 'users', user.uid), {
          email,
          username,
          // Initialize onboardingComplete to false during signup
          onboardingComplete: false,
          plan: 'free', // Initialize plan for email signup too
          planStatus: 'active',
        });

        // Optional: Trigger welcome email
        if (user.email) {
           triggerWelcomeEmail(email, username);
        }

        toast({ // <-- MODIFIED TOAST
          title: "Account Created",
          description: "Please check your email inbox for a verification link.",
          variant: "default",
          duration: 7000,
        });

        // Redirect will be handled by AuthProvider's useEffect

      } catch (dbError: any) {
        console.error("Error saving user data:", dbError);
        setError("Account created, but failed to save user details.");
        toast({ title: "Sign Up Partial Success", description: "Account created, but failed save details. Please try logging in or contact support.", variant: "destructive" });
      } finally {
         setIsLoading(false); // Ensure local loading stops
      }

    } else if (authError) {
      let friendlyMessage = "Sign up failed.";
      if (authError.code === 'auth/email-already-in-use') {
        friendlyMessage = "An account with this email already exists. Please try logging in.";
      } else if (authError.code === 'auth/invalid-email') {
        friendlyMessage = "Please enter a valid email address format.";
      } else {
        console.error("Sign up error:", authError);
        friendlyMessage = authError.message || "An unknown error occurred.";
      }
      setError(friendlyMessage);
      toast({
        title: "Sign Up Failed",
        description: friendlyMessage,
        variant: "destructive",
      });
       setIsLoading(false);
    }
  };


  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-purple-50 p-4">
      <Card className="w-full max-w-md shadow-lg rounded-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-gray-800">Create Account</CardTitle>
          <CardDescription className="text-md text-gray-600 pt-1">Start your health journey today.</CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          {/* Show overall loading if AuthProvider is loading initially or transitioning */}
          {showOverallLoading && (
            <div className="flex justify-center items-center p-4 text-sm text-gray-600">
              <Icons.spinner className="mr-2 h-5 w-5 animate-spin text-primary" />
              <span>Loading or Redirecting...</span> {/* More general message */}
            </div>
          )}
          {/* Show form only when not in an overall loading state */}
          {!showOverallLoading && (
            <form onSubmit={handleEmailSignUp} className="space-y-4">
              {error && (
                <div className="text-red-600 text-sm text-center p-2 bg-red-100 rounded-md">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="yourusername"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  disabled={isLoading || showOverallLoading} // Disable during overall loading
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading || showOverallLoading} // Disable during overall loading
                />
                {/* New Note for Email */}
                <p className="text-xs text-gray-500 mt-1 px-1">Please ensure this is correct. Email cannot be changed later.</p>
              </div>
              <div className="space-y-2 relative">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  disabled={isLoading || showOverallLoading} // Disable during overall loading
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-[28px] h-7 px-2"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isLoading || showOverallLoading} // Disable during overall loading
                >
                  {showPassword ? <Icons.eyeOff className="h-4 w-4" /> : <Icons.eye className="h-4 w-4" />}
                </Button>
              </div>
              <div className="space-y-2 relative">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  disabled={isLoading || showOverallLoading} // Disable during overall loading
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-[28px] h-7 px-2"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  disabled={isLoading || showOverallLoading} // Disable during overall loading
                >
                  {showConfirmPassword ? <Icons.eyeOff className="h-4 w-4" /> : <Icons.eye className="h-4 w-4" />}
                </Button>
              </div>
              <Button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white rounded-lg" disabled={isLoading || showOverallLoading}>
                {/* Show spinner only for local loading state when not overall loading */}
                {isLoading && !showOverallLoading ? <Icons.spinner className="mr-2 h-4 w-4 animate-spin" /> : null}
                Sign Up with Email
              </Button>
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-muted-foreground">Or continue with</span>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-lg"
                onClick={handleGoogleSignInRedirect}
                disabled={isLoading || showOverallLoading} // Disable during overall loading
              >
                {/* Show spinner if local loading is active and not overall loading */}
                {isLoading && !showOverallLoading ? (
                  <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Icons.mail className="mr-2 h-4 w-4" /> // Correct Google icon
                )}
                Continue with Google
              </Button>
            </form>
          )}
        </CardContent>
        <CardFooter className="flex justify-center text-sm">
          <p>Already have an account? <a href="/login" className="text-green-600 hover:underline">Log In</a></p>
        </CardFooter>
      </Card>
    </div>
  );
}
