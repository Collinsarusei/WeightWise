// src/app/api/send-welcome-email/route.ts
import { NextResponse } from 'next/server';
import { sendWelcomeEmail } from '@/services/email/welcomeEmail'; // Adjust path if needed

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, name } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Call the function to send the welcome email
    await sendWelcomeEmail({ userEmail: email, userName: name });

    return NextResponse.json({ message: 'Welcome email sent successfully' }, { status: 200 });

  } catch (error: any) {
    console.error('API Error sending welcome email:', error);
    // Return a generic error message to the client for security
    return NextResponse.json({ error: 'Failed to send welcome email', details: error.message || 'Unknown error' }, { status: 500 });
  }
}
