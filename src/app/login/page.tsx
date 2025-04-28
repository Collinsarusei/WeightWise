// src/app/login/page.tsx

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithGoogleRedirect,
  handleGoogleRedirectResult,
  signInWithEmail,
  resetPassword // Import resetPassword
} from '@/lib/firebase/authService'; // Ensure resetPassword is exported
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Icons } from "@/components/icons"; // Ensure you have google icon here
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link'; // Import Link
import { useAuth } from '@/components/AuthProvider'; // Import useAuth hook

export default function LoginPage() {
  const router = useRouter();
  // Get loading and isTransitioning states from AuthProvider
  const { loading: authLoading, isTransitioning } = useAuth(); 

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // Keep local isLoading for form submission feedback on buttons, separate from overall page loading
  const [isLoading, setIsLoading] = useState(false); 
  const [isResettingPassword, setIsResettingPassword] = useState(false); // Specific loading for reset
  const [error, setError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null); // Message after reset attempt
  const { toast } = useToast();

  // Determine if an overall loading state should be shown instead of the form
  // This covers initial auth loading AND transitions initiated by AuthProvider (like redirects after login/signup).
  const showOverallLoading = authLoading || isTransitioning;


  // Effect for checking Google redirect result
  // This effect should run only once on mount.
  useEffect(() => {
    // Only attempt to handle redirect result if AuthProvider is not currently loading or transitioning.
    // This prevents processing the result while a redirect away is already being handled by AuthProvider.
    if (!showOverallLoading) { 
        const checkAuth = async () => {
          setError(null);
          try {
            const { user, error: authError } = await handleGoogleRedirectResult();
            if (authError) {
              let friendlyMessage = "An unknown sign-in error occurred.";
              if (authError.code === 'auth/unauthorized-domain') {
                 friendlyMessage = "Domain not authorized. Contact support.";
              } else if (authError.code === 'auth/cancelled-popup-request') {
                 friendlyMessage = "Sign-in process cancelled.";
              } else if (authError.message) {
                friendlyMessage = authError.message;
              }
              setError(friendlyMessage);
              toast({ title: "Login Failed", description: friendlyMessage, variant: "destructive" });
            } else if (user) {
              toast({ title: "Login Successful", description: `Welcome back, ${user.displayName || 'User'}!` });
              // Redirect will be handled by AuthProvider's useEffect after it detects the logged-in user.
            }
          } catch (e: any) {
            console.error("Unexpected error checking redirect result:", e);
            setError("An unexpected error occurred during login.");
            toast({ title: "Error", description: "An unexpected error occurred.", variant: "destructive" });
          }
        };
        checkAuth();
    }
  }, [router, toast, showOverallLoading]); // Added showOverallLoading to dependencies

  // Handler for Google Sign-In Redirect
  const handleGoogleSignInRedirect = async () => {
    setIsLoading(true); // Set local loading for button feedback
    setError(null);
    setResetMessage(null); // Clear messages
    try {
      await signInWithGoogleRedirect();
      // Redirect will happen upon returning to the page, handled by AuthProvider's useEffect
    } catch (error: any) {
      console.error("Google Sign-In Redirect initiation error:", error);
      setError("Could not start Google Sign-In. Please try again.");
      toast({ title: "Login Error", description: "Could not start Google Sign-In.", variant: "destructive" });
      setIsLoading(false); // Reset local loading on error
    }
  };

  // Handler for Email/Password Login
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResetMessage(null); // Clear messages
    setIsLoading(true); // Set local loading for button feedback

    const { user, error: authError } = await signInWithEmail(email, password);
    setIsLoading(false); // Reset local loading after attempt

    if (user) {
      toast({
        title: "Login Successful",
        description: "Redirecting...", // Shorten message as AuthProvider handles delay
      });
      // Redirect will be handled by AuthProvider's useEffect after it detects the logged-in user.
    } else if (authError) {
       let friendlyMessage = "Login failed. Please check your credentials.";
       // Provide more specific feedback based on error codes
       if (authError.code === 'auth/invalid-credential' || authError.code === 'auth/wrong-password' || authError.code === 'auth/user-not-found') {
           friendlyMessage = "Invalid email or password. Please try again or reset your password.";
       } else if (authError.code === 'auth/invalid-email') {
           friendlyMessage = "Please enter a valid email address format.";
       } else if (authError.code === 'auth/too-many-requests') {
            friendlyMessage = "Access temporarily disabled due to too many failed login attempts. Please reset your password or try again later.";
       } else {
            console.error("Login error:", authError); // Log unexpected errors
            friendlyMessage = authError.message || "An unknown login error occurred.";
       }
      setError(friendlyMessage);
      toast({
        title: "Login Failed",
        description: friendlyMessage,
        variant: "destructive",
      });
    }
  };

  // Handler for Password Reset
  const handlePasswordReset = async () => {
    setError(null); // Clear login errors
    setResetMessage(null); // Clear previous reset messages
    if (!email) {
        setError("Please enter your email address first to reset the password.");
        toast({
            title: "Enter Email",
            description: "Please enter your email address first to reset the password.",
         });
        return;
    }

    setIsResettingPassword(true); // Set local loading for button feedback
    const { success, error: resetError } = await resetPassword(email);
    setIsResettingPassword(false); // Reset local loading after attempt

    if (success) {
        setResetMessage("Password reset email sent! Please check your inbox (and spam folder).");
        toast({ title: "Password Reset Email Sent", description: "Check your email to reset your password.", });
    } else if (resetError) {
        let friendlyMessage = "Failed to send password reset email.";
        if (resetError.code === 'auth/invalid-email') {
            friendlyMessage = "Please enter a valid email address.";
        } else if (resetError.code === 'auth/user-not-found') {
            // Don't reveal if user exists for security, still show success message
            friendlyMessage = "Password reset email sent! Please check your inbox (and spam folder).";
             setResetMessage(friendlyMessage);
             toast({ title: "Password Reset Email Sent", description: "Check your email to reset your password.", });
             return; // Exit to prevent showing error below
        } else {
             console.error("Password reset error:", resetError);
             friendlyMessage = resetError.message || "An unknown error occurred.";
        }
        setError(friendlyMessage);
        toast({ title: "Password Reset Failed", description: friendlyMessage, variant: "destructive", });
    }
  };


  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-purple-50 p-4">
      <Card className="w-full max-w-md shadow-lg rounded-xl border border-gray-200">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-gray-800">Log In</CardTitle>
          <CardDescription className="text-md text-gray-600 pt-1">Access your health journey.</CardDescription>
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
            <form onSubmit={handleEmailLogin} className="space-y-4">
              {/* Display Login Errors */}
              {error && (
                <div className="text-red-600 text-sm text-center p-2 bg-red-100 rounded-md border border-red-200">
                  {error}
                </div>
              )}
              {/* Display Password Reset Success/Info Message */}
               {resetMessage && (
                <div className="text-blue-700 text-sm text-center p-2 bg-blue-100 rounded-md border border-blue-200">
                  {resetMessage}
                </div>
              )}

              {/* Email Input */}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading || isResettingPassword || showOverallLoading} // Disable during overall loading
                />
              </div>
              {/* Password Input */}
              <div className="space-y-1"> {/* Reduced space */}
                <div className="flex justify-between items-center">
                    <Label htmlFor="password">Password</Label>
                    {/* Forgot Password Link/Button */}
                    <Button
                        type="button"
                        variant="link"
                        className="text-xs text-green-600 hover:underline p-0 h-auto font-medium"
                        onClick={handlePasswordReset}
                        disabled={isLoading || isResettingPassword || showOverallLoading} // Disable during overall loading
                    >
                         {isResettingPassword ? "Sending..." : "Forgot Password?"}
                    </Button>
                </div>
                <div className="relative"> {/* Wrapper for input and icon */}
                    <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading || isResettingPassword || showOverallLoading} // Disable during overall loading
                    className="pr-10" // Space for the icon
                    />
                    <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2 text-gray-500 hover:text-gray-700" // Centered icon
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isLoading || isResettingPassword || showOverallLoading} // Disable during overall loading
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                    {showPassword ? <Icons.eyeOff className="h-4 w-4" /> : <Icons.eye className="h-4 w-4" />}
                    </Button>
                </div>
              </div>
              {/* Login Button */}
              <Button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white rounded-lg mt-2" disabled={isLoading || isResettingPassword || showOverallLoading}>
                 {/* Show spinner only for local loading state */}
                 {isLoading && !showOverallLoading ? <Icons.spinner className="mr-2 h-4 w-4 animate-spin" /> : null}
                Log In with Email
              </Button>
              {/* Separator */}
              <div className="relative pt-4 pb-2"> {/* Adjusted spacing */}
                 <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-gray-200" /></div>
                 <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-gray-500">Or</span> {/* Simplified text */}
                </div>
              </div>
              {/* Google Button */}
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-lg border-gray-300 hover:bg-gray-50"
                onClick={handleGoogleSignInRedirect}
                disabled={isLoading || isResettingPassword || showOverallLoading} // Disable during overall loading
              >
                 {/* Show spinner if local loading is active and not overall loading */}
                 {isLoading && !showOverallLoading ? (
                  <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                 ) : (
                  <Icons.mail className="mr-2 h-4 w-4" /> // Use Google icon (assuming mail icon is used for Google)
                 )}
                Continue with Google
              </Button>
            </form>
          )}
        </CardContent>
         <CardFooter className="flex justify-center text-sm pt-4 pb-6"> {/* Adjusted padding */}
          <p className="text-gray-600">Don't have an account? <Link href="/signup" className="text-green-600 hover:underline font-medium">Sign Up</Link></p>
        </CardFooter>
      </Card>
    </div>
  );
}