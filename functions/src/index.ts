/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable require-jsdoc */

// Firebase Functions Imports
import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import {Resend} from "resend";
import axios, {isAxiosError} from "axios";
import * as crypto from "crypto";
import {CallableContext} from "firebase-functions/v1/https";
import {getFirestore} from "firebase-admin/firestore";

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = getFirestore(); // Initialize Firestore Admin SDK instance

// --- Resend Configuration ---
const resendApiKey = functions.config().resend?.apikey;
let resend: Resend | null = null;
if (resendApiKey) {
  resend = new Resend(typeof resendApiKey === "string" ? resendApiKey : "");
  functions.logger.info("Resend client initialized.");
} else {
  functions.logger.error(
    "Resend API key is not configured (resend.apikey)."
  );
}
// --- End Resend Configuration ---


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
// Internal helper function - not directly exported as callable
interface EmailOptions { to: string; subject:
  string; html: string; text?: string; }
const fromEmail = "onboarding@resend.dev"; // TODO: Replace with your verified sender

async function _sendEmailInternal(options: EmailOptions): Promise<void> {
  if (!resend) {
    throw new Error("Email service (Resend) not configured.");
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
    functions.logger.error(`Unexpected error in _sendEmailInternal to ${options.to}:`,
      err);
    throw err;
  }
}

// --- NEW: Callable Function for Sending Emails ---
interface SendEmailData {
    to: string;
    subject: string;
    html: string;
    text?: string;
}

export const sendGenericEmail = functions.https.onCall(async (data: SendEmailData) => {
  functions.logger.info("sendGenericEmail called with data:", data);
  // Optional: Add authentication check if needed, though API route already calls it
  // if (!context.auth) {
  //   throw new functions.https.HttpsError("unauthenticated", "Authentication required.");
  // }

  const {to, subject, html, text} = data;
  if (!to || !subject || !html) {
    throw new functions.https.HttpsError("invalid-argument", "Missing required fields: to, subject, html.");
  }

  try {
    await _sendEmailInternal({to, subject, html, text});
    functions.logger.info(`Successfully queued email for ${to}`);
    return {success: true};
  } catch (error: any) {
    functions.logger.error(`sendGenericEmail failed for ${to}:`, error);
    // Throwing an HttpsError allows the frontend caller to catch it gracefully
    throw new functions.https.HttpsError("internal", `Failed to send email: ${error.message}`, error);
  }
});
// --- End Callable Email Function ---


interface WeeklyReportData { totalCaloriesBurned: number;
  totalWorkouts: number; }
interface WeeklyReportEmailProps { userEmail: string; userName?:
  string; reportData: WeeklyReportData; }

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
  // Use the internal helper function
  await _sendEmailInternal({to: userEmail, subject: subject, html: html, text: text});
  functions.logger.info(`Weekly report email queued for ${userEmail}`);
}

// --- Scheduled Function for Weekly Reports ---
interface ScheduledFunctionContext { timestamp: string; }

