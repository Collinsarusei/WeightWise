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
  // Get loading and isTransitioning states from AuthProvider
  const { loading: authLoading, isTransitioning } = useAuth();

  const [selectedGoal, setSelectedGoal] = useState('');
  const [currentWeight, setCurrentWeight] = useState('');
  const [targetWeight, setTargetWeight] = useState('');
  const [activityLevel, setActivityLevel] = useState('');
  const [dietaryPreference, setDietaryPreference] = useState('');
  const [isLoading, setIsLoading] = useState(false); // Local loading state for form submission

  const handleSubmit = async () => {
    const user = auth.currentUser;
    if (!user) {
        toast({ title: "Error", description: "User not logged in.", variant: "destructive" });
        return;
    }
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

    // Validation based on goal
    if (
      (selectedGoal === 'lose' && target >= current) ||
      (selectedGoal === 'gain' && target <= current) ||
      (selectedGoal === 'maintain' && target !== current)
    ) {
      toast({ title: "Goal Mismatch", description: "Please ensure your target weight aligns with your selected goal (target = current for 'maintain').", variant: "destructive" });
      return;
    }

    setIsLoading(true); // Start local loading for form submission

    try {
      await setDoc(doc(db, "users", user.uid), {
        // Keep existing fields
        email: user.email, // Good practice to keep email if available
        goal: selectedGoal,
        currentWeight: current,
        targetWeight: target,
        activityLevel: activityLevel,
        dietaryPreference: dietaryPreference,
        username: user.displayName || '', // Add username if available
        onboardingComplete: true, // Mark onboarding as complete

      }, { merge: true }); // Use merge: true to avoid overwriting other potential fields

      toast({ title: "Success", description: "Profile updated. Redirecting..." }); // Updated message
      // The redirect is handled by AuthProvider's useEffect after it detects onboardingComplete change

    } catch (err: any) {
      console.error("Failed to save onboarding data:", err);
      toast({ title: "Error", description: `Failed to save data: ${err.message}`, variant: "destructive" });
    } finally {
      setIsLoading(false); // Stop local loading after submit attempt
    }
  };

  // Determine if we should show a global loading state instead of the form
  // This happens during initial auth loading OR when AuthProvider is transitioning after submission
  const showOverallLoading = authLoading || isTransitioning;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-purple-100">
      <div className="bg-white rounded-xl p-6 sm:p-8 shadow-lg max-w-md w-full space-y-4">
        <h1 className="text-2xl font-bold text-gray-800 text-center">Set Your Goal</h1>
        <p className="text-sm text-gray-600 text-center pb-2">Tell us about your goals and preferences.</p>

        {/* Show overall loading if AuthProvider is loading initially or transitioning */}
        {showOverallLoading ? (
            <div className="flex justify-center items-center p-4 text-sm text-gray-600">
              <Icons.spinner className="mr-2 h-5 w-5 animate-spin text-primary" />
              <span>Processing data or Redirecting...</span> {/* More general message */}
            </div>
        ) : ( /* Show form only when not in an overall loading state */
            <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="space-y-4">

              {/* Goal Selection */}
              <fieldset className="space-y-2">
                 <legend className="text-sm font-medium text-gray-700 sr-only">Primary Goal</legend>
                 <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {goals.map(goal => (
                      <Button
                          key={goal.value}
                          type="button" // Important: Prevent button from submitting form
                          onClick={() => setSelectedGoal(goal.value)}
                          variant={selectedGoal === goal.value ? 'default' : 'outline'}
                          className="w-full text-xs sm:text-sm"
                          disabled={showOverallLoading} // Disable during overall loading
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
                      disabled={showOverallLoading} // Disable during overall loading
                  />
                  <Input
                      type="number"
                      placeholder="Target Wt (kg)"
                      aria-label="Target Weight in kg"
                      value={targetWeight}
                      onChange={(e) => setTargetWeight(e.target.value)}
                      min="1"
                      className="border p-2 rounded-md"
                       disabled={showOverallLoading} // Disable during overall loading
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
                      disabled={showOverallLoading} // Disable during overall loading
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
                       disabled={showOverallLoading} // Disable during overall loading
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
                type="submit" // Set type to submit for the form
                className="mt-4 w-full bg-green-600 hover:bg-green-700 text-white"
                 disabled={showOverallLoading || !selectedGoal || !currentWeight || !targetWeight || !activityLevel || !dietaryPreference}
              >
                {/* Show local loading spinner only if submitting and not overall loading */}
                {isLoading && !showOverallLoading ? <Icons.spinner className="mr-2 h-4 w-4 animate-spin" /> : null}
                Continue to Dashboard
              </Button>
            </form>
        )}
      </div>
    </div>
  );
}
