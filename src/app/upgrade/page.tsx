// src/app/upgrade/page.tsx

'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter
} from '@/components/ui/card';
import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useToast } from '@/hooks/use-toast';

// --- Configuration: Define Plan Details ---
const plans = [
  {
    name: 'Free',
    monthlyPriceNum: 0,
    yearlyPriceNum: 0,
    monthlyPrice: 'KES 0 / month', // Display text
    yearlyPrice: 'KES 0 / year', // Display text
    currency: 'KES', 
    description: 'Basic features, free forever.',
    details: [
      'Basic weight tracking',
      'Standard exercise logging',
      'No AI advice',
    ],
    cta: 'Current Plan',
    disabled: true,
  },
  {
    name: 'Premium',
    monthlyPriceNum: 390,    // KES
    yearlyPriceNum: 3900,   // KES
    monthlyPrice: 'KES 390 / month',
    yearlyPrice: 'KES 3900 / year',
    currency: 'KES', // Set currency to KES
    description: 'Unlock AI insights & detailed analytics.',
    details: [
      'Basic weight tracking',
      'Standard exercise logging',
      'Personalized AI advice',
      'Detailed analytics',
      'Advanced goal setting',
    ],
    cta: 'Upgrade to Premium',
    disabled: false,
  },
];
// --- End Configuration ---

// --- Interface for Cloud Function Result ---
interface InitiatePaystackPaymentResult {
  authorization_url?: string;
  access_code?: string;
  reference?: string;
}
// --- End Interface ---

const UpgradePage = () => {
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState<'monthly' | 'yearly' | null>(null);

  /**
   * Handles the click on an upgrade button.
   */
  const handleUpgrade = async (planName: string, billingCycle: 'monthly' | 'yearly') => {
    // 1. Check Authentication
    if (!user) {
      toast({ title: 'Authentication Required', description: 'Please log in to upgrade.', variant: 'destructive' });
      router.push('/login');
      return;
    }

    // 2. Find the selected plan details
    const selectedPlan = plans.find(p => p.name === planName);
    if (!selectedPlan || selectedPlan.name === 'Free') {
      console.error('Invalid plan selected for upgrade');
      toast({ title: 'Error', description: 'Invalid plan selected.', variant: 'destructive' });
      return;
    }

    // 3. Set loading state
    setLoading(billingCycle);

    try {
      // 4. Get Firebase Functions instance and reference the Paystack function
      const functionsInstance = getFunctions();
      const initiatePayment = httpsCallable(functionsInstance, 'initiatePaystackPayment');

      // 5. Determine base numerical amount and currency
      const amountNum = billingCycle === 'monthly' ? selectedPlan.monthlyPriceNum : selectedPlan.yearlyPriceNum;
      const currency = selectedPlan.currency; // Will be 'KES'

      // 6. Validate amount
      if (typeof amountNum !== 'number' || isNaN(amountNum) || amountNum < 0) {
        console.error('Invalid amount configured:', amountNum);
        toast({ title: 'Configuration Error', description: 'Invalid plan price configured.', variant: 'destructive' });
        setLoading(null);
        return;
      }

      // 7. Prepare payload for backend
      const paymentData = {
        amount: amountNum, // Send the KES amount (e.g., 390)
        currency: currency, // Send 'KES'
        billingCycle: billingCycle,
      };

      console.log(`Calling initiatePaystackPayment with payload:`, paymentData);

      // 8. Call the Cloud Function
      const result = await initiatePayment(paymentData) as { data: InitiatePaystackPaymentResult };

      console.log('Cloud Function call successful. Result:', result);

      // 9. Process Paystack result (check for authorization_url)
      if (result?.data?.authorization_url) {
        console.log("Redirecting to Paystack Checkout URL:", result.data.authorization_url);
        // Redirect user to Paystack checkout page
        window.location.href = result.data.authorization_url;
      } else {
        console.error("Authorization URL missing in function response:", result);
        throw new Error('Payment link could not be generated. Please try again.');
      }

    } catch (error: any) {
      // 10. Handle errors
      console.error('Upgrade process failed:', error);
      const firebaseErrorMessage = error.details?.message || error.message;
      const displayMessage = firebaseErrorMessage || 'An unexpected error occurred. Please try again later.';
      toast({
        title: 'Upgrade Failed',
        description: `Could not initiate payment: ${displayMessage}`,
        variant: 'destructive',
      });
      setLoading(null);
    }
  };

  // --- Render JSX ---
  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-center mb-2 text-gray-800">Choose Your Plan</h1>
      <p className="text-center text-gray-500 mb-10">Select the plan that best fits your fitness goals.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
        {plans.map((plan) => (
          <Card key={plan.name} className={`flex flex-col rounded-lg border shadow-md hover:shadow-lg transition-shadow duration-300 ${plan.disabled ? 'opacity-70 bg-gray-50' : 'bg-white'}`}>
            <CardHeader className="pb-4">
              <CardTitle className="text-2xl font-semibold text-gray-700">{plan.name}</CardTitle>
              <CardDescription className="text-gray-500 pt-1 h-10">
                {plan.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-grow pt-2 pb-6">
              <ul className="space-y-2.5">
                {plan.details.map((detail, index) => (
                  <li key={index} className="flex items-start text-sm text-gray-700">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mr-2.5 flex-shrink-0 mt-px" />
                    <span>{detail}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter className="flex flex-col sm:flex-row sm:justify-center items-center gap-3 pt-5 pb-5 border-t bg-gray-50/50 rounded-b-lg">
              {plan.name === 'Free' ? (
                <Button variant="secondary" disabled={plan.disabled} className="sm:w-auto font-medium">
                  {plan.cta}
                </Button>
              ) : (
                <>
                  {/* Monthly Upgrade Button */}
                  <Button
                    size="lg"
                    onClick={() => handleUpgrade(plan.name, 'monthly')}
                    disabled={loading === 'monthly' || loading === 'yearly'}
                    className="sm:w-auto bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white shadow hover:shadow-md"
                  >
                    {loading === 'monthly' ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    {plan.monthlyPrice}
                  </Button>

                  {/* Yearly Upgrade Button */}
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => handleUpgrade(plan.name, 'yearly')}
                    disabled={loading === 'yearly' || loading === 'monthly'}
                    className="sm:w-auto shadow hover:shadow-md"
                  >
                    {loading === 'yearly' ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    {plan.yearlyPrice}
                  </Button>
                </>
              )}
            </CardFooter>
          </Card>
        ))}
      </div>
      {/* Footer Text */}
      <div className="text-center mt-10 text-sm text-gray-500 flex items-center justify-center gap-2">
        <ShieldCheck className="h-4 w-4 text-green-600" />
        <span>Payments processed securely via Paystack.</span>
      </div>
      <p className="text-center mt-2 text-xs text-gray-400">
         You can manage your subscription anytime from your account settings (feature coming soon).
      </p>
    </div>
  );
};

export default UpgradePage;
