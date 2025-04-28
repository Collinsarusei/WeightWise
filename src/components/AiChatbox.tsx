// src/components/AiChatbox.tsx
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icons } from '@/components/icons';
import { X } from 'lucide-react';
import { getAiChatResponse } from '@/app/actions/chatActions';
import type { ChatMessage, GenerateChatResponseInput } from '@/ai/flows/generate-chat-response';

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

export const AiChatbox: React.FC<AiChatboxProps> = ({ userId, userProfile, isOpen, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<null | HTMLDivElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    if (!isOpen) {
      setInput('');
      setIsLoading(false);
    }
  }, [isOpen]);

  const handleSend = async () => {
    // --- Input validation and state checks ---
    if (!input.trim() || isLoading || !isOpen || !userProfile) return;

    const userMessage: ChatMessage = { role: 'user', text: input.trim() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // --- Include Username in Input ---
    const bestName = userProfile.username || userProfile.email || 'User';
    const chatInput: GenerateChatResponseInput = {
      userId: userId,
      goal: userProfile.goal,
      currentWeightKg: userProfile.currentWeight,
      targetWeightKg: userProfile.targetWeight,
      history: messages,
      prompt: userMessage.text,
      username: bestName, // Pass username
    };
    // --- End Username Inclusion ---

    console.log("CLIENT: Preparing to send chatInput:", chatInput);

    try {
      const result = await getAiChatResponse(chatInput);
      const aiMessage: ChatMessage = { role: 'model', text: result.response };
      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error("Failed to get chat response:", error);
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
      {/* Header with Close Button AND EMOJI RESTORED */}
      <div className="p-3 border-b bg-gray-50 rounded-t-lg flex justify-between items-center flex-shrink-0">
        {/* === ADDED EMOJI BACK HERE === */}
        <h3 className="font-semibold text-sm text-gray-700 flex-1 text-center pl-6">
           💬 Chat with AI
        </h3>
        {/* ============================ */}
        <Button onClick={onClose} variant="ghost" size="sm" className="p-1 h-auto" aria-label="Close chat">
            <X size={18} className="text-gray-600" />
        </Button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
         {messages.map((msg, index) => ( <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}> <div className={`px-3 py-1.5 rounded-lg max-w-[85%] text-sm shadow-sm ${ msg.role === 'user' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-800 border border-gray-200' }`} style={{ whiteSpace: 'pre-wrap' }} > {msg.text} </div> </div> ))}
         {isLoading && ( <div className="flex justify-center items-center p-2"><Icons.spinner className="h-4 w-4 animate-spin text-gray-400" /></div> )}
         <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-2 border-t flex gap-2 flex-shrink-0">
         <Input type="text" placeholder="Ask something..." value={input} onChange={(e) => setInput(e.target.value)} onKeyPress={handleKeyPress} disabled={isLoading} className="flex-1 text-sm h-9"/>
         <Button onClick={handleSend} disabled={isLoading || !input.trim()} className="bg-green-600 hover:bg-green-700 text-sm h-9 px-3"> Send </Button>
       </div>
    </div>
  );
};