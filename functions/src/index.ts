import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import {Resend} from "resend";
import axios, {isAxiosError} from "axios";
import * as crypto from "crypto";
import {CallableContext} from "firebase-functions/v1/https";

// Initialize Firebase Admin SDK
admin.initializeApp();

// Get Resend API key
const resendApiKey = functions.config().resend?.apikey;
let resend: Resend | null = null;
if (resendApiKey) {
  resend = new Resend(resendApiKey);
  functions.logger.info("Resend client initialized.");
} else {
  functions.logger.error(
    "Resend API key is not configured in Firebase Functions."
  );
}

// --- Paystack Configuration ---
const paystackSecretKey = functions.config().paystack?.secret_key;
const paystackWebhookSecret = functions.config().paystack?.webhook_secret;

if (!paystackSecretKey) {
  functions.logger.error(
    "Paystack Secret Key (paystack.secret_key) is not configured."
  );
}
if (!paystackWebhookSecret) {
  functions.logger.warn(
    "Paystack Webhook Secret (paystack.webhook_secret) is not configured. " +
    "Webhook verification will fail."
  );
}
// --- End Paystack Configuration ---

// --- Email Sending Logic ---
interface EmailOptions { to: string; subject:
  string; html: string; text?: string; }
const fromEmail = "onboarding@resend.dev";
/**
 * Sends an email using the configured Resend client.
 * @param {EmailOptions} options The email options.
 * @return {Promise<void>} A promise that resolves when the email is sent.
 * @throws {Error} If Resend is not initialized or email sending fails.
 */
async function sendEmail(options: EmailOptions): Promise<void> {
  if (!resend) {
    throw new Error("Email service not configured.");
  }
  try {
    const {data, error} = await resend.emails.send({from:
      fromEmail, ...options});
    if (error) {
      functions.logger.error(`Resend error sending to ${options.to}:`, error);
      throw new Error(`Failed to send email: ${error.message}`);
    }
    functions.logger.info(
      `Email sent successfully to ${options.to} via Resend. ID: ${data?.id}`
    );
  } catch (err) {
    functions.logger.error(`Unexpected error in sendEmail to ${options.to}:`,
      err);
    throw err; // Re-throw original error after logging
  }
}
interface WeeklyReportData { totalCaloriesBurned: number;
  totalWorkouts: number; }
interface WeeklyReportEmailProps { userEmail: string; userName?:
  string; reportData: WeeklyReportData; }
/**
 * Constructs and sends the weekly fitness report email.
 * @param {WeeklyReportEmailProps} props The properties for the email.
 * @return {Promise<void>} A promise that resolves when the email is sent.
 * @throws {Error} If sending the email fails.
 */
async function sendWeeklyReportEmail({userEmail, userName, reportData}:
  WeeklyReportEmailProps): Promise<void> {
  const subject = "Your Weekly Fitness Summary";
  const name = userName || "Fitness Enthusiast";
  const html = `
    <h1>Hi ${name},</h1>
    <p>Here's your fitness summary for the past week:</p>
    <ul>
      <li>Total Workouts: ${reportData.totalWorkouts}</li>
      <li>Total Calories Burned: ${reportData.totalCaloriesBurned} kcal</li>
    </ul>
    <p>Keep up the great work!</p>
    <p>Best,</p>
    <p>The WeightWise App Team</p>
  `;
  const text = `
    Hi ${name},
    Here's your fitness summary for the past week:
    - Total Workouts: ${reportData.totalWorkouts}
    - Total Calories Burned: ${reportData.totalCaloriesBurned} kcal
    Keep up the great work!
    Best,
    The WeightWise App Team
  `;
  await sendEmail({to: userEmail, subject: subject, html: html, text: text});
  functions.logger.info(`Weekly report email queued for ${userEmail}`);
}

// --- Scheduled Function for Weekly Reports ---
interface ScheduledFunctionContext { timestamp: string; }

