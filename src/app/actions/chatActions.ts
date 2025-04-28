// src/app/actions/chatActions.ts
'use server'; // IMPORTANT: Mark this file for Server Actions

import { generateChatResponse, GenerateChatResponseInput } from '@/ai/flows/generate-chat-response';
import { auth } from '@/lib/firebase/config'; // To potentially get user ID server-side if needed

export async function getAiChatResponse(input: GenerateChatResponseInput) {
    // Optional: Verify user authentication server-side if needed
    // const user = auth.currentUser; // This might not work directly in server actions, need auth context passed or handled differently
    // if (!user || user.uid !== input.userId) {
    //   throw new Error("Unauthorized");
    // }

    try {
        const result = await generateChatResponse(input);
        return result;
    } catch (error) {
        console.error("Chat action error:", error);
        // Return a generic error message or throw a specific error
        return { response: "Sorry, I encountered an error. Please try again." };
    }
}