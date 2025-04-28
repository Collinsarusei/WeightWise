// src/context/AuthContext.tsx (or your file path)

'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, DocumentData } from 'firebase/firestore'; // Use onSnapshot for real-time updates
import { auth, db } from '@/lib/firebase/config';
import { useRouter, usePathname } from 'next/navigation';
import { Icons } from '../components/icons'; // Adjusted path based on common structure

interface AuthContextType {
  user: User | null;
  loading: boolean; // Covers initial auth check AND initial profile check
  isTransitioning: boolean; // Primarily for signaling redirects after initial load
  isOnboardingComplete: boolean | null;
  isPro: boolean; // Premium status derived from Firestore
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true); // Initial loading state
  const [isTransitioning, setIsTransitioning] = useState(false); // Transition state, mainly for redirects
  const [isOnboardingComplete, setIsOnboardingComplete] = useState<boolean | null>(null);
  const [isPro, setIsPro] = useState<boolean>(false); // Initialize isPro state
  const router = useRouter();
  const pathname = usePathname();

  // Effect 1: Handles Firebase Auth state changes
  useEffect(() => {
    console.log("AuthProvider useEffect 1: Setting up onAuthStateChanged listener.");
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      console.log("AuthProvider useEffect 1: onAuthStateChanged event fired. User:", currentUser?.uid || 'null');
      setUser(currentUser);
      setIsOnboardingComplete(null); // Reset onboarding status on user change
      setIsPro(false); // Reset pro status on user change
      if (!currentUser) {
        setLoading(false);
        setIsTransitioning(false);
         console.log("AuthProvider useEffect 1: No user found. setLoading(false), setIsTransitioning(false).");
      }
       console.log("AuthProvider useEffect 1: onAuthStateChanged handler finished.");
    });

    return () => {
       console.log("AuthProvider useEffect 1: Cleaning up auth state listener.");
       unsubscribe();
    };
  }, []); // Run only once on mount

  // Effect 2: Sets up real-time listener for Firestore user document
  useEffect(() => {
    let unsubscribeSnapshot: () => void | undefined;
    console.log("AuthProvider useEffect 2: User dependency changed.", { userId: user?.uid });

    if (user) {
       console.log("AuthProvider useEffect 2: User found, setting up Firestore listener.");
       setLoading(true);
       setIsTransitioning(true);

       const userDocRef = doc(db, 'users', user.uid);
       unsubscribeSnapshot = onSnapshot(userDocRef,
         (docSnap) => { // Success callback
           console.log("AuthProvider useEffect 2: onSnapshot event received.", { exists: docSnap.exists() });
           if (docSnap.exists()) {
             const data = docSnap.data() as DocumentData;
             const onboardingStatus = !!data.onboardingComplete;
             // --- Check for premium status using 'plan' and 'planStatus' --- 
             const premiumStatus = data.plan === 'premium' && data.planStatus === 'active';
             console.log("AuthProvider useEffect 2: User doc exists.", { onboardingComplete: onboardingStatus, isPro: premiumStatus });
             setIsOnboardingComplete(onboardingStatus);
             setIsPro(premiumStatus); // <-- UPDATE isPro state based on plan/status
           } else {
             console.warn("AuthProvider useEffect 2: User document does not exist. Assuming onboarding incomplete and not pro.");
             setIsOnboardingComplete(false);
             setIsPro(false); // <-- Default isPro to false
           }
           setLoading(false);
           setIsTransitioning(false);
           console.log("AuthProvider useEffect 2: Snapshot processed. setLoading(false), setIsTransitioning(false).");
         },
         (error) => { // Error callback
           console.error("AuthProvider useEffect 2: Error in onSnapshot listener:", error);
           setIsOnboardingComplete(false); // Assume incomplete on error
           setIsPro(false); // Assume not pro on error
           setLoading(false); // Loading failed, stop loading
           setIsTransitioning(false); // Transition failed, stop transitioning
           console.log("AuthProvider useEffect 2: Snapshot error. setLoading(false), setIsTransitioning(false).");
         }
       );
    } else {
       setIsOnboardingComplete(null); // Reset onboarding state if user logs out
       setIsPro(false); // Reset pro status if user logs out
       if (loading) setLoading(false); // Ensure loading stops
       if (isTransitioning) setIsTransitioning(false); // Ensure transition stops
       console.log("AuthProvider useEffect 2: No user, ensuring loading/transitioning/pro are false.");
    }

    // Cleanup listener on component unmount or user change
    return () => {
      console.log("AuthProvider useEffect 2: Cleaning up onSnapshot listener.");
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
      }
    };
  }, [user]); // This effect depends only on the user object

  // Effect 3: Handles redirects based on the final state
  useEffect(() => {
     console.log("AuthProvider useEffect 3 (Redirect): Running.", { user: !!user, loading, isOnboardingComplete, isPro, pathname, isTransitioning });

    if (loading) {
      console.log("AuthProvider useEffect 3 (Redirect): Waiting for initial loading to finish.");
      return; // Exit early if still loading
    }
    if (isOnboardingComplete === null && user) {
        console.log("AuthProvider useEffect 3 (Redirect): Waiting for onboarding status for logged-in user.");
        return; // Exit if logged in but onboarding status not yet determined
    }

    console.log("AuthProvider useEffect 3 (Redirect): Proceeding with redirect logic.", { user: !!user, onboardingComplete: isOnboardingComplete, isPro, pathname });

    const isAuthPage = pathname === '/login' || pathname === '/signup';
    const isOnboardingPage = pathname === '/onboarding';
    const isProtectedRoute = !['/', '/login', '/signup'].includes(pathname);
    const isUpgradePage = pathname === '/upgrade'; // Prevent redirect loop from upgrade page

    let redirectPath: string | null = null;

    if (!user) {
      // No user logged in
      if (isProtectedRoute) {
        console.log("AuthProvider useEffect 3 (Redirect): No user, on protected route -> /login");
        redirectPath = '/login';
      }
    } else { // User is logged in
      if (!user.emailVerified) {
        // Allow user to stay on root/landing page if email not verified
        if (isProtectedRoute || isAuthPage) {
          console.log("AuthProvider useEffect 3 (Redirect): User logged in, email not verified, on protected/auth route -> /");
          redirectPath = '/'; // Redirect to a safe public page (e.g., homepage)
        }
      } else { // User logged in AND email verified
        if (isOnboardingComplete === false) {
          if (!isOnboardingPage) {
            console.log("AuthProvider useEffect 3 (Redirect): User logged in, verified, onboarding incomplete -> /onboarding");
            redirectPath = '/onboarding';
          }
        } else if (isOnboardingComplete === true) {
          // If onboarding is complete, and user is on an auth page or onboarding page, redirect to dashboard
          if (isAuthPage || isOnboardingPage) {
            console.log("AuthProvider useEffect 3 (Redirect): User logged in, verified, onboarding complete, on auth/onboarding page -> /dashboard");
            redirectPath = '/dashboard';
          }
           // If onboarding is complete AND user is NOT pro, but is trying to access a pro feature page (you might add more later)
          // this example doesn't prevent access to /dashboard itself, but you could add checks here.
          // If onboarding is complete and user IS pro, and they land on /upgrade, redirect to dashboard
          if (isPro && isUpgradePage) {
            console.log("AuthProvider useEffect 3 (Redirect): User is Pro and landed on /upgrade -> /dashboard");
            redirectPath = '/dashboard';
          }
        }
      }
    }

    // Perform redirect if necessary
    if (redirectPath && redirectPath !== pathname) {
      console.log(`AuthProvider useEffect 3 (Redirect): Initiating router.replace(${redirectPath})`);
      router.replace(redirectPath);
    } else {
       console.log("AuthProvider useEffect 3 (Redirect): No redirect needed or already on target path.");
    }
     console.log("AuthProvider useEffect 3 (Redirect): Effect finished.");

  }, [user, loading, isOnboardingComplete, isPro, pathname, router]); // Added isPro as dependency

  console.log("AuthProvider: Rendering children.");
  return (
    <AuthContext.Provider value={{ user, loading, isTransitioning, isOnboardingComplete, isPro }}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to use the auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
