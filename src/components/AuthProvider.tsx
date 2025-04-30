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
             const premiumStatus = data.plan === 'premium' && data.planStatus === 'active';
             console.log("AuthProvider useEffect 2: User doc exists.", { onboardingComplete: onboardingStatus, isPro: premiumStatus });
             setIsOnboardingComplete(onboardingStatus);
             setIsPro(premiumStatus);
           } else {
             console.warn("AuthProvider useEffect 2: User document does not exist. Assuming onboarding incomplete and not pro.");
             setIsOnboardingComplete(false);
             setIsPro(false);
           }
           setLoading(false);
           setIsTransitioning(false);
           console.log("AuthProvider useEffect 2: Snapshot processed. setLoading(false), setIsTransitioning(false).");
         },
         (error) => { // Error callback
           console.error("AuthProvider useEffect 2: Error in onSnapshot listener:", error);
           setIsOnboardingComplete(false);
           setIsPro(false);
           setLoading(false);
           setIsTransitioning(false);
           console.log("AuthProvider useEffect 2: Snapshot error. setLoading(false), setIsTransitioning(false).");
         }
       );
    } else {
       setIsOnboardingComplete(null);
       setIsPro(false);
       if (loading) setLoading(false);
       if (isTransitioning) setIsTransitioning(false);
       console.log("AuthProvider useEffect 2: No user, ensuring loading/transitioning/pro are false.");
    }

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
      return; 
    }
    if (isOnboardingComplete === null && user) {
        console.log("AuthProvider useEffect 3 (Redirect): Waiting for onboarding status for logged-in user.");
        return; 
    }

    console.log("AuthProvider useEffect 3 (Redirect): Proceeding with redirect logic.", { user: !!user, onboardingComplete: isOnboardingComplete, isPro, pathname });

    const isAuthPage = pathname === '/login' || pathname === '/signup';
    const isOnboardingPage = pathname === '/onboarding';
    const isHomePage = pathname === '/'; // Check if current path is the homepage
    const isProtectedRoute = !['/', '/login', '/signup', '/onboarding'].includes(pathname); // Add onboarding to non-protected routes for this logic
    const isUpgradePage = pathname === '/upgrade';
    const isChatHistoryPage = pathname === '/chat-history'; // Added chat history page

    let redirectPath: string | null = null;

    if (!user) {
      // No user logged in: Redirect from protected routes (or upgrade/history) to /login
      if (isProtectedRoute || isUpgradePage || isChatHistoryPage) { 
        console.log("AuthProvider useEffect 3 (Redirect): No user, on protected/upgrade/history route -> /login");
        redirectPath = '/login';
      }
    } else { // User is logged in
      if (!user.emailVerified) {
         // Email not verified: Redirect from anywhere except homepage to homepage
        if (!isHomePage) {
          console.log("AuthProvider useEffect 3 (Redirect): User logged in, email not verified, NOT on homepage -> /");
          redirectPath = '/'; 
        }
      } else { // User logged in AND email verified
        if (isOnboardingComplete === false) {
          // Onboarding incomplete: Redirect from anywhere except /onboarding to /onboarding
          if (!isOnboardingPage) {
            console.log("AuthProvider useEffect 3 (Redirect): User logged in, verified, onboarding incomplete -> /onboarding");
            redirectPath = '/onboarding';
          }
        } else if (isOnboardingComplete === true) {
          // Onboarding complete:
          // Redirect from auth pages to /dashboard
          if (isAuthPage) { 
            console.log("AuthProvider useEffect 3 (Redirect): User logged in, verified, onboarding complete, on auth page -> /dashboard");
            redirectPath = '/dashboard';
          }
          // *** NEW: Redirect from homepage to /dashboard ***
          if (isHomePage) {
              console.log("AuthProvider useEffect 3 (Redirect): User logged in, verified, onboarding complete, on homepage -> /dashboard");
              redirectPath = '/dashboard';
          }
          // Redirect Pro users from /upgrade to /dashboard
          if (isPro && isUpgradePage) {
            console.log("AuthProvider useEffect 3 (Redirect): User is Pro and landed on /upgrade -> /dashboard");
            redirectPath = '/dashboard';
          }
          // Note: We explicitly ALLOW users to stay on /onboarding if they navigate there manually now
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
