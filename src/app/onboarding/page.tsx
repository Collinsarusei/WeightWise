// src/app/onboarding/page.tsx

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase/config';
import { doc, setDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Icons } from "@/components/icons";
import { useAuth } from '@/components/AuthProvider'; // Import useAuth hook

const goals = [
  { label: "Lose Weight", value: "lose" },
  { label: "Gain Weight", value: "gain" },
  { label: "Maintain Weight", value: "maintain" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { toast } = useToast();
  // Get loading state from AuthProvider (covers initial load and redirect transitions)
  const { user, loading: authLoading } = useAuth();

  const [selectedGoal, setSelectedGoal] = useState('');
  const [currentWeight, setCurrentWeight] = useState('');
  const [targetWeight, setTargetWeight] = useState('');
  const [activityLevel, setActivityLevel] = useState('');
  const [dietaryPreference, setDietaryPreference] = useState('');
  // Local loading state specifically for the form submission process
  const [isSubmitting, setIsSubmitting] = useState(false); 

  const handleSubmit = async () => {
    // Use user from useAuth hook
    if (!user) {
        toast({ title: "Error", description: "User not logged in.", variant: "destructive" });
        return;
    }
    // Validation...
    if (!selectedGoal || !currentWeight || !targetWeight || !activityLevel || !dietaryPreference) {
        toast({ title: "Incomplete Form", description: "Please fill out all fields.", variant: "destructive" });
        return;
    }
    const current = parseFloat(currentWeight);
    const target = parseFloat(targetWeight);
    if (isNaN(current) || current <= 0 || isNaN(target) || target <= 0) {
        toast({ title: "Invalid Weight", description: "Please enter valid positive numbers for weight.", variant: "destructive" });
        return;
    }
    if (
      (selectedGoal === 'lose' && target >= current) ||
      (selectedGoal === 'gain' && target <= current) ||
      (selectedGoal === 'maintain' && target !== current)
    ) {
      toast({ title: "Goal Mismatch", description: "Please ensure your target weight aligns with your selected goal (target = current for 'maintain').", variant: "destructive" });
      return;
    }

    setIsSubmitting(true); // Start local loading for form submission

    try {
      await setDoc(doc(db, "users", user.uid), {
        email: user.email, 
        goal: selectedGoal,
        currentWeight: current,
        targetWeight: target,
        activityLevel: activityLevel,
        dietaryPreference: dietaryPreference,
        username: user.displayName || '',
        onboardingComplete: true, 
      }, { merge: true }); 

      toast({ title: "Profile Saved!", description: "Redirecting to your dashboard..." }); 
      // No explicit router.push here - AuthProvider handles redirect after state update

    } catch (err: any) {
      console.error("Failed to save onboarding data:", err);
      toast({ title: "Error", description: `Failed to save data: ${err.message}`, variant: "destructive" });
      setIsSubmitting(false); // Stop local loading on error
    } 
    // Don't set isSubmitting(false) on success, let the redirect happen
  };

  // Show loading if AuthProvider is initially loading OR if we are submitting the form
  const showOverallLoading = authLoading || isSubmitting;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-purple-100">
      <div className="bg-white rounded-xl p-6 sm:p-8 shadow-lg max-w-md w-full space-y-4">
        <h1 className="text-2xl font-bold text-gray-800 text-center">Set Your Goal</h1>
        <p className="text-sm text-gray-600 text-center pb-2">Tell us about your goals and preferences.</p>

        {/* Show form only when NOT loading */}
        {!showOverallLoading ? (
            <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="space-y-4">

              {/* Goal Selection */}
              <fieldset className="space-y-2">
                 <legend className="text-sm font-medium text-gray-700 sr-only">Primary Goal</legend>
                 <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {goals.map(goal => (
                      <Button
                          key={goal.value}
                          type="button" 
                          onClick={() => setSelectedGoal(goal.value)}
                          variant={selectedGoal === goal.value ? 'default' : 'outline'}
                          className="w-full text-xs sm:text-sm"
                      >
                          {goal.label}
                      </Button>
                      ))}
                 </div>
              </fieldset>

              {/* Weight Inputs */}
               <div className="grid grid-cols-2 gap-3">
                  <Input
                      type="number"
                      placeholder="Current Wt (kg)"
                      aria-label="Current Weight in kg"
                      value={currentWeight}
                      onChange={(e) => setCurrentWeight(e.target.value)}
                      min="1"
                      className="border p-2 rounded-md"
                      required
                  />
                  <Input
                      type="number"
                      placeholder="Target Wt (kg)"
                      aria-label="Target Weight in kg"
                      value={targetWeight}
                      onChange={(e) => setTargetWeight(e.target.value)}
                      min="1"
                      className="border p-2 rounded-md"
                      required
                  />
              </div>

              {/* Select Dropdowns */}
              <div className="grid grid-cols-2 gap-3">
                  <select
                      className="w-full border p-2 rounded-md bg-white text-sm"
                      aria-label="Activity Level"
                      value={activityLevel}
                      onChange={(e) => setActivityLevel(e.target.value)}
                      required
                      >
                      <option value="" disabled>Activity Level</option>
                      <option value="sedentary">Sedentary</option>
                      <option value="light">Light</option>
                      <option value="moderate">Moderate</option>
                      <option value="active">Active</option>
                      <option value="very_active">Very Active</option>
                  </select>

                  <select
                      className="w-full border p-2 rounded-md bg-white text-sm"
                      aria-label="Dietary Preference"
                      value={dietaryPreference}
                      onChange={(e) => setDietaryPreference(e.target.value)}
                      required
                      >
                      <option value="" disabled>Diet Preference</option>
                      <option value="omnivore">Omnivore</option>
                      <option value="vegetarian">Vegetarian</option>
                      <option value="vegan">Vegan</option>
                      <option value="pescatarian">Pescatarian</option>
                      <option value="keto">Keto</option>
                  </select>
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                className="mt-4 w-full bg-green-600 hover:bg-green-700 text-white"
                 disabled={!selectedGoal || !currentWeight || !targetWeight || !activityLevel || !dietaryPreference}
              >
                Continue to Dashboard
              </Button>
            </form>
        ) : ( /* Show loading indicator if auth is loading OR form is submitting */
            <div className="flex justify-center items-center p-4 text-sm text-gray-600">
              <Icons.spinner className="mr-2 h-5 w-5 animate-spin text-primary" />
              <span>{authLoading ? 'Loading user data...' : 'Saving profile...'}</span> 
            </div>
        )}
      </div>
    </div>
  );
}