export const sendWeeklyFitnessReports = functions.pubsub
  .schedule("every sunday 09:00")
  .timeZone("Africa/Nairobi")
  .onRun(async (context: ScheduledFunctionContext) => {
    functions.logger.info(
      "Starting weekly fitness report job.",
      {timestamp: context.timestamp}
    );

    if (!resend) {
      functions.logger.error("Resend client not initialized. Aborting job.");
      return null;
    }

    const db = admin.firestore();
    const usersRef = db.collection("users");
    let usersProcessed = 0;
    let emailsSent = 0;
    const errors: { userId: string; error: string }[] = [];

    try {
      const snapshot = await usersRef.get();

      if (snapshot.empty) {
        functions.logger.info("No users found. Exiting job.");
        return null;
      }

      functions.logger.info(`Found ${snapshot.size} users to process.`);

      for (const userDoc of snapshot.docs) {
        const userData = userDoc.data();
        const userId = userDoc.id;
        usersProcessed++;

        if (!userData.email) {
          functions.logger.warn(`User ${userId} missing email. Skipping.`);
          continue;
        }

        try {
          // Placeholder: Fetch & Calculate Weekly Data
          functions.logger.info(
            `Fetching data for user ${userId}... (Placeholder)`
          );
          const mockWeeklyData: WeeklyReportData = {
            totalCaloriesBurned: Math.floor(Math.random() * 1500) + 500,
            totalWorkouts: Math.floor(Math.random() * 5) + 1,
          };
          const reportData: WeeklyReportData = mockWeeklyData;

          await sendWeeklyReportEmail({
            userEmail: userData.email,
            userName: userData.username,
            reportData: reportData,
          });
          emailsSent++;
        } catch (userError: unknown) {
          const errorMessage =
            userError instanceof Error ? userError.message : "Unknown error";
          functions.logger.error(
            `Failed processing user ${userId} (${userData.email}):`,
            errorMessage,
            userError
          );
          errors.push({userId, error: errorMessage});
        }
      }

      functions.logger.info(
        `Report job finished. Processed: ${usersProcessed}, ` +
        `Sent: ${emailsSent}, Errors: ${errors.length}`
      );
      if (errors.length > 0) {
        functions.logger.error("Errors during report generation:", errors);
      }
      return null;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      functions.logger.error(
        "Critical error running weekly report job:",
        errorMessage,
        error
      );
      return null;
    }
  });

// --- Paystack Payment Initiation Function ---

interface InitiatePaymentData {
  amount: number; // Expecting amount in major unit (e.g., 299 for KES 299)
  currency: string; // Expecting currency code (e.g., KES)
  billingCycle: "monthly" | "yearly";
}

interface InitiatePaymentResult {
  authorization_url?: string; // Paystack returns authorization_url
  access_code?: string;
  reference?: string;
}

