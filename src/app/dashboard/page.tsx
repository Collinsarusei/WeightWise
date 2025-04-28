// src/app/dashboard/page.tsx

'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { getFunctions, httpsCallable } from "firebase/functions";
import { functions } from '@/lib/firebase/config'; // Assuming functions instance is exported
import { auth, db } from '@/lib/firebase/config';
import { signOut } from '@/lib/firebase/authService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icons } from '@/components/icons';
import { doc, getDoc, collection, getDocs, query, orderBy, Timestamp } from 'firebase/firestore';
import Link from "next/link";
import { MessageSquare, ChevronLeft, CalendarClock, Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { logExercise } from '@/lib/firebase/exerciseService';
import { createWeightEntry } from '@/services/external-apis/weight-tracker';
import { generateDailyAdvice } from '@/ai/flows/generate-daily-advice';
import { generateWeeklySummary } from '@/ai/flows/generate-weekly-summary';
import ExerciseBarChart from "@/components/ExerciseBarChart";
import { AiChatbox } from '@/components/AiChatbox';
import { Footer } from '@/components/Footer';
import PwaPrompt from '@/components/PwaPrompt';
import { useAuth } from '@/components/AuthProvider';

// --- Updated Constants for Pricing ---
const PREMIUM_MONTHLY_PRICE_NUM = 2.99;
const PREMIUM_YEARLY_PRICE_NUM = 29.99;
const PREMIUM_CURRENCY = 'USD'; // <-- Changed to USD

// --- Date Helper Functions ---
const getStartOfWeek = (date: Date, startDay = 0): Date => {
    const d = new Date(date); const day = d.getDay(); const diff = d.getDate() - day + (day === 0 ? -6 + startDay : startDay); d.setDate(diff); d.setHours(0, 0, 0, 0); return d; };
const addDays = (date: Date, days: number): Date => {
    const result = new Date(date); result.setDate(result.getDate() + days); return result; };
const formatDateRange = (startDate: Date): string => {
    const endDate = addDays(startDate, 6); const startStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); const endStr = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); return `${startStr} - ${endStr}`; };

// --- Interfaces ---
interface UserProfile {
  goal: string;
  currentWeight: number;
  targetWeight: number;
  email: string;
  username?: string;
  activityLevel?: string;
  dietaryPreference?: string;
  onboardingComplete?: boolean;
  isPro?: boolean;
}
interface ExerciseEntry {
    id?: string;
    date: Timestamp;
    duration: number;
    type?: string;
}

