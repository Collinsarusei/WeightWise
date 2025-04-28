// src/ai/flows/generate-chat-response.ts
'use server';

import { ai } from '@/ai/ai-instance';
import { z } from 'genkit';

// Define the structure for a single message in the conversation
const ChatMessageSchema = z.object({
  role: z.enum(['user', 'model']),
  text: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

// --- UPDATE INPUT SCHEMA ---
const GenerateChatResponseInputSchema = z.object({
  userId: z.string().describe('The ID of the user for context.'),
  goal: z.string().optional().describe('User goal (lose, gain, maintain).'),
  currentWeightKg: z.number().optional().describe('User current weight.'),
  targetWeightKg: z.number().optional().describe('User target weight.'),
  username: z.string().optional().describe('The display name or username of the user.'), // <-- ADDED USERNAME FIELD
  history: z.array(ChatMessageSchema).describe('The conversation history.'),
  prompt: z.string().describe('The latest user message/question.'),
});
// ---------------------------
export type GenerateChatResponseInput = z.infer<typeof GenerateChatResponseInputSchema>;

// Define the output (the AI's response)
const GenerateChatResponseOutputSchema = z.object({
  response: z.string().describe("The AI assistant's Response."),
});
export type GenerateChatResponseOutput = z.infer<typeof GenerateChatResponseOutputSchema>;

// --- UPDATE PROMPT ---
const generateChatResponsePrompt = ai.definePrompt({
  name: 'generateChatResponsePrompt',
  input: { schema: GenerateChatResponseInputSchema },
  output: { schema: GenerateChatResponseOutputSchema },
  prompt: `You are WeightWise AI, a friendly, helpful, and encouraging fitness and nutrition assistant.
Your goal is to provide supportive advice, answer questions, and help the user stay motivated.

User Context:
- User ID: {{userId}}
- Username: {{username}} // <-- REFERENCE USERNAME
- Goal: {{goal}}
- Current Weight: {{currentWeightKg}} kg
- Target Weight: {{targetWeightKg}} kg

Conversation History (if any):
{{#each history}}
{{role}}: {{text}}
{{/each}}

Current User Question: {{prompt}}

INSTRUCTIONS:
- Respond directly to the "Current User Question" based on the context and history.
- Be concise, helpful, and always encouraging.
- **Occasionally (e.g., for greetings like "hello", "hi", or near the start of a new conversation), address the user directly using their username: {{username}}. Avoid overusing the name.**
- If the question is outside your scope (fitness, nutrition, motivation related to WeightWise), politely state that you cannot help with that specific topic.
  `, // End of template literal
});
// --------------------

// Define the Genkit Flow (No changes needed here)
export const generateChatResponseFlow = ai.defineFlow<
  typeof GenerateChatResponseInputSchema,
  typeof GenerateChatResponseOutputSchema
>({
  name: 'generateChatResponseFlow',
  inputSchema: GenerateChatResponseInputSchema,
  outputSchema: GenerateChatResponseOutputSchema,
},
async (input) => {
  // console.log("CHAT FLOW: Input:", JSON.stringify(input, null, 2));
  try {
      const { output } = await generateChatResponsePrompt(input);
      // console.log("CHAT FLOW: Prompt Output:", output);
      if (!output) {
        throw new Error("AI failed to generate a response (output was null/undefined).");
      }
      return output;
  } catch(error) {
      console.error("Error within generateChatResponseFlow:", error);
      throw error;
  }
});

// This function will be called by the Server Action (No changes needed here)
export async function generateChatResponse(input: GenerateChatResponseInput): Promise<GenerateChatResponseOutput> {
   return generateChatResponseFlow(input);
}