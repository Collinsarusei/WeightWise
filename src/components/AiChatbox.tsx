// src/components/AiChatbox.tsx
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icons } from '@/components/icons';
import { X } from 'lucide-react';
import { getAiChatResponse } from '@/app/actions/chatActions';
import type { ChatMessage, GenerateChatResponseInput } from '@/ai/flows/generate-chat-response';
import { db } from '@/lib/firebase/config'; // Import Firestore instance
import {
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';

interface AiChatboxProps {
  userId: string;
  userProfile: {
      goal?: string;
      currentWeight?: number;
      targetWeight?: number;
      username?: string;
      email?: string;
  } | null;
  isOpen: boolean;
  onClose: () => void;
}

interface FirestoreChatMessage extends ChatMessage {
    timestamp: Timestamp;
    userId: string; // Ensure userId is stored
}

export const AiChatbox: React.FC<AiChatboxProps> = ({ userId, userProfile, isOpen, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true); // State for loading history
  const messagesEndRef = useRef<null | HTMLDivElement>(null);

  // --- Fetch Chat History --- 
  useEffect(() => {
    if (!userId || !isOpen) {
      // Clear messages if chat is closed or user is not available
       setMessages([]);
       setIsHistoryLoading(false);
      return;
    }

    setIsHistoryLoading(true);
    const chatHistoryRef = collection(db, `users/${userId}/chatHistory`);
    const q = query(chatHistoryRef, orderBy('timestamp', 'desc'), limit(20)); // Limit to last 20 messages for now

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const history = snapshot.docs
        .map(doc => doc.data() as FirestoreChatMessage) // Get data
        .reverse(); // Reverse to show oldest first

      setMessages(history);
      setIsHistoryLoading(false);
      console.log("Chat history loaded:", history.length);
    }, (error) => {
      console.error("Error fetching chat history:", error);
      setIsHistoryLoading(false);
      // Optionally set an error message state
    });

    // Cleanup listener on unmount or when userId/isOpen changes
    return () => unsubscribe();

  }, [userId, isOpen]); // Re-run if userId or isOpen changes
  // ------------------------

  useEffect(() => {
    if (!isLoading && !isHistoryLoading) { // Scroll only when not loading anything
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
   }, [messages, isLoading, isHistoryLoading]);

  useEffect(() => {
    if (!isOpen) {
      setInput('');
      setIsLoading(false);
    }
  }, [isOpen]);

  // --- Function to save message to Firestore --- 
  const saveMessageToFirestore = useCallback(async (message: ChatMessage) => {
    if (!userId) return;
    try {
        const chatHistoryRef = collection(db, `users/${userId}/chatHistory`);
        await addDoc(chatHistoryRef, {
            ...message,
            userId: userId,
            timestamp: serverTimestamp()
        });
        console.log("Message saved to Firestore:", message.role);
    } catch (error) {
        console.error("Error saving message to Firestore:", error);
        // Optionally show a toast or error message to the user
    }
  }, [userId]);
  // ------------------------------------------

  const handleSend = async () => {
    if (!input.trim() || isLoading || !isOpen || !userProfile || !userId) return;

    const userMessage: ChatMessage = { role: 'user', text: input.trim() };
    const currentInput = input.trim(); // Store current input before clearing
    setInput(''); // Clear input immediately
    setIsLoading(true);

    // Display user message immediately (optimistic update)
    // NOTE: We don't setMessages directly here anymore because Firestore listener will update it
    // setMessages(prev => [...prev, userMessage]);
    await saveMessageToFirestore(userMessage); // Save user message

    const bestName = userProfile.username || userProfile.email || 'User';

    // Use the current state of messages (up to the user message just sent)
    // or fetch latest history slice if needed for very long conversations.
    // For simplicity here, we use the current state `messages`
    const chatInput: GenerateChatResponseInput = {
      userId: userId,
      goal: userProfile.goal,
      currentWeightKg: userProfile.currentWeight,
      targetWeightKg: userProfile.targetWeight,
      // --- Pass relevant history slice --- 
      history: messages.slice(-10), // Pass last 10 messages (adjust number as needed)
      prompt: currentInput, // Use the stored input
      username: bestName,
    };

    console.log("CLIENT: Preparing to send chatInput:", chatInput);

    try {
      const result = await getAiChatResponse(chatInput);
      const aiMessage: ChatMessage = { role: 'model', text: result.response };
      await saveMessageToFirestore(aiMessage); // Save AI message
      // Message list will update via Firestore listener
    } catch (error) {
      console.error("Failed to get chat response:", error);
      // Display temporary error message locally, don't save error to history
      const errorMessage: ChatMessage = { role: 'model', text: "Sorry, I couldn't connect right now." };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !isLoading && input.trim()) { handleSend(); }
  };

  return (
    <div className="flex flex-col h-[400px] md:h-[450px] w-full max-w-xs sm:max-w-sm border rounded-lg shadow-xl bg-white overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b bg-gray-50 rounded-t-lg flex justify-between items-center flex-shrink-0">
        <h3 className="font-semibold text-sm text-gray-700 flex-1 text-center pl-6">
           💬 Chat with AI
        </h3>
        <Button onClick={onClose} variant="ghost" size="sm" className="p-1 h-auto" aria-label="Close chat">
            <X size={18} className="text-gray-600" />
        </Button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
         {isHistoryLoading && (
             <div className="flex justify-center items-center p-4 text-sm text-gray-500">
                 <Icons.spinner className="h-4 w-4 animate-spin mr-2" /> Loading history...
             </div>
         )}
         {!isHistoryLoading && messages.length === 0 && (
            <p className="text-center text-xs text-gray-400 px-4 py-2">Start the conversation!</p>
         )}
         {!isHistoryLoading && messages.map((msg, index) => ( <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}> <div className={`px-3 py-1.5 rounded-lg max-w-[85%] text-sm shadow-sm ${ msg.role === 'user' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-800 border border-gray-200' }`} style={{ whiteSpace: 'pre-wrap' }} > {msg.text} </div> </div> ))}
         {isLoading && ( <div className="flex justify-center items-center p-2"><Icons.spinner className="h-4 w-4 animate-spin text-gray-400" /></div> )}
         <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-2 border-t flex gap-2 flex-shrink-0">
         <Input type="text" placeholder="Ask something..." value={input} onChange={(e) => setInput(e.target.value)} onKeyPress={handleKeyPress} disabled={isLoading || isHistoryLoading} className="flex-1 text-sm h-9"/>
         <Button onClick={handleSend} disabled={isLoading || isHistoryLoading || !input.trim()} className="bg-green-600 hover:bg-green-700 text-sm h-9 px-3"> Send </Button>
       </div>
    </div>
  );
};