export const sendWeeklyFitnessReports = functions.pubsub
  .schedule("every sunday 09:00")
  .timeZone("Africa/Nairobi") // Set to your desired timezone
  .onRun(async (context: ScheduledFunctionContext) => {
    functions.logger.info(
      "Starting weekly fitness report job.",
      {timestamp: context.timestamp}
    );

    if (!resendApiKey) {
      functions.logger.error("Resend API key not configured. Aborting job.");
      return null;
    }

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

        if (userData.plan !== "premium" || userData.planStatus !== "active") {
          functions.logger.info(`User ${userId} is not premium or not active. Skipping report.`);
          continue;
        }

        try {
          functions.logger.info(
            `Fetching data for user ${userId}... (Placeholder - Implement Actual Logic)`
          );
          const mockWeeklyData: WeeklyReportData = { // Replace with real calculation
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

// --- Paystack Payment Initiation Function (Handler) ---

interface InitiatePaymentData {
  amount: number; 
  currency: string; 
  billingCycle: "monthly" | "yearly";
}

interface InitiatePaymentResult {
  authorization_url?: string; 
  access_code?: string;
  reference?: string;
}


const initiateProUpgradePaymentHandler = async (
  data: InitiatePaymentData,
  context: CallableContext
): Promise<InitiatePaymentResult> => {
  const secretKey = paystackSecretKey;

  if (!context.auth) {
    functions.logger.error("initiatePaystackPayment: Unauthenticated call.");
    throw new functions.https.HttpsError(
      "unauthenticated", "The function must be called while authenticated."
    );
  }

  if (!secretKey) {
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

  if (typeof amount !== "number" || isNaN(amount) || amount <= 0 ) {
    throw new functions.https.HttpsError("invalid-argument",
      "Amount must be a positive number.");
  }

  if (currency !== "KES") { // UPDATED: Expect KES
    functions.logger.error("initiatePaystackPayment: Invalid currency received:", currency, ". Expected KES.");
    throw new functions.https.HttpsError("invalid-argument", `Invalid currency '${currency}'. Expected KES.`);
  }
  if (billingCycle !== "monthly" && billingCycle !== "yearly") {
    throw new functions.https.HttpsError("invalid-argument",
      "Invalid billing cycle specified.");
  }

  // --- Convert KES amount to smallest unit (Cents/equivalent) for Paystack ---
  // Paystack generally requires amount in kobo/cents.
  // For KES, this typically means multiplying by 100. Double-check Paystack KES requirements.
  const amountInSmallestUnit = Math.round(amount * 100);
  functions.logger.info(
    "Converting amount for Paystack: " +
    `${amount} ${currency} -> ${amountInSmallestUnit} (smallest unit)`
  );
  // --- End Change --


  const reference = `PRO_${billingCycle.toUpperCase()}_${userId}_${Date.now()}`


  const apiRequestBody = {
    email: userEmail,
    amount: amountInSmallestUnit, // <-- Send amount in smallest unit
    currency: currency, // <-- Send 'KES'
    reference: reference,
    metadata: {
      userId: userId,
      plan: "premium",
      billingCycle: billingCycle,
      custom_fields: [
        {display_name: "User ID", variable_name: "user_id", value: userId},
        {display_name: "Plan", variable_name: "plan",
          value: `Premium (${billingCycle})`},
        {display_name: "Billing Cycle", variable_name: "billing_cycle", value: billingCycle},
      ],
    },

  };

  functions.logger.info(
    "initiatePaystackPayment: Preparing Paystack transaction init request:",
    apiRequestBody
  );

  const paystackApiUrl = "https://api.paystack.co/transaction/initialize";

  try {
    interface PaystackInitResponse {
      status: boolean;
      message: string;
      data?: {
        authorization_url?: string;
        access_code?: string;
        reference?: string;
      };
    }

    // Use Axios as per original code
    const response = await axios.post<PaystackInitResponse>(
      paystackApiUrl,
      apiRequestBody, // Contains amountInSmallestUnit
      {
        headers: {
          "Authorization": `Bearer ${secretKey}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
      }
    );

    functions.logger.info(
      "initiatePaystackPayment: Paystack API response received",
      {status: response.status, data: response.data}
    );


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
        response.data
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


export const initiatePaystackPayment = functions.https.onCall(
  initiateProUpgradePaymentHandler
);


// --- Paystack Webhook Handler Function ---


export const handlePaystackWebhook = functions.https.onRequest(
  async (req, res): Promise<void> => {
    functions.logger.info("handlePaystackWebhook: Received request");


    const secret = paystackWebhookSecret;


    if (!secret) {
      functions.logger.error("Paystack Webhook Secret not configured.");
      res.status(500).send("Webhook config error.");
      return;
    }

    let requestBodyString: string;
    try {
      // Paystack recommends using the raw body if available, otherwise stringify
      // For Firebase, req.rawBody might not be populated by default without middleware
      // Using JSON.stringify(req.body) is generally okay if Content-Type is application/json
      requestBodyString = JSON.stringify(req.body);
    } catch (e) {
      functions.logger.error("Failed to stringify request body for webhook verification", e);
      res.status(400).send("Invalid request body format.");
      return;
    }
    
    const hash = crypto
      .createHmac("sha512", secret)
      .update(requestBodyString) // Use stringified body
      .digest("hex");
    const signature = req.headers["x-paystack-signature"] as string;

    if (hash !== signature) {
      functions.logger.warn("Invalid Paystack webhook signature.",
        {received: signature, calculated: hash});
      res.status(400).send("Invalid signature.");
      return;
    }

    functions.logger.info("Paystack webhook signature verified.");


    const eventData = req.body;
    const eventType = eventData.event;

    functions.logger.info(`Processing Paystack event:${eventType}`,
      {data: eventData.data});


    if (eventType === "charge.success") {
      const transactionData = eventData.data;
      const reference = transactionData?.reference;

      const metadata = transactionData?.metadata || {};
      const userId = metadata?.userId || metadata?.custom_fields?.find((f: any) => f.variable_name === "user_id")?.value;
      const plan = metadata?.plan || metadata?.custom_fields?.find((f: any) => f.variable_name === "plan")?.value || "premium";
      const billingCycle = metadata?.billingCycle || metadata?.custom_fields?.find((f: any) => f.variable_name === "billing_cycle")?.value;

      const transactionId = transactionData?.id;

      // Validate currency if present (optional but good practice)
      const paidCurrency = transactionData?.currency;
      if (paidCurrency && paidCurrency !== "KES") {
          functions.logger.warn(`Webhook for reference ${reference} has currency ${paidCurrency} but KES was expected.`);
          // Decide if this is a critical error or just a warning
      }


      if (!reference || !userId || !plan || !billingCycle) {
        functions.logger.error(
          "Missing reference, userId, plan, or billingCycle in Paystack data/metadata.",
          {reference, userId, plan, billingCycle, metadata}
        );

        res.status(200).send("Webhook received, missing required data/metadata.");
        return;
      }

      if (billingCycle !== "monthly" && billingCycle !== "yearly") {
        functions.logger.error("Invalid billing cycle value found in webhook metadata:", billingCycle);
        res.status(200).send("Webhook received, invalid billing cycle in metadata.");
        return;
      }


      functions.logger.info(
        `Processing successful charge for user: ${userId}, Plan: ${plan}, ` +
        `Cycle: ${billingCycle}, Ref: ${reference}, TransID: ${transactionId}`
      );


      // const db = admin.firestore(); // db already initialized globally
      const userRef = db.collection("users").doc(userId);

      try {
        await userRef.update({
          plan: "premium", // Make sure this matches your plan identifier
          billingCycle: billingCycle,
          planStatus: "active", // Or your equivalent status for a paid user
          subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastTransactionRef: reference,
          lastTransactionId: transactionId,
          // Consider clearing reminder flags here if needed
          expiryReminderSent: admin.firestore.FieldValue.delete(), 
        });

        functions.logger.info(
          `User ${userId} successfully updated to premium (${billingCycle}).`
        );

        res.status(200).send("Webhook processed successfully.");
      } catch (dbError: unknown) {
        functions.logger.error(
          `handlePaystackWebhook: Firestore update failed for user ${userId}:`,
          dbError
        );

        // Respond 200 to Paystack to acknowledge receipt, even if DB update fails,
        // to prevent Paystack from retrying indefinitely. Log the error for manual follow-up.
        res.status(200).send("Internal server error processing payment update.");
      }
    } else {
      functions.logger.info(`Ignoring Paystack event type: ${eventType}`);
      res.status(200).send("Webhook received, event ignored.");
    }
  }
);

// --- Function to Delete a Specific Chat Session ---
export const deleteChatSession = functions.https.onCall(async (data: {sessionId?: string}, context) => {
  functions.logger.info("deleteChatSession: Function called.", data);

  // Check Authentication
  if (!context.auth) {
    functions.logger.error("deleteChatSession: Authentication check failed.");
    throw new functions.https.HttpsError(
      "unauthenticated", "The function must be called while authenticated."
    );
  }

  const userId = context.auth.uid;
  const sessionId = data?.sessionId; // Get sessionId from input data

  // Validate sessionId input
  if (!sessionId || typeof sessionId !== "string") {
    functions.logger.error("deleteChatSession: Invalid or missing sessionId.");
    throw new functions.https.HttpsError(
      "invalid-argument", "A valid sessionId must be provided."
    );
  }

  // Define references
  const sessionDocRef = db.collection("users").doc(userId).collection("chatSessions").doc(sessionId);
  const messagesRef = sessionDocRef.collection("messages"); // Path to messages subcollection

  functions.logger.info(`Attempting to delete chat session: ${sessionId} for user: ${userId}`);

  try {
    // 1. Delete all messages within the session's subcollection
    let messageSnapshot = await messagesRef.limit(500).get();
    let deletedMessagesCount = 0;

    while (!messageSnapshot.empty) {
      const batch = db.batch();
      messageSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
        deletedMessagesCount++;
      });
      await batch.commit();
      // Fetch the next batch
      const nextSnapshot = await messagesRef.limit(500).get();
      if (nextSnapshot.empty) break;
      messageSnapshot = nextSnapshot;
      functions.logger.info(`Deleted batch of ${messageSnapshot.size} messages for session ${sessionId}...`);
    }
    functions.logger.info(`Finished deleting ${deletedMessagesCount} messages for session ${sessionId}.`);

    // 2. Delete the session document itself
    await sessionDocRef.delete();
    functions.logger.info(`Successfully deleted chat session document: ${sessionId} for user: ${userId}`);

    return {success: true, deletedMessagesCount: deletedMessagesCount};
  } catch (error) {
    functions.logger.error(`Failed to delete chat session ${sessionId} for user ${userId}:`, error);
    throw new functions.https.HttpsError("internal", "Could not delete chat session.", error);
  }
});

// === IMPORTANT: Firebase Environment Configuration ===
// For production, use defineSecret and access secrets with .value() inside functions.
// For older config (functions.config()):
// Set these using the Firebase CLI:
// firebase functions:config:set resend.apikey="YOUR_RESEND_API_KEY"
// firebase functions:config:set paystack.secret_key="YOUR_PAYSTACK_SECRET_KEY"
// firebase functions:config:set paystack.webhook_secret="YOUR_PAYSTACK_WEBHOOK_SECRET"
//
// Deploy after setting config:
// firebase deploy --only functions
