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
  prompt: `You are a weight management expert providing personalized daily advice to users.

  Consider the user's current weight, target weight, activity level, dietary preference, and historical weight data to generate the advice.

  Current Weight: {{currentWeightKg}} kg
  Target Weight: {{targetWeightKg}} kg
  Activity Level: {{activityLevel}}
  Dietary Preference: {{dietaryPreference}}
  Weight Entries: {{weightEntries}}

  Provide personalized advice, encouragement, and an optional alert based on the user's data.

  Format your response as a JSON object with the following keys:
  - advice: The personalized daily advice for the user.
  - encouragement: An encouraging message for the user.
  - alert: An optional alert message for the user, if any.
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

  const {output} = await generateDailyAdvicePrompt({
    ...input,
    weightEntries: weightEntriesString,
  });
  return output!;
});

