// src/ai/flows/generate-weekly-summary.ts
'use server';
/**
 * @fileOverview This file defines the Genkit flow for generating a weekly summary of a user's weight loss progress and providing AI-driven insights.
 *
 * - generateWeeklySummary -  A function that generate weekly summary of user's progress.
 * - GenerateWeeklySummaryInput - The input type for the generateWeeklySummary function.
 * - GenerateWeeklySummaryOutput - The return type for the generateWeeklySummary function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';
import {getWeightEntries, WeightEntry} from '@/services/external-apis/weight-tracker';

const GenerateWeeklySummaryInputSchema = z.object({
  userId: z.string().describe('The ID of the user.'),
});
export type GenerateWeeklySummaryInput = z.infer<typeof GenerateWeeklySummaryInputSchema>;

const GenerateWeeklySummaryOutputSchema = z.object({
  summary: z.string().describe('A summary of the user\'s weight loss progress over the past week, including AI-driven insights and personalized tips.'),
});
export type GenerateWeeklySummaryOutput = z.infer<typeof GenerateWeeklySummaryOutputSchema>;

export async function generateWeeklySummary(input: GenerateWeeklySummaryInput): Promise<GenerateWeeklySummaryOutput> {
  return generateWeeklySummaryFlow(input);
}

const generateWeeklySummaryPrompt = ai.definePrompt({
  name: 'generateWeeklySummaryPrompt',
  input: {
    schema: z.object({
      userId: z.string().describe('The ID of the user.'),
      weightEntries: z
        .array(
          z.object({
            date: z.string(),
            weightKg: z.number(),
          })
        )
        .describe('The weight entries for the user over the past week.'),
    }),
  },
  output: {
    schema: z.object({
      summary: z.string().describe('A summary of the user\'s weight loss progress over the past week, including AI-driven insights and personalized tips.'),
    }),
  },
  prompt: `You are a weight loss coach providing a weekly summary to the user based on their weight entries.

  Summarize the user's progress over the past week, provide AI-driven insights, and give personalized tips to help them achieve their weight goals.

  Weight entries:
  {{#each weightEntries}}
  - Date: {{date}}, Weight: {{weightKg}} kg
  {{/each}}
  `,
});

const generateWeeklySummaryFlow = ai.defineFlow<
  typeof GenerateWeeklySummaryInputSchema,
  typeof GenerateWeeklySummaryOutputSchema
>({
  name: 'generateWeeklySummaryFlow',
  inputSchema: GenerateWeeklySummaryInputSchema,
  outputSchema: GenerateWeeklySummaryOutputSchema,
},
async input => {
  const weightEntries: WeightEntry[] = await getWeightEntries(input.userId);

  // Get only last 7 days of entries
  const lastWeekEntries = weightEntries.slice(-7);

  const {output} = await generateWeeklySummaryPrompt({
    ...input,
    weightEntries: lastWeekEntries,
  });
  return output!;
});
