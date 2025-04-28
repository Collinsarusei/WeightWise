// src/services/email/welcomeEmail.ts

import { sendEmail } from './sendEmail';

interface WelcomeEmailProps {
  userEmail: string;
  userName?: string; // Optional: Use for personalization
}

export async function sendWelcomeEmail({ userEmail, userName }: WelcomeEmailProps): Promise<void> {
  const subject = 'Welcome to Our Fitness App!';
  const name = userName || 'there'; // Fallback if name isn't provided

  // Basic HTML template (consider using a templating engine like Handlebars or MJML for more complex emails)
  const html = `
    <h1>Hi ${name},</h1>
    <p>Welcome aboard! We're thrilled to have you join our fitness community.</p>
    <p>Get ready to track your progress, set goals, and achieve your fitness aspirations.</p>
    <p>If you have any questions, feel free to reach out.</p>
    <p>Best,</p>
    <p>The Fitness App Team</p>
  `;

  // Basic text version
  const text = `
    Hi ${name},
    Welcome aboard! We're thrilled to have you join our fitness community.
    Get ready to track your progress, set goals, and achieve your fitness aspirations.
    If you have any questions, feel free to reach out.
    Best,
    The Fitness App Team
  `;

  await sendEmail({
    to: userEmail,
    subject: subject,
    html: html,
    text: text,
  });

  console.log(`Welcome email sent to ${userEmail}`);
}
