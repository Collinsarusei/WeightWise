// src/lib/firebase/authService.ts
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  updateProfile,
  onAuthStateChanged,
  AuthError,
  sendPasswordResetEmail,
  sendEmailVerification, // Import sendEmailVerification directly
  updateEmail,
  User,
} from "firebase/auth";
import { auth, db } from "./config";
import { doc, setDoc } from 'firebase/firestore';

// Define functions without 'export'
const signInWithEmail = async (email: string, password: string) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    console.log("Email/Password Sign-In successful:", user);
    return { user, error: null };
  } catch (error: any) {
    console.error("Email/Password Sign-In error:", error);
    return { user: null, error: error as AuthError };
  }
};

const resetPassword = async (email: string) => {
  if (!auth) {
      console.error("Firebase auth instance is not available.");
      return { success: false, error: { code: 'auth/internal-error', message: 'Auth service not initialized.' } as AuthError };
  }
  try {
    await sendPasswordResetEmail(auth, email);
    console.log("Password reset email sent successfully to:", email);
    return { success: true, error: null };
  } catch (error: any) {
    console.error("Error sending password reset email:", error);
    return { success: false, error: error as AuthError };
  }
};

const signInWithGoogleRedirect = async () => {
  if (!auth) return;
  const provider = new GoogleAuthProvider();
  try {
    await signInWithRedirect(auth, provider);
  } catch (error: any) {
    console.error("Google Sign-In Redirect error:", error);
    throw error;
  }
};

const handleGoogleRedirectResult = async (): Promise<{ user: User | null; error: AuthError | null }> => {
   if (!auth) {
       console.error("Firebase auth instance is not available for redirect result.");
       return { user: null, error: { code: 'auth/internal-error', message: 'Auth service not initialized.' } as AuthError };
   }
   try {
       const result = await getRedirectResult(auth);
       if (result) {
           const user = result.user;
           console.log("Google Redirect Result successful:", user);
           return { user, error: null };
       } else {
           return { user: null, error: null };
       }

   } catch (error: any) {
       console.error("Error handling Google redirect result:", error);
       return { user: null, error: error as AuthError };
   }
};

const signOut = async (): Promise<{ success: boolean; error: AuthError | null }> => {
    if (!auth) {
        console.error("Firebase auth instance is not available for sign out.");
        return { success: false, error: { code: 'auth/internal-error', message: 'Auth service not initialized.' } as AuthError };
    }
    try {
        await firebaseSignOut(auth);
        console.log("Sign out successful.");
        return { success: true, error: null };
    } catch (error: any) {
        console.error("Sign out error:", error);
        return { success: false, error: error as AuthError };
    }
};

const signUpWithEmail = async (email: string, username: string, password: string): Promise<{ user: User | null; error: AuthError | null }> => {
   if (!auth) {
       console.error("Firebase auth instance is not available for sign up.");
       return { user: null, error: { code: 'auth/internal-error', message: 'Auth service not initialized.' } as AuthError };
   }
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        console.log("Email/Password Sign-Up successful:", user);

        // Update the Firebase Auth profile and send verification email
        if (user) {
            try {
                await updateProfile(user, { displayName: username });
                 console.log("Firebase Auth profile updated with username:", username);

                 // Send verification email
                 await sendEmailVerification(user);
                 console.log("Verification email sent.");

            } catch (profileOrVerificationError: any) {
                 console.error("Failed to update profile or send verification email:", profileOrVerificationError);
            }
        }
        return { user, error: null };
    } catch (error: any) {
        console.error("Email/Password Sign-Up error:", error);
        return { user: null, error: error as AuthError };
    }
};

// --- Removed the updateUserEmailAndSendVerification function --- 

// Single export statement at the end
export {
  sendEmailVerification, // Export the imported function directly
  signInWithEmail,
  handleGoogleRedirectResult,
  signOut,
  signUpWithEmail,
  resetPassword,
  signInWithGoogleRedirect,
};
