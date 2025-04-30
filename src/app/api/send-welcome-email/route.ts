// src/app/api/send-welcome-email/route.ts
import { NextResponse } from 'next/server';
import { getFunctions, httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/config"; // Import your initialized functions instance

// Helper function to build the email HTML (can be moved to a shared location)
const createWelcomeEmailHtml = (name: string): string => {
  return `
    <h1>Hi ${name},</h1>
    <p>Welcome aboard! We're thrilled to have you join the WeightWise community.</p>
    <p>Get ready to track your progress, set goals, and achieve your fitness aspirations with the help of AI insights.</p>
    <p>Log in to your dashboard to get started!</p>
    <p>Best,</p>
    <p>The WeightWise Team</p>
  `;
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, name } = body;
    const displayName = name || 'there'; // Use name or fallback

    if (!email) {
      console.warn('API /send-welcome-email: Email missing in request body.');
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    console.log(`API /send-welcome-email: Attempting to call sendGenericEmail for ${email}`);

    // --- Call the Cloud Function --- 
    try {
        const sendEmailFn = httpsCallable(functions, 'sendGenericEmail');
        const emailHtml = createWelcomeEmailHtml(displayName);
        const result = await sendEmailFn({
            to: email,
            subject: "Welcome to WeightWise!",
            html: emailHtml
        });
        console.log(`API /send-welcome-email: Cloud Function call successful for ${email}. Result:`, result.data);
        return NextResponse.json({ message: 'Welcome email sent successfully' }, { status: 200 });

    } catch (error: any) {
         console.error(`API /send-welcome-email: Error calling sendGenericEmail Cloud Function for ${email}:`, error);
         // Extract more specific error message if available
         const functionErrorMessage = error.details?.message || error.message || 'Cloud function execution failed';
         return NextResponse.json({ error: 'Failed to trigger welcome email function', details: functionErrorMessage }, { status: 500 });
    }
    // --- End Cloud Function Call ---

  } catch (error: any) {
    console.error('API Error processing /send-welcome-email request:', error);
    return NextResponse.json({ error: 'Invalid request body or internal server error' }, { status: 500 });
  }
}
