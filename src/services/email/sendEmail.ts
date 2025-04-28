// src/services/email/sendEmail.ts

import { Resend } from 'resend';

// Ensure the API key is loaded from environment variables
const resendApiKey = process.env.RESEND_API_KEY;

if (!resendApiKey) {
  console.error('RESEND_API_KEY environment variable is not set.');
  // Depending on your error handling strategy, you might throw an error
  // or disable email functionality.
  // For now, we'll log an error and potentially fail silently or with a specific error message.
  // throw new Error('Resend API Key is not configured.');
}

// Initialize Resend only if the API key is available
const resend = resendApiKey ? new Resend(resendApiKey) : null;

interface EmailOptions {
  to: string;
  subject: string;
  html: string; // HTML body of the email
  text?: string; // Plain text body of the email
}

// Use the default Resend onboarding address for development/testing
const fromEmail = 'onboarding@resend.dev';

export async function sendEmail(options: EmailOptions): Promise<void> {
  if (!resend) {
    console.error('Resend client is not initialized. Cannot send email.');
    // Handle the case where Resend couldn't be initialized (e.g., missing API key)
    // You might want to throw an error or return a specific status
    throw new Error('Email service is not configured.');
  }

  try {
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text, // Include text version if provided
    });

    if (error) {
      console.error('Error sending email via Resend:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }

    console.log(`Email sent successfully to ${options.to} via Resend. ID: ${data?.id}`);

  } catch (err: any) {
    console.error('An unexpected error occurred while sending email:', err);
    // Re-throw the error or handle it as appropriate for your application
    throw new Error(`An unexpected error occurred during email sending: ${err.message}`);
  }
}
