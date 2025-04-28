// src/services/email/weeklyReportEmail.ts

import { sendEmail } from './sendEmail';

// Define the structure for the data needed in the weekly report
interface WeeklyReportData {
  totalCaloriesBurned: number;
  totalWorkouts: number;
  // Add other relevant stats: distance, duration, achievements, etc.
}

interface WeeklyReportEmailProps {
  userEmail: string;
  userName?: string;
  reportData: WeeklyReportData;
}

export async function sendWeeklyReportEmail({ userEmail, userName, reportData }: WeeklyReportEmailProps): Promise<void> {
  const subject = 'Your Weekly Fitness Summary';
  const name = userName || 'Fitness Enthusiast';

  // Basic HTML template
  const html = `
    <h1>Hi ${name},</h1>
    <p>Here's your fitness summary for the past week:</p>
    <ul>
      <li>Total Workouts: ${reportData.totalWorkouts}</li>
      <li>Total Calories Burned: ${reportData.totalCaloriesBurned} kcal</li>
      {/* Add more list items for other stats */}
    </ul>
    <p>Keep up the great work!</p>
    <p>Best,</p>
    <p>The Fitness App Team</p>
  `;

  // Basic text version
  const text = `
    Hi ${name},
    Here's your fitness summary for the past week:
    - Total Workouts: ${reportData.totalWorkouts}
    - Total Calories Burned: ${reportData.totalCaloriesBurned} kcal
    {/* Add more stats here */}
    Keep up the great work!
    Best,
    The Fitness App Team
  `;

  await sendEmail({
    to: userEmail,
    subject: subject,
    html: html,
    text: text,
  });

  console.log(`Weekly report email sent to ${userEmail}`);
}
