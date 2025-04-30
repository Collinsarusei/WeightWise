// src/components/AiChatbox.tsx
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link'; // Import Link
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icons } from '@/components/icons';
import { X, History, ArrowLeft, Edit, Trash2, Loader2, MessageSquare } from 'lucide-react'; // Added icons
import { getAiChatResponse } from '@/app/actions/chatActions';
import type { ChatMessage, GenerateChatResponseInput } from '@/ai/flows/generate-chat-response';
import { db, functions } from '@/lib/firebase/config'; // Import db and functions
import { httpsCallable } from 'firebase/functions'; // Import httpsCallable
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
export const AiChatbox: React.FC<AiChatboxProps> = ({ userId, userProfile, isOpen, onClose }) => {
  const [view, setView] = useState<'historyList' | 'conversationView'>('conversationView'); // Start in conversation view
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]); // Messages for the selected session
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false); // Loading AI response
  const [isSessionLoading, setIsSessionLoading] = useState(false); // Loading session list or messages
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  const { toast } = useToast();

  // --- Utility Functions --- 
  const clearChatState = () => {
      setMessages([]);
      setCurrentSessionId(null);
      setInput('');
      setIsLoading(false);
      setIsSessionLoading(false);
  }

  // --- Fetch Sessions (for history view) --- 
  const fetchSessions = useCallback(() => {
    if (!userId) return;
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
    return unsubscribe; // Returns the unsubscribe function from onSnapshot
  }, [userId, toast]);

  // --- Fetch Messages (for selected conversation view) ---
  const fetchMessagesForSession = useCallback((sessionId: string) => {
    if (!userId) return;
    setIsSessionLoading(true);
    setMessages([]); // Clear previous messages
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
    return unsubscribe; // Returns the unsubscribe function from onSnapshot
  }, [userId, toast]);

  // --- Effects --- 
  // Effect to manage listeners based on view and session ID
  useEffect(() => {
    // Adjust type to allow undefined, matching potential return from callbacks
    let unsubscribe: (() => void) | undefined | null = null; 

    if (isOpen && userId) {
      if (view === 'historyList') {
        unsubscribe = fetchSessions(); // Assign result directly
      } else if (view === 'conversationView' && currentSessionId) {
        unsubscribe = fetchMessagesForSession(currentSessionId); // Assign result directly
      } else {
          // In conversation view but no session ID (new chat), clear messages
          setMessages([]); 
          setIsSessionLoading(false);
      }
    } else {
        clearChatState(); // Clear everything when closed or no user
    }

    // Cleanup listener: Only call if unsubscribe is a function
    return () => {
      if (unsubscribe) { 
        unsubscribe();
      }
    };
  // Dependencies now correctly include the functions themselves
  }, [isOpen, userId, view, currentSessionId, fetchSessions, fetchMessagesForSession]); 

  // Scroll to bottom effect
  useEffect(() => {
    if (!isSessionLoading) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isSessionLoading]);

  // --- Session Management Functions --- 
  const startNewChatSession = useCallback(async (firstMessage: ChatMessage): Promise<string | null> => {
    if (!userId) return null;
    try {
      const sessionsRef = collection(db, `users/${userId}/chatSessions`);
      const newSessionDoc = await addDoc(sessionsRef, {
        startTime: serverTimestamp(),
        userId: userId,
        firstMessage: firstMessage.text.substring(0, 100), 
      });
      console.log("New chat session created:", newSessionDoc.id);
      return newSessionDoc.id;
    } catch (error) {
      console.error("Error starting new chat session:", error);
      return null;
    }
  }, [userId]);

  const saveMessageToCurrentSession = useCallback(async (sessionId: string, message: ChatMessage) => {
    if (!userId || !sessionId) return;
    try {
        const messagesRef = collection(db, `users/${userId}/chatSessions/${sessionId}/messages`);
        await addDoc(messagesRef, {
            ...message,
            userId: userId,
            timestamp: serverTimestamp()
        });
        console.log(`Message saved to session ${sessionId}:`, message.role);
    } catch (error) {
        console.error(`Error saving message to session ${sessionId}:`, error);
    }
  }, [userId]);

  const handleDeleteSession = async (sessionId: string) => {
    if (!userId || !sessionId || deletingSessionId) return;
    setDeletingSessionId(sessionId); 
    try {
        const deleteChatSessionFn = httpsCallable(functions, 'deleteChatSession');
        await deleteChatSessionFn({ sessionId: sessionId }); 
        toast({ title: "Success", description: "Chat session deleted." });
        // If currently viewing the deleted session, switch to history list
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

  // --- UI Event Handlers --- 
  const handleSend = async () => {
    if (!input.trim() || isLoading || !isOpen || !userProfile || !userId) return;

    const userMessage: ChatMessage = { role: 'user', text: input.trim() };
    const currentInput = input.trim();
    let sessionId = currentSessionId; // Use current session or start new one
    let tempMessages = [...messages, userMessage]; // Snapshot for optimistic UI and AI context

    setIsLoading(true);
    setInput(''); 
    setMessages(tempMessages); // Optimistic UI update

    try {
        if (!sessionId) {
            console.log("Starting new session...");
            const newSessionId = await startNewChatSession(userMessage);
            if (!newSessionId) throw new Error("Failed to create new chat session.");
            sessionId = newSessionId;
            setCurrentSessionId(sessionId); // Store the new session ID
            // Save the first user message to the *new* session
            await saveMessageToCurrentSession(sessionId, userMessage);
            console.log(`Saved first message to new session: ${sessionId}`);
        } else {
             // Save subsequent user message to the existing session
            await saveMessageToCurrentSession(sessionId, userMessage);
        }

        const bestName = userProfile.username || userProfile.email || 'User';
        // Pass history from the *optimistically updated* state
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

        console.log("CLIENT: Preparing to send chatInput to AI:", chatInput);
        const result = await getAiChatResponse(chatInput);
        const aiMessage: ChatMessage = { role: 'model', text: result.response };
        
        setMessages(prev => [...prev, aiMessage]); // Optimistic UI update for AI message
        await saveMessageToCurrentSession(sessionId, aiMessage); // Save AI message

    } catch (error) {
        console.error("handleSend Error:", error);
        const errorMessage: ChatMessage = { role: 'model', text: "Sorry, something went wrong processing your message." };
        setMessages(prev => [...prev, errorMessage]); // Show error in UI
    } finally {
        setIsLoading(false);
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !isLoading && input.trim()) { handleSend(); }
  };

  const handleSelectSession = (sessionId: string) => {
      console.log("Selecting session:", sessionId);
      setCurrentSessionId(sessionId);
      setView('conversationView');
      // Message fetching is handled by useEffect
  };

  const handleStartNewChat = () => {
      console.log("Starting new chat");
      clearChatState();
      setView('conversationView');
  }

  // --- Render Logic --- 
  return (
    <div className="flex flex-col h-[400px] md:h-[450px] w-full max-w-xs sm:max-w-sm border rounded-lg shadow-xl bg-white overflow-hidden">
      {/* Header: Changes based on view */} 
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

      {/* Content Area: Changes based on view */} 
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {/* History List View */} 
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

        {/* Conversation View */} 
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
                 {/* Loading indicator only when waiting for AI response */}
                 {isLoading && (
                     <div className="flex justify-start items-center pl-2 pt-1">
                         <Icons.spinner className="h-4 w-4 animate-spin text-gray-400" />
                     </div>
                 )}
                 <div ref={messagesEndRef} />
            </>
        )}
      </div>

      {/* Input Area: Only show in conversation view */} 
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