const initiateProUpgradePaymentHandler = async (
  data: InitiatePaymentData,
  context: CallableContext
): Promise<InitiatePaymentResult> => {
  if (!context.auth) {
    functions.logger.error("initiatePaystackPayment: Unauthenticated call.");
    throw new functions.https.HttpsError(
      "unauthenticated", "The function must be called while authenticated."
    );
  }

  if (!paystackSecretKey) {
    functions.logger.error("initiatePaystackPayment:" +
       "Paystack Secret Key missing.");
    throw new functions.https.HttpsError(
      "internal", "Payment gateway configuration error."
    );
  }

  const userId = context.auth.uid;
  const userEmail = context.auth.token.email;
  const {amount, currency, billingCycle} = data;

  // Validate inputs
  if (!userEmail) {
    functions.logger.error("User email is missing in auth token.");
    throw new functions.https.HttpsError("internal", "User email not found.");
  }
  // Amount from frontend is in KES, ensure it's a positive number
  if (typeof amount !== "number" || isNaN(amount) || amount <= 0 ) {
    throw new functions.https.HttpsError("invalid-argument",
      "Amount must be a positive number representing the value in KES.");
  }
  if (currency !== "KES") {
    throw new functions.https.HttpsError("invalid-argument",
      "Currency must be KES.");
  }
  if (billingCycle !== "monthly" && billingCycle !== "yearly") {
    throw new functions.https.HttpsError("invalid-argument",
      "Invalid billing cycle specified.");
  }

  // --- FIX: Convert KES amount to smallest unit (Kobo) for Paystack ---
  const amountInKobo = Math.round(amount * 100);
  functions.logger.info(
    `Converting amount for Paystack:
     ${amount} ${currency} -> ${amountInKobo} Kobo`
  );
  // --- End Fix ---

  // Generate a unique reference for this transaction
  const reference = `PRO_${billingCycle.toUpperCase()}_${userId}_${Date.now()}`;

  // Prepare Paystack API request body
  const apiRequestBody = {
    email: userEmail,
    amount: amountInKobo, // Send amount in Kobo (e.g., 29900)
    currency: currency, // Should be 'KES'
    reference: reference,
    metadata: {
      user_id: userId,
      plan: "premium",
      billing_cycle: billingCycle,
      custom_fields: [
        {display_name: "User ID", variable_name: "user_id", value: userId},
        {display_name: "Plan", variable_name: "plan",
          value: `Premium (${billingCycle})`},
      ],
    },
    // callback_url: `https://weightwise-6d4bb.web.app/dashboard?payment_ref=${reference}` // Optional
  };

  functions.logger.info(
    "initiatePaystackPayment: Preparing Paystack transaction init request:",
    apiRequestBody
  );

  const paystackApiUrl = "https://api.paystack.co/transaction/initialize";

  try {
    // Define expected Paystack response structure
    interface PaystackInitResponse {
      status: boolean;
      message: string;
      data?: {
        authorization_url?: string;
        access_code?: string;
        reference?: string;
      };
    }

    const response = await axios.post<PaystackInitResponse>(
      paystackApiUrl,
      apiRequestBody, // Contains amountInKobo
      {
        headers: {
          "Authorization": `Bearer ${paystackSecretKey}`,
          // Use Paystack Secret Key
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
      }
    );

    functions.logger.info(
      "initiatePaystackPayment: Paystack API response received",
      {status: response.status, data: response.data}
    );

    // Check Paystack response status and data presence
    if (response.data && response.data.status &&
      response.data.data?.authorization_url) {
      functions.logger.info(
        "initiatePaystackPayment: Paystack authorization URL generated:",
        response.data.data.authorization_url
      );
      return {
        authorization_url: response.data.data.authorization_url,
        access_code: response.data.data.access_code,
        reference: response.data.data.reference,
      };
    } else {
      functions.logger.error(
        "initiatePaystackPayment: Auth URL not found in Paystack response.",
        response.data?.message || "Unknown error from Paystack API.",
        response.data // Log full response data
      );
      throw new functions.https.HttpsError(
        "internal",
        response.data?.message || "Failed to initialize Paystack transaction."
      );
    }
  } catch (error: unknown) {
    let errorMessage = "Could not initiate payment.";
    let errorDetails: unknown = null;
    if (isAxiosError(error)) {
      errorMessage = `Paystack API Error: ${error.message}`;
      errorDetails = error.response?.data;
      // Paystack often includes details here
      functions.logger.error(
        "initiatePaystackPayment: Axios Error calling Paystack API:",
        {message: error.message, data: errorDetails}
      );
    } else if (error instanceof Error) {
      errorMessage = error.message;
      functions.logger.error("initiatePaystackPayment: Unexpected Error:",
        error);
    } else {
      functions.logger.error("initiatePaystackPayment: Unknown Error:", error);
    }
    throw new functions.https.HttpsError("internal",
      errorMessage, errorDetails);
  }
};

// Rename and export the Paystack payment initiation function
export const initiatePaystackPayment = functions.https.onCall(
  initiateProUpgradePaymentHandler
);

// --- Paystack Webhook Handler Function ---

/**
 * Handles incoming HTTPS requests from Paystack webhooks.
 * Verifies the signature and processes successful payment events.
 */
export const handlePaystackWebhook = functions.https.onRequest(
  async (req, res): Promise<void> => {
    functions.logger.info("handlePaystackWebhook: Received request");

    // 1. Verify Signature (CRUCIAL for security)
    if (!paystackWebhookSecret) {
      functions.logger.error("Paystack Webhook Secret not configured.");
      res.status(500).send("Webhook config error.");
      return;
    }
    // IMPORTANT: Use rawBody for verification if available, otherwise req.body
    const requestBodyString = req.rawBody ? req.rawBody.toString() :
      JSON.stringify(req.body);
    const hash = crypto
      .createHmac("sha512", paystackWebhookSecret)
      .update(requestBodyString)
      .digest("hex");
    const signature = req.headers["x-paystack-signature"] as string;

    if (hash !== signature) {
      functions.logger.warn("Invalid Paystack webhook signature.",
        {received: signature, calculated: hash});
      res.status(400).send("Invalid signature.");
      return;
    }

    functions.logger.info("Paystack webhook signature verified.");

    // 2. Process Event Payload
    const eventData = req.body;
    const eventType = eventData.event;

    functions.logger.info(`Processing Paystack event:${eventType}`,
      {data: eventData.data});

    // 3. Handle successful charge
    if (eventType === "charge.success") {
      const transactionData = eventData.data;
      const reference = transactionData?.reference;
      const metadata = transactionData?.metadata || {};
      const userId = metadata?.user_id;
      const plan = metadata?.plan;
      const billingCycle = metadata?.billing_cycle;
      const transactionId = transactionData?.id;

      if (!reference || !userId || !plan) {
        functions.logger.error(
          "Missing reference, user_id, or plan in Paystack metadata.", metadata
        );
        res.status(200).send("Webhook received, missing required metadata.");
        return;
      }

      functions.logger.info(
        `Processing successful charge for user: ${userId}, Plan: ${plan}, ` +
        `Cycle: ${billingCycle}, Ref: ${reference}, TransID: ${transactionId}`
      );

      // 4. Update User Record in Firestore
      const db = admin.firestore();
      const userRef = db.collection("users").doc(userId);

      try {
        await userRef.update({
          plan: plan,
          billingCycle: billingCycle,
          planStatus: "active",
          subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastTransactionRef: reference,
          lastTransactionId: transactionId,
          // paystackCustomerCode: transactionData?.customer?.customer_code
          // Optional
        });

        functions.logger.info(
          `User ${userId} successfully updated to ${plan} (${billingCycle}).`
        );

        res.status(200).send("Webhook processed successfully.");
      } catch (dbError: unknown) {
        functions.logger.error(
          `handlePaystackWebhook: Firestore update failed for user ${userId}:`,
          dbError
        );
        res.status(500).send("Internal server error" +
          "processing payment update.");
      }
    } else {
      // Handle other event types if needed
      functions.logger.info(`Ignoring Paystack event type: ${eventType}`);
      res.status(200).send("Webhook received, event ignored.");
    }
  }
);


// === IMPORTANT: Firebase Environment Configuration ===
// Set these using the Firebase CLI:
// firebase functions:config:set resend.apikey="YOUR_RESEND_API_KEY"
// firebase functions:config:set paystack.secret_key="YOUR_PAYSTACK_SECRET_KEY"
// firebase functions:config:set
// paystack.public_key="YOUR_PAYSTACK_PUBLIC_KEY" // Optional for frontend
// firebase functions:config:set
// paystack.webhook_secret="YOUR_PAYSTACK_WEBHOOK_SECRET"
//
// Deploy after setting config:
// firebase deploy --only functions
