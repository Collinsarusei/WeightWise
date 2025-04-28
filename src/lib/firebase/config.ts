// src/lib/firebase/config.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions"; // <-- Import getFunctions

// IMPORTANT: Replace with your actual Firebase configuration
// Consider using environment variables for sensitive keys
const firebaseConfig = {
  apiKey: "AIzaSyDU2oz52LMdf1dnRWLZD4TEuO-3lUP_Quc",
  authDomain: "weightwise-6d4bb.firebaseapp.com",
  projectId: "weightwise-6d4bb",
  storageBucket: "weightwise-6d4bb.firebasestorage.app",
  messagingSenderId: "759496352563",
  appId: "1:759496352563:web:72a6639c5a3975b5b4d446",
  measurementId: "G-V8ZQ5XQEBD"
};
// Initialize Firebase
let app;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app); // <-- Initialize Functions

export {
    app, auth,
    // IMPORTANT: Replace with your actual Firebase configuration
    // Consider using environment variables for sensitive keys
    db,
    functions, // <-- Export Functions
};
