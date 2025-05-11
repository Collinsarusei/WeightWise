// src/components/AiChatbox.tsx
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation'; // Import useRouter
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icons } from '@/components/icons';
import { X, History, ArrowLeft, Edit, Trash2, Loader2, MessageSquare, Sparkles } from 'lucide-react';
import { getAiChatResponse } from '@/app/actions/chatActions';
import type { ChatMessage, GenerateChatResponseInput } from '@/ai/flows/generate-chat-response';
import { db, functions } from '@/lib/firebase/config';
import { httpsCallable } from 'firebase/functions';
import {
  collection,
  addDoc,
  doc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
  } from "@/components/ui/alert-dialog";

// --- Interfaces --- 
interface AiChatboxProps {
  userId: string;
  userProfile: {
      goal?: string;
      currentWeight?: number;
      targetWeight?: number;
      username?: string;
      email?: string;
  } | null;
  isPremiumUser: boolean; // Added for premium check
  isOpen: boolean;
  onClose: () => void;
}

interface FirestoreChatMessage extends ChatMessage {
    timestamp: Timestamp;
    userId: string;
}

interface ChatSession {
    id: string;
    startTime: Timestamp;
    firstMessage?: string;
}

// --- Component --- 
export const AiChatbox: React.FC<AiChatboxProps> = ({ userId, userProfile, isPremiumUser, isOpen, onClose }) => {
  const router = useRouter(); // Initialize router
  const [view, setView] = useState<'historyList' | 'conversationView'>('conversationView');
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSessionLoading, setIsSessionLoading] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  const { toast } = useToast();

  const clearChatState = () => {
      setMessages([]);
      setCurrentSessionId(null);
      setInput('');
      setIsLoading(false);
      setIsSessionLoading(false);
  }

  const fetchSessions = useCallback(() => {
    if (!userId || !isPremiumUser) return; // Do not fetch if not premium
    setIsSessionLoading(true);
    const sessionsRef = collection(db, `users/${userId}/chatSessions`);
    const q = query(sessionsRef, orderBy('startTime', 'desc')); 

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedSessions = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      })) as ChatSession[];
      setSessions(fetchedSessions);
      setIsSessionLoading(false);
    }, (error) => {
      console.error("Error fetching chat sessions:", error);
      toast({ title: "Error Loading History", description: error.message, variant: "destructive" });
      setIsSessionLoading(false);
    });
    return unsubscribe;
  }, [userId, toast, isPremiumUser]);

  const fetchMessagesForSession = useCallback((sessionId: string) => {
    if (!userId || !isPremiumUser) return; // Do not fetch if not premium
    setIsSessionLoading(true);
    setMessages([]);
    const messagesRef = collection(db, `users/${userId}/chatSessions/${sessionId}/messages`);
    const q = query(messagesRef, orderBy('timestamp', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedMessages = snapshot.docs.map(docSnap => docSnap.data() as ChatMessage);
      setMessages(fetchedMessages);
      setIsSessionLoading(false);
    }, (error) => {
        console.error(`Error fetching messages for session ${sessionId}:`, error);
        toast({ title: "Error Loading Messages", description: error.message, variant: "destructive" });
        setIsSessionLoading(false);
    });
    return unsubscribe;
  }, [userId, toast, isPremiumUser]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined | null = null; 

    if (isOpen && userId && isPremiumUser) { // Only proceed if premium
      if (view === 'historyList') {
        unsubscribe = fetchSessions();
      } else if (view === 'conversationView' && currentSessionId) {
        unsubscribe = fetchMessagesForSession(currentSessionId);
      } else {
          setMessages([]); 
          setIsSessionLoading(false);
      }
    } else if (!isPremiumUser && isOpen) {
        // If not premium and chat is open, clear state and show minimal UI
        clearChatState();
        setView('conversationView'); // Default to conversation view to show upgrade message
    } else {
        clearChatState();
    }

    return () => {
      if (unsubscribe) { 
        unsubscribe();
      }
    };
  }, [isOpen, userId, view, currentSessionId, fetchSessions, fetchMessagesForSession, isPremiumUser]); 

  useEffect(() => {
    if (!isSessionLoading && isPremiumUser) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isSessionLoading, isPremiumUser]);

  const startNewChatSession = useCallback(async (firstMessage: ChatMessage): Promise<string | null> => {
    if (!userId || !isPremiumUser) return null;
    try {
      const sessionsRef = collection(db, `users/${userId}/chatSessions`);
      const newSessionDoc = await addDoc(sessionsRef, {
        startTime: serverTimestamp(),
        userId: userId,
        firstMessage: firstMessage.text.substring(0, 100), 
      });
      return newSessionDoc.id;
    } catch (error) {
      console.error("Error starting new chat session:", error);
      return null;
    }
  }, [userId, isPremiumUser]);

  const saveMessageToCurrentSession = useCallback(async (sessionId: string, message: ChatMessage) => {
    if (!userId || !sessionId || !isPremiumUser) return;
    try {
        const messagesRef = collection(db, `users/${userId}/chatSessions/${sessionId}/messages`);
        await addDoc(messagesRef, {
            ...message,
            userId: userId,
            timestamp: serverTimestamp()
        });
    } catch (error) {
        console.error(`Error saving message to session ${sessionId}:`, error);
    }
  }, [userId, isPremiumUser]);

  const handleDeleteSession = async (sessionId: string) => {
    if (!userId || !sessionId || deletingSessionId || !isPremiumUser) return;
    setDeletingSessionId(sessionId); 
    try {
        const deleteChatSessionFn = httpsCallable(functions, 'deleteChatSession');
        await deleteChatSessionFn({ sessionId: sessionId }); 
        toast({ title: "Success", description: "Chat session deleted." });
        if (currentSessionId === sessionId) {
            setView('historyList');
            setCurrentSessionId(null);
            setMessages([]);
        }
    } catch (error: any) {
        console.error("Error calling deleteChatSession function:", error);
        toast({ title: "Deletion Failed", description: error.message || "Could not delete chat session.", variant: "destructive" });
    } finally {
        setDeletingSessionId(null); 
    }
  };

  const handleSend = async () => {
    if (!isPremiumUser) {
        router.push('/upgrade');
        onClose(); // Optionally close the chatbox
        return;
    }
    if (!input.trim() || isLoading || !isOpen || !userProfile || !userId) return;

    const userMessage: ChatMessage = { role: 'user', text: input.trim() };
    const currentInput = input.trim();
    let sessionId = currentSessionId;
    let tempMessages = [...messages, userMessage];

    setIsLoading(true);
    setInput(''); 
    setMessages(tempMessages);

    try {
        if (!sessionId) {
            const newSessionId = await startNewChatSession(userMessage);
            if (!newSessionId) throw new Error("Failed to create new chat session.");
            sessionId = newSessionId;
            setCurrentSessionId(sessionId);
            await saveMessageToCurrentSession(sessionId, userMessage);
        } else {
            await saveMessageToCurrentSession(sessionId, userMessage);
        }

        const bestName = userProfile.username || userProfile.email || 'User';
        const historyForAI = tempMessages.slice(-10); 
        
        const chatInput: GenerateChatResponseInput = {
            userId: userId,
            goal: userProfile.goal,
            currentWeightKg: userProfile.currentWeight,
            targetWeightKg: userProfile.targetWeight,
            history: historyForAI, 
            prompt: currentInput,
            username: bestName,
        };

        const result = await getAiChatResponse(chatInput);
        const aiMessage: ChatMessage = { role: 'model', text: result.response };
        
        setMessages(prev => [...prev, aiMessage]);
        await saveMessageToCurrentSession(sessionId, aiMessage);

    } catch (error) {
        console.error("handleSend Error:", error);
        const errorMessage: ChatMessage = { role: 'model', text: "Sorry, something went wrong processing your message." };
        setMessages(prev => [...prev, errorMessage]);
    } finally {
        setIsLoading(false);
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !isLoading && input.trim()) {
        if (!isPremiumUser) {
            router.push('/upgrade');
            onClose();
        } else {
            handleSend();
        }
    }
  };

  const handleSelectSession = (sessionId: string) => {
      if (!isPremiumUser) return; // Prevent action if not premium
      setCurrentSessionId(sessionId);
      setView('conversationView');
  };

  const handleStartNewChat = () => {
      if (!isPremiumUser) return; // Prevent action if not premium
      clearChatState();
      setView('conversationView');
  }
  
  // --- Render Premium Gate if not a premium user ---
  if (!isPremiumUser) {
    return (
        <div className="flex flex-col h-[400px] md:h-[450px] w-full max-w-xs sm:max-w-sm border rounded-lg shadow-xl bg-white overflow-hidden items-center justify-center p-6 text-center">
            <div className="p-3 border-b bg-gray-50 rounded-t-lg flex justify-between items-center flex-shrink-0 gap-2 w-full absolute top-0 left-0 right-0">
                <div className="flex-1"></div> {/* Spacer */} 
                <h3 className="font-semibold text-sm text-gray-700 flex-1 text-center truncate">
                    AI Chat 
                </h3>
                <Button onClick={onClose} variant="ghost" size="sm" className="p-1 h-auto" aria-label="Close chat">
                    <X size={18} className="text-gray-600" />
                </Button>
            </div>

            <Sparkles className="h-12 w-12 text-yellow-500 mb-4" />
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Unlock AI Coach</h3>
            <p className="text-sm text-gray-600 mb-6">
                Upgrade to Premium to get personalized advice, ask questions, and stay motivated with your AI fitness coach.
            </p>
            <Button 
                onClick={() => {
                    router.push('/upgrade');
                    onClose(); // Close chatbox after redirecting
                }}
                className="bg-green-600 hover:bg-green-700 text-white w-full"
            >
                Upgrade to Premium
            </Button>
        </div>
    );
  }

  // --- Render Full Chatbox for Premium Users --- 
  return (
    <div className="flex flex-col h-[400px] md:h-[450px] w-full max-w-xs sm:max-w-sm border rounded-lg shadow-xl bg-white overflow-hidden">
      <div className="p-3 border-b bg-gray-50 rounded-t-lg flex justify-between items-center flex-shrink-0 gap-2">
        {view === 'conversationView' && (
             <Button variant="ghost" size="sm" className="p-1 h-auto" title="View History" onClick={() => setView('historyList')}>
                 <History size={18} className="text-gray-600" />
            </Button>
        )}
        {view === 'historyList' && (
             <Button variant="ghost" size="sm" className="p-1 h-auto" title="Start New Chat" onClick={handleStartNewChat}>
                 <Edit size={18} className="text-gray-600" />
            </Button>
        )}

        <h3 className="font-semibold text-sm text-gray-700 flex-1 text-center truncate">
          {view === 'historyList' ? 'Chat History' : currentSessionId ? 'Conversation' : 'New Chat'} 
        </h3>

        <Button onClick={onClose} variant="ghost" size="sm" className="p-1 h-auto" aria-label="Close chat">
            <X size={18} className="text-gray-600" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {view === 'historyList' && (
            <>
                {isSessionLoading && (
                    <div className="flex justify-center items-center p-4 text-sm text-gray-500">
                        <Icons.spinner className="h-4 w-4 animate-spin mr-2" /> Loading history...
                    </div>
                )}
                {!isSessionLoading && sessions.length === 0 && (
                    <p className="text-center text-gray-500 mt-10">No past conversations found.</p>
                )}
                {!isSessionLoading && sessions.length > 0 && (
                    <ul className="space-y-2">
                        {sessions.map((session) => (
                            <li key={session.id} className="bg-white p-2 rounded-md border border-gray-200 hover:bg-gray-50 flex items-center justify-between gap-2">
                                <button onClick={() => handleSelectSession(session.id)} className="flex-grow text-left truncate">
                                    <div className="flex items-center gap-2">
                                        <MessageSquare className="h-4 w-4 text-gray-500 flex-shrink-0" />
                                        <span className="text-sm font-medium text-gray-700 truncate">
                                            {session.startTime ? session.startTime.toDate().toLocaleString() : 'Conversation'}
                                        </span>
                                    </div>
                                    {session.firstMessage && <p className="text-xs text-gray-500 truncate mt-1 pl-6">{session.firstMessage}</p>}
                                </button>
                                
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="icon" title="Delete Session" disabled={deletingSessionId === session.id} className="flex-shrink-0 h-7 w-7 p-0">
                                            {deletingSessionId === session.id ? <Loader2 className="h-4 w-4 text-red-500 animate-spin" /> : <Trash2 className="h-4 w-4 text-red-500" />}
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                        <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This action cannot be undone. This will permanently delete all messages in this session.
                                        </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleDeleteSession(session.id)} className="bg-red-600 hover:bg-red-700">Delete Session</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </li>
                        ))}
                    </ul>
                )}
            </>
        )}

        {view === 'conversationView' && (
            <>
                 {isSessionLoading && (
                     <div className="flex justify-center items-center p-4 text-sm text-gray-500">
                         <Icons.spinner className="h-4 w-4 animate-spin mr-2" /> Loading messages...
                     </div>
                 )}
                 {!isSessionLoading && messages.length === 0 && !currentSessionId && (
                    <p className="text-center text-xs text-gray-400 px-4 py-2">Start the conversation below!</p>
                 )}
                 {!isSessionLoading && messages.length === 0 && currentSessionId && (
                    <p className="text-center text-xs text-gray-400 px-4 py-2">No messages in this session yet.</p> 
                 )}
                 {!isSessionLoading && messages.map((msg, index) => ( 
                   <div key={`${currentSessionId || 'new'}-${index}-${msg.role}`} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}> 
                     <div 
                       className={`px-3 py-1.5 rounded-lg max-w-[85%] text-sm shadow-sm ${ msg.role === 'user' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-800 border border-gray-200' }`} 
                       style={{ whiteSpace: 'pre-wrap' }} 
                     > 
                       {msg.text} 
                     </div> 
                   </div> 
                 ))}
                 {isLoading && (
                     <div className="flex justify-start items-center pl-2 pt-1">
                         <Icons.spinner className="h-4 w-4 animate-spin text-gray-400" />
                     </div>
                 )}
                 <div ref={messagesEndRef} />
            </>
        )}
      </div>

      {view === 'conversationView' && (
          <div className="p-2 border-t flex gap-2 flex-shrink-0">
             <Input 
               type="text" 
               placeholder="Ask something..." 
               value={input} 
               onChange={(e) => setInput(e.target.value)} 
               onKeyPress={handleKeyPress} 
               disabled={isLoading || isSessionLoading}
               className="flex-1 text-sm h-9"
             />
             <Button 
               onClick={handleSend} 
               disabled={isLoading || isSessionLoading || !input.trim()} 
               className="bg-green-600 hover:bg-green-700 text-sm h-9 px-3"
             > 
               Send 
             </Button>
           </div>
       )}
    </div>
  );
};