// --- Component ---
export default function DashboardPage() {
  const router = useRouter();
  const { user: authUser, isPro, loading: authLoading } = useAuth();
  const { toast } = useToast();

  // Local state
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);
  const [allExercises, setAllExercises] = useState<ExerciseEntry[]>([]);
  const [viewedWeekStart, setViewedWeekStart] = useState<Date>(() => getStartOfWeek(new Date()));
  const [isLoadingExercises, setIsLoadingExercises] = useState(false);
  const [exerciseType, setExerciseType] = useState('');
  const [duration, setDuration] = useState('');
  const [isLoggingExercise, setIsLoggingExercise] = useState(false);
  const [exerciseLogError, setExerciseLogError] = useState<string | null>(null);
  const [currentWeightLog, setCurrentWeightLog] = useState('');
  const [isLoggingWeight, setIsLoggingWeight] = useState(false);
  const [logWeightError, setLogWeightError] = useState<string | null>(null);
  const [logWeightSuccess, setLogWeightSuccess] = useState<string | null>(null);
  const [dailyAdvice, setDailyAdvice] = useState<{ advice: string; encouragement: string; alert?: string; } | null>(null);
  const [isFetchingDailyAdvice, setIsFetchingDailyAdvice] = useState(false);
  const [weeklySummary, setWeeklySummary] = useState<string | null>(null);
  const [isFetchingWeekly, setIsFetchingWeekly] = useState(false);
  const [weeklyError, setWeeklyError] = useState<string | null>(null);
  const [isChatboxOpen, setIsChatboxOpen] = useState(false);

  const currentWeekStartDate = useMemo(() => getStartOfWeek(new Date()), []);

  // --- Data Fetching Callbacks ---
  const fetchExercises = useCallback(async (userId: string) => {
    console.log("[fetchExercises] Fetching for user:", userId);
    setIsLoadingExercises(true);
    try {
      const exercisesCollectionRef = collection(db, `users/${userId}/exercises`);
      const q = query(exercisesCollectionRef, orderBy('date', 'desc'));
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map(docSnap => {
          const data = docSnap.data();
          const dateTimestamp = data.date instanceof Timestamp ? data.date : Timestamp.now();
          return { id: docSnap.id, date: dateTimestamp, duration: typeof data.duration === 'number' ? data.duration : 0, type: typeof data.type === 'string' ? data.type : 'Unknown' };
      });
      setAllExercises(list);
    } catch (error) { console.error("[fetchExercises] Firestore query failed:", error); setAllExercises([]); }
    finally { setIsLoadingExercises(false); }
  }, []);

  const fetchProfile = useCallback(async (userId: string) => {
    console.log("[fetchProfile] Fetching PROFILE for user:", userId);
    setProfile(null);
    let fetchedProfile: UserProfile | null = null;
    try {
      const docRef = doc(db, "users", userId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        fetchedProfile = docSnap.data() as UserProfile;
        if (!fetchedProfile.username && authUser?.displayName) { fetchedProfile.username = authUser.displayName; }
        setProfile(fetchedProfile);
      } else { console.log("[fetchProfile] No user profile document found!"); }
    } catch (error) { console.error("[fetchProfile] Error fetching profile document:", error); }
    return fetchedProfile;
  }, [authUser?.displayName]);

  const triggerDailyAdviceFetch = useCallback(async (currentProfile: UserProfile | null) => {
     if (!authUser || !currentProfile?.goal || typeof currentProfile?.currentWeight !== 'number' || typeof currentProfile?.targetWeight !== 'number' || !currentProfile?.activityLevel || !currentProfile?.dietaryPreference) {
        console.log("[triggerDailyAdviceFetch] Profile data incomplete for daily advice. Not fetching.");
        setDailyAdvice(null);
        setIsFetchingDailyAdvice(false);
        return;
     }
     setIsFetchingDailyAdvice(true);
     setDailyAdvice(null);
     try {
         const aiResponse = await generateDailyAdvice({ userId: authUser.uid, goal: currentProfile.goal, currentWeightKg: currentProfile.currentWeight, targetWeightKg: currentProfile.targetWeight, activityLevel: currentProfile.activityLevel, dietaryPreference: currentProfile.dietaryPreference });
         setDailyAdvice(aiResponse);
     } catch (aiError) {
         console.error("[triggerDailyAdviceFetch] Error fetching daily advice:", aiError);
         setDailyAdvice(null);
     } finally {
         setIsFetchingDailyAdvice(false);
     }
  }, [authUser]);

  // Effect: Fetch initial data
  useEffect(() => {
    if (authUser && authUser.emailVerified) {
      setIsDashboardLoading(true);
      Promise.allSettled([
        fetchProfile(authUser.uid),
        fetchExercises(authUser.uid)
      ]).then(([profileResult]) => {
         setIsDashboardLoading(false);
         if (profileResult.status === 'fulfilled' && isPro) {
             triggerDailyAdviceFetch(profileResult.value);
         }
      });
    } else if (!authLoading && !authUser) {
       setIsDashboardLoading(false);
    } else if (!authLoading && authUser && !authUser.emailVerified) {
        setIsDashboardLoading(false);
    }
  }, [authUser, authLoading, fetchProfile, fetchExercises, triggerDailyAdviceFetch, isPro]);

  // --- Handler Functions ---
  const handleSignOut = async () => { console.log("Signing out..."); try { await signOut(); } catch (error) { console.error("Sign out error:", error); } };
  const handleExerciseSubmit = async () => { if (!authUser || !exerciseType.trim() || !duration.trim()) { setExerciseLogError("Please enter both exercise type and duration."); return; } const durationMinutes = parseInt(duration); if (isNaN(durationMinutes) || durationMinutes <= 0) { setExerciseLogError("Please enter a valid positive number for duration."); return; } setIsLoggingExercise(true); setExerciseLogError(null); try { await logExercise(authUser.uid, exerciseType.trim(), durationMinutes); setExerciseType(''); setDuration(''); await fetchExercises(authUser.uid); } catch (error) { console.error("HANDLE EXERCISE: Failed:", error); setExerciseLogError("Failed to save exercise."); } finally { setIsLoggingExercise(false); } };
  const handleLogWeightSubmit = async () => { if (!authUser || !currentWeightLog.trim()) return; const weightKg = parseFloat(currentWeightLog); if (isNaN(weightKg) || weightKg <= 0) { setLogWeightError("Please enter a valid positive weight."); setLogWeightSuccess(null); return; } setIsLoggingWeight(true); setLogWeightError(null); setLogWeightSuccess(null); try { await createWeightEntry(authUser.uid, { weightKg }); setLogWeightSuccess(`Weight (${weightKg} kg) logged successfully!`); setCurrentWeightLog(''); } catch (error) { console.error("Failed to log weight:", error); setLogWeightError("Could not save weight. Please try again."); } finally { setIsLoggingWeight(false); setTimeout(() => { setLogWeightSuccess(null); setLogWeightError(null); }, 4000); } };
  const handleFetchWeeklySummary = async () => { if (!authUser) return; setIsFetchingWeekly(true); setWeeklyError(null); setWeeklySummary(null); try { const result = await generateWeeklySummary({ userId: authUser.uid }); setWeeklySummary(result.summary); } catch (error) { console.error("Error fetching weekly summary:", error); setWeeklyError("Could not fetch weekly summary."); } finally { setIsFetchingWeekly(false); } };
  const toggleChatbox = () => { setIsChatboxOpen(prev => !prev); };
  const handlePreviousWeek = () => { setViewedWeekStart(prev => addDays(prev, -7)); };
  const handleGoToThisWeek = () => { setViewedWeekStart(currentWeekStartDate); };

  // --- Handler to Navigate to Upgrade Page --- (NEW)
  const navigateToUpgrade = () => {
    router.push('/upgrade');
  };
  // --- End Handler to Navigate to Upgrade Page ---

  // --- Render Logic ---
  if (authLoading) {
    return ( <div className="flex items-center justify-center min-h-screen"><Icons.spinner className="h-16 w-16 animate-spin text-green-600" /></div> );
  }

  const displayName = profile?.username || authUser?.displayName || profile?.email || 'WeightWise User';
  const isViewingCurrentWeek = viewedWeekStart.getTime() === currentWeekStartDate.getTime();

  return (
    <div className="relative flex flex-col min-h-screen bg-gradient-to-br from-blue-50 via-green-50 to-purple-100">
      <main className="flex-grow p-4 md:p-6 pb-24">
        <div className="max-w-7xl mx-auto">
          {/* --- Header --- */}
          <div className="flex flex-col sm:flex-row justify-between items-center mb-6 md:mb-8 gap-4">
            <h1 className="text-3xl md:text-4xl font-extrabold text-gray-800">🏋️‍♀️ WeightWise Dashboard</h1>
            <Button onClick={handleSignOut} variant="outline" size="sm">Sign Out</Button>
          </div>

          {/* --- Profile Section --- */}
          <div className="mb-6 p-6 rounded-xl shadow-lg bg-white/80 border border-gray-200 min-h-[150px] flex flex-col justify-center">
             {isDashboardLoading ? (
                 <div className="text-center"><Icons.spinner className="h-6 w-6 animate-spin text-green-600 mx-auto" /></div>
             ) : (
                 <>
                    <div className="flex justify-between items-start mb-3">
                        <h2 className="text-xl md:text-2xl font-semibold text-gray-700"> Welcome back, {displayName}! 👋 </h2>
                        {/* --- Upgrade Button -> Navigates to /upgrade --- */}
                        {!isPro && (
                             <Button
                                size="sm"
                                className="bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 text-white font-bold shadow-md"
                                onClick={navigateToUpgrade} // Use the navigation handler
                                >
                                <Zap className="mr-2 h-4 w-4" /> Upgrade to Pro
                             </Button>
                        )}
                    </div>
                    {/* Profile details */}
                    {profile ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm md:text-base text-gray-700">
                            <p><strong>Goal:</strong> <span className="font-medium">{profile.goal === 'lose' ? 'Lose Weight' : profile.goal === 'gain' ? 'Gain Weight' : 'Maintain Weight'}</span></p>
                            {typeof profile.currentWeight === 'number' && <p><strong>Starting W:</strong> <span className="font-medium">{profile.currentWeight} kg</span></p>}
                            {typeof profile.targetWeight === 'number' && <p><strong>Target W:</strong> <span className="font-medium">{profile.targetWeight} kg</span></p>}
                            {profile.activityLevel && <p><strong>Activity:</strong> <span className="font-medium">{profile.activityLevel}</span></p>}
                            {profile.dietaryPreference && <p><strong>Diet:</strong> <span className="font-medium">{profile.dietaryPreference}</span></p>}
                        </div>
                     ) : (
                        <p className="text-gray-500">Profile details could not be loaded. Please complete onboarding.</p>
                     )}
                    <div className="mt-4"> <Link href="/onboarding"> <Button variant="outline" size="sm" className="border-green-600 text-green-700 hover:bg-green-50 hover:text-green-800"> Update Profile/Goal </Button> </Link> </div>
                 </>
             )}
          </div>

          {/* --- Action Grid --- */}
          {!isDashboardLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
              {/* Log Exercise Card */}
              <div className="bg-white p-5 rounded-xl shadow hover:shadow-lg transition border border-gray-100 flex flex-col">
                <h3 className="font-bold text-lg text-red-600 mb-3">📅 Log Exercise</h3>
                {exerciseLogError && <p className="text-xs text-red-600 mb-2">{exerciseLogError}</p>}
                <div className="text-sm text-gray-600 space-y-3 flex-grow flex flex-col justify-between">
                  <div>
                    <Input placeholder="Exercise Type (e.g., Running)" value={exerciseType} onChange={(e) => { setExerciseType(e.target.value); setExerciseLogError(null); }} disabled={isLoggingExercise} className="w-full border px-3 py-2 rounded-md text-sm"/>
                    <Input placeholder="Duration (minutes)" type="number" value={duration} onChange={(e) => { setDuration(e.target.value); setExerciseLogError(null); }} disabled={isLoggingExercise} className="w-full border px-3 py-2 rounded-md text-sm mt-3" min="1"/>
                  </div>
                  <Button onClick={handleExerciseSubmit} disabled={isLoggingExercise || !exerciseType.trim() || !duration.trim()} className="w-full bg-red-500 hover:bg-red-600 text-white text-sm py-2 mt-3" size="sm">
                    {isLoggingExercise ? <Icons.spinner className="mr-2 h-4 w-4 animate-spin" /> : 'Add Exercise'}
                  </Button>
                </div>
              </div>

              {/* Log Weight Card */}
              <div className="bg-white p-5 rounded-xl shadow hover:shadow-lg transition border border-gray-100 flex flex-col">
                 <h3 className="font-bold text-lg text-purple-700 mb-3">⚖️ Log Your Weight</h3>
                 <p className="text-xs text-gray-500 mb-3">Update periodically to track progress.</p>
                 <div className="text-sm text-gray-600 space-y-3 flex-grow flex flex-col justify-between">
                  <div>
                  <Input placeholder="Current weight in kg" type="number" value={currentWeightLog} onChange={(e) => { setCurrentWeightLog(e.target.value); setLogWeightError(null); }} disabled={isLoggingWeight}/>
                  {logWeightSuccess && <p className="text-xs text-green-600 mt-1">{logWeightSuccess}</p>}
                  {logWeightError && <p className="text-xs text-red-600 mt-1">{logWeightError}</p>}
                  </div>
                   <Button onClick={handleLogWeightSubmit} disabled={isLoggingWeight || !currentWeightLog.trim()} className="w-full bg-purple-600 hover:bg-purple-700 text-white text-sm py-2 mt-3" size="sm">
                     {isLoggingWeight ? <Icons.spinner className="mr-2 h-4 w-4 animate-spin" /> : 'Save Weight'}
                   </Button>
                 </div>
              </div>

              {/* Exercise Duration Chart Card */}
              <div className="bg-white p-5 rounded-xl shadow hover:shadow-lg transition border border-gray-100 flex flex-col">
                <div className="flex justify-between items-center mb-3">
                     <h3 className="font-bold text-lg text-indigo-700">⏱️ Exercise Activity</h3>
                     <div className="flex items-center space-x-1">
                        <Button onClick={handlePreviousWeek} variant="ghost" size="icon" className="h-7 w-7" title="Previous Week"><ChevronLeft className="h-5 w-5" /></Button>
                        <span className="text-xs font-medium text-gray-600 w-32 text-center tabular-nums">{formatDateRange(viewedWeekStart)}</span>
                        <Button onClick={handleGoToThisWeek} variant="ghost" size="icon" className="h-7 w-7" disabled={isViewingCurrentWeek} title="Go to Current Week"><CalendarClock className={`h-5 w-5 ${isViewingCurrentWeek ? 'text-gray-400' : ''}`}/></Button>
                     </div>
                  </div>
                <div className="flex-grow h-64">
                    {isLoadingExercises ? (
                        <div className="flex items-center justify-center h-full"><Icons.spinner className="h-8 w-8 animate-spin text-indigo-600" /></div>
                    ) : (
                        <ExerciseBarChart
                            data={allExercises}
                            weekStartDate={viewedWeekStart}
                        />
                    )}
                </div>
              </div>
            </div>
           )}

          {/* --- AI Sections --- */}
          {!isDashboardLoading && (
            <div className="mt-8 md:mt-10 space-y-8">
                {/* Weekly Summary Section -> Navigates to /upgrade */}
                <div className="text-center mb-8">
                    {isPro ? (
                        <> {/* Pro User: Show Weekly Summary Feature */}
                           {profile && ( <Button onClick={handleFetchWeeklySummary} disabled={isFetchingWeekly} variant="secondary" > {isFetchingWeekly ? (<> <Icons.spinner className="mr-2 h-4 w-4 animate-spin" /> Generating Summary... </>) : ( "📅 Get Weekly Summary & Tips" )} </Button> )}
                           {weeklySummary && !isFetchingWeekly && ( <div className="mt-4 bg-gray-100 p-4 rounded-lg text-left max-w-2xl mx-auto shadow-sm border border-gray-200"> <h4 className="font-semibold mb-2 text-gray-700 text-center">Your Weekly Insight</h4> <p className="text-sm text-gray-600 whitespace-pre-wrap">{weeklySummary}</p> </div> )}
                           {weeklyError && !isFetchingWeekly && ( <p className="mt-4 text-red-600 text-sm">{weeklyError}</p> )}
                        </>
                    ) : (
                        <> {/* Free User: Show Upgrade message for Weekly Summary */}
                            <h3 className="text-lg font-semibold text-gray-700 mb-3">📅 Weekly Summary & Tips</h3>
                            <p className="text-sm text-center text-gray-600 mb-4">Get a personalized summary of your week, including progress insights and actionable tips, by upgrading to Pro.</p>
                            <Button
                               size="sm"
                               className="mx-auto bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 text-white font-bold shadow-md"
                               onClick={navigateToUpgrade} // Use the navigation handler
                               >
                               <Zap className="mr-2 h-4 w-4" /> Upgrade to Pro
                            </Button>
                        </>
                    )}
                </div>

                {/* Daily Advice Section -> Navigates to /upgrade */}
                 <div className="bg-gradient-to-r from-blue-50 to-green-50 p-6 rounded-xl shadow-md border border-blue-100 min-h-[100px] flex flex-col justify-center">
                     {isPro ? (
                         <> {/* Pro User: Show advice */}
                            {isFetchingDailyAdvice ? ( <div className="text-center"><Icons.spinner className="h-5 w-5 animate-spin text-blue-600 mx-auto"/> <span className="ml-2 text-blue-700 text-sm">Getting your daily tip...</span></div> )
                            : dailyAdvice ? ( <> <h3 className="text-lg font-semibold text-blue-800 mb-3 text-center">💡 Daily Tip & Encouragement</h3> <p className="text-sm text-gray-700 mb-3">{dailyAdvice.advice}</p> <p className="text-sm font-medium text-green-700 mb-3">{dailyAdvice.encouragement}</p> {dailyAdvice.alert && <p className="text-sm text-yellow-800 bg-yellow-100 border border-yellow-300 p-2 rounded font-semibold">Alert: {dailyAdvice.alert}</p>} </> )
                            : profile ? ( <div className="text-center"> <p className="text-sm text-gray-500">Complete your profile fully during onboarding to receive daily tips!</p> </div> )
                            : !profile ? ( <div className="text-center"> <p className="text-sm text-gray-500">Could not load profile data to generate tips.</p> </div> )
                            : null
                            }
                         </>
                     ) : (
                         <> {/* Free User: Show Upgrade message */}
                             <h3 className="text-lg font-semibold text-blue-800 mb-3 text-center">💡 Daily Tip & Encouragement</h3>
                             <p className="text-sm text-center text-gray-600 mb-4">Unlock personalized daily advice and insights by upgrading to Pro.</p>
                             <Button
                                size="sm"
                                className="mx-auto bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 text-white font-bold shadow-md"
                                onClick={navigateToUpgrade} // Use the navigation handler
                                >
                               <Zap className="mr-2 h-4 w-4" /> Upgrade to Pro
                            </Button>
                         </>
                     )}
                 </div>
            </div>
          )}

           {/* --- PWA Prompt Component --- */}
           {!isDashboardLoading && <PwaPrompt />}

        </div> {/* End max-width container */}
      </main>

      {/* --- Footer --- */}
      <Footer />

      {/* --- Chatbot Trigger & Container --- */}
      {authUser && !isChatboxOpen && ( <Button onClick={toggleChatbox} className="fixed bottom-6 right-6 z-50 rounded-full p-0 h-14 w-14 shadow-lg bg-green-600 hover:bg-green-700 text-white flex items-center justify-center" aria-label="Open AI Chat" title="Chat with AI" > <MessageSquare size={28} /> </Button> )}
      <div className={`fixed bottom-24 right-6 z-40 transition-all duration-300 ease-out ${isChatboxOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
          {isChatboxOpen && authUser && profile && ( <AiChatbox userId={authUser.uid} userProfile={profile} isOpen={isChatboxOpen} onClose={toggleChatbox} /> )}
      </div>

    </div> // End main background div
  );
}
