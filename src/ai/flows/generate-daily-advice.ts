// src/ai/flows/generate-daily-advice.ts
'use server';
/**
 * @fileOverview Generates personalized daily weight management advice using AI.
 *
 * This file defines a Genkit flow that takes user data, including weight entries,
 * and provides tailored tips, encouragement, and alerts for weight management.
 *
 * @param {GenerateDailyAdviceInput} input - The input data for generating daily advice.
 * @returns {Promise<GenerateDailyAdviceOutput>} A promise that resolves to the generated daily advice.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';
import {getWeightEntries} from '@/services/external-apis/weight-tracker';

const GenerateDailyAdviceInputSchema = z.object({
  userId: z.string().describe('The ID of the user.'),
  goal: z.string().describe('The weight management goal (e.g., lose, gain, maintain).'), // Added goal
  currentWeightKg: z.number().describe('The current weight of the user in kilograms.'),
  targetWeightKg: z.number().describe('The target weight of the user in kilograms.'),
  activityLevel: z.string().describe('The activity level of the user (e.g., sedentary, moderate, active).'),
  dietaryPreference: z.string().describe('The dietary preference of the user (e.g., vegetarian, vegan, omnivore).'),
});
export type GenerateDailyAdviceInput = z.infer<typeof GenerateDailyAdviceInputSchema>;

const GenerateDailyAdviceOutputSchema = z.object({
  advice: z.string().describe('The personalized daily advice for the user.'),
  encouragement: z.string().describe('An encouraging message for the user.'),
  alert: z.string().optional().describe('An optional alert message for the user, if any.'),
});
export type GenerateDailyAdviceOutput = z.infer<typeof GenerateDailyAdviceOutputSchema>;

export async function generateDailyAdvice(input: GenerateDailyAdviceInput): Promise<GenerateDailyAdviceOutput> {
  return generateDailyAdviceFlow(input);
}

const generateDailyAdvicePrompt = ai.definePrompt({
  name: 'generateDailyAdvicePrompt',
  input: {
    schema: z.object({
      userId: z.string().describe('The ID of the user.'),
      goal: z.string().describe('The weight management goal (e.g., lose, gain, maintain).'), // Added goal
      currentWeightKg: z.number().describe('The current weight of the user in kilograms.'),
      targetWeightKg: z.number().describe('The target weight of the user in kilograms.'),
      activityLevel: z.string().describe('The activity level of the user (e.g., sedentary, moderate, active).'),
      dietaryPreference: z.string().describe('The dietary preference of the user (e.g., vegetarian, vegan, omnivore).'),
      weightEntries: z.string().describe('The weight entries for the user.'),
    }),
  },
  output: {
    schema: z.object({
      advice: z.string().describe('The personalized daily advice for the user.'),
      encouragement: z.string().describe('An encouraging message for the user.'),
      alert: z.string().optional().describe('An optional alert message for the user, if any.'),
    }),
  },
  // Removed incorrect backslashes around the template literal
  prompt: `You are WeightWise AI, a supportive weight management expert providing personalized daily guidance.

  User Context:
  - Goal: {{goal}} // Explicit Goal marker
  - Current Weight: {{currentWeightKg}} kg
  - Target Weight: {{targetWeightKg}} kg
  - Activity Level: {{activityLevel}}
  - Dietary Preference: {{dietaryPreference}}
  - Recent Weight Entries (if available): {{weightEntries}}

  Based ONLY on the provided User Context:
  1. Provide 1-2 concise, actionable pieces of advice for today specifically tailored to the user's *goal* ("{{goal}}"), *activity level*, and *dietary preference*. If the goal is 'lose', suggest a calorie deficit activity or meal idea. If 'gain', suggest a surplus activity/meal. If 'maintain', suggest balancing activity. Reference the activity level and diet preference in the suggestion.
  2. Write a short, positive encouraging message related to the "{{goal}}".
  3. Optionally, include a brief alert if the weight trend (if data exists) significantly contradicts the goal (e.g., consistent gain on a 'lose' goal).

  Format your response strictly as a JSON object with the following keys:
  - advice: (String containing the actionable advice from step 1)
  - encouragement: (String containing the positive message from step 2)
  - alert: (Optional String containing the alert from step 3, omit if not applicable)
  `,
});

const generateDailyAdviceFlow = ai.defineFlow<
  typeof GenerateDailyAdviceInputSchema,
  typeof GenerateDailyAdviceOutputSchema
>({
  name: 'generateDailyAdviceFlow',
  inputSchema: GenerateDailyAdviceInputSchema,
  outputSchema: GenerateDailyAdviceOutputSchema,
},
async input => {
  const weightEntries = await getWeightEntries(input.userId);
  const weightEntriesString = JSON.stringify(weightEntries);

  // Ensure the goal is passed to the prompt
  const promptInput = {
    userId: input.userId,
    goal: input.goal, // Pass the goal explicitly
    currentWeightKg: input.currentWeightKg,
    targetWeightKg: input.targetWeightKg,
    activityLevel: input.activityLevel,
    dietaryPreference: input.dietaryPreference,
    weightEntries: weightEntriesString,
  };

  const {output} = await generateDailyAdvicePrompt(promptInput);
  return output!;
});
