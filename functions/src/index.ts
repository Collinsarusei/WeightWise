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

// Initialize Firebase Admin SDK
admin.initializeApp();

// --- Resend Configuration ---
// ** IMPORTANT: Replace with defineSecret for production **
// const resendApiKey = defineSecret("RESEND_API_KEY"); // Use this in production
const resendApiKey = functions.config().resend?.apikey; // Fallback for older config
let resend: Resend | null = null;
if (resendApiKey) {
  // If using defineSecret, access with .value() inside functions
  // For functions.config(), access directly here
  resend = new Resend(typeof resendApiKey === "string" ? resendApiKey : ""); // Handle potential type difference
  functions.logger.info("Resend client initialized.");
} else {
  functions.logger.error(
    "Resend API key is not configured (resend.apikey)."
  );
}
// --- End Resend Configuration ---


// --- Paystack Configuration ---
// ** IMPORTANT: Replace with defineSecret for production **
// const paystackSecretKey = defineSecret("PAYSTACK_SECRET_KEY");
// const paystackWebhookSecret = defineSecret("PAYSTACK_WEBHOOK_SECRET");
const paystackSecretKey = functions.config().paystack?.secret_key; // Fallback
const paystackWebhookSecret = functions.config().paystack?.webhook_secret; // Fallback

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
const fromEmail = "onboarding@resend.dev"; // TODO: Replace with your verified sender
/**
 * Sends an email using the configured Resend client.
 * @param {EmailOptions} options The email options.
 * @return {Promise<void>} A promise that resolves when the email is sent.
 * @throws {Error} If Resend is not initialized or email sending fails.
 */
async function sendEmail(options: EmailOptions): Promise<void> {
  // Access secret inside function if using defineSecret
  // const apiKey = resendApiKey.value();
  // const resendInstance = new Resend(apiKey);

  // Using direct key from config for this example based on original code
  if (!resend) { // Check instance created at top level
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
  .timeZone("Africa/Nairobi") // Set to your desired timezone
  .onRun(async (context: ScheduledFunctionContext) => {
    functions.logger.info(
      "Starting weekly fitness report job.",
      {timestamp: context.timestamp}
    );

    if (!resendApiKey) { // Check if key exists before proceeding
      functions.logger.error("Resend API key not configured. Aborting job.");
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
        // Optional: Add check if user is premium before sending report
        if (userData.plan !== "premium" || userData.planStatus !== "active") {
          functions.logger.info(`User ${userId} is not premium or not active. Skipping report.`);
          continue;
        }

        try {
          // Placeholder: Fetch & Calculate Weekly Data for user userId
          // You need to implement the actual logic here to query Firestore
          // for the user's exercises within the past week and calculate totals.
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
  amount: number; // Expecting amount in major unit (e.g., 2.99 for USD)
  currency: string; // Expecting currency code (e.g., USD)
  billingCycle: "monthly" | "yearly";
}

interface InitiatePaymentResult {
  authorization_url?: string; // Paystack returns authorization_url
  access_code?: string;
  reference?: string;
}

// Internal handler function
const initiateProUpgradePaymentHandler = async (
  data: InitiatePaymentData,
  context: CallableContext
): Promise<InitiatePaymentResult> => {
  // ** Access secret inside the function if using defineSecret **
  // const secretKey = paystackSecretKey.value();
  // Using direct config access based on original code structure
  const secretKey = paystackSecretKey;

  if (!context.auth) {
    functions.logger.error("initiatePaystackPayment: Unauthenticated call.");
    throw new functions.https.HttpsError(
      "unauthenticated", "The function must be called while authenticated."
    );
  }

  if (!secretKey) { // Check the key fetched/defined above
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
  // Amount from frontend is in USD, ensure it's a positive number
  if (typeof amount !== "number" || isNaN(amount) || amount <= 0 ) {
    throw new functions.https.HttpsError("invalid-argument",
      "Amount must be a positive number representing the value in USD."); // <-- Updated comment
  }
  // --- CHANGE: Expect USD ---
  if (currency !== "USD") {
    functions.logger.error("initiatePaystackPayment: Invalid currency received:", currency, ". Expected USD.");
    throw new functions.https.HttpsError("invalid-argument", `Invalid currency '${currency}'. Expected USD.`);
  }
  if (billingCycle !== "monthly" && billingCycle !== "yearly") {
    throw new functions.https.HttpsError("invalid-argument",
      "Invalid billing cycle specified.");
  }

  // --- CHANGE: Convert USD amount to smallest unit (Cents) for Paystack ---
  const amountInCents = Math.round(amount * 100);
  functions.logger.info(
    "Converting amount for Paystack: " +
    `${amount} ${currency} -> ${amountInCents} Cents` // <-- Updated log
  );
  // --- End Change ---

  // Generate a unique reference for this transaction
  const reference = `PRO_${billingCycle.toUpperCase()}_${userId}_${Date.now()}`;

  // Prepare Paystack API request body
  const apiRequestBody = {
    email: userEmail,
    amount: amountInCents, // <-- Send amount in cents
    currency: currency, // <-- Send 'USD'
    reference: reference,
    metadata: {
      // Store userId directly in metadata root if possible, or use custom_fields
      userId: userId, // <-- Changed from user_id to match webhook expectation if needed
      plan: "premium",
      billingCycle: billingCycle, // <-- Changed from billing_cycle for consistency
      custom_fields: [ // Keep custom_fields if Paystack requires them structured this way
        {display_name: "User ID", variable_name: "user_id", value: userId},
        {display_name: "Plan", variable_name: "plan",
          value: `Premium (${billingCycle})`},
        {display_name: "Billing Cycle", variable_name: "billing_cycle", value: billingCycle}, // Added billing cycle here too
      ],
    },
    // callback_url: `https://yourdomain.com/dashboard?payment_ref=${reference}` // Optional
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

    // Use Axios as per original code
    const response = await axios.post<PaystackInitResponse>(
      paystackApiUrl,
      apiRequestBody, // Contains amountInCents
      {
        headers: {
          "Authorization": `Bearer ${secretKey}`, // Use Paystack Secret Key
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

// Export the HTTPS Callable function using the handler
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

    // ** Access secret inside the function if using defineSecret **
    // const secret = paystackWebhookSecret.value();
    // Using direct config access based on original code structure
    const secret = paystackWebhookSecret;

    // 1. Verify Signature (CRUCIAL for security)
    if (!secret) { // Check the key fetched/defined above
      functions.logger.error("Paystack Webhook Secret not configured.");
      res.status(500).send("Webhook config error.");
      return;
    }
    // IMPORTANT: Use rawBody for verification if available, otherwise req.body
    // Firebase Functions v1 automatically parses JSON, so req.rawBody might not be populated
    // unless you configure middleware. Stringifying req.body is generally okay if rawBody isn't available.
    let requestBodyString: string;
    try {
      // Attempt to use rawBody if populated by middleware (less common in v1)
      // if (req.rawBody) {
      //     requestBodyString = req.rawBody.toString();
      // } else {
      requestBodyString = JSON.stringify(req.body);
      // }
    } catch (e) {
      functions.logger.error("Failed to stringify request body for webhook verification", e);
      res.status(400).send("Invalid request body format.");
      return;
    }

    const hash = crypto
      .createHmac("sha512", secret)
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
      // --- Read metadata based on how it was sent ---
      // Check both root level and custom_fields based on initiation logic
      const metadata = transactionData?.metadata || {};
      const userId = metadata?.userId || metadata?.custom_fields?.find((f: any) => f.variable_name === "user_id")?.value;
      const plan = metadata?.plan || metadata?.custom_fields?.find((f: any) => f.variable_name === "plan")?.value || "premium"; // Default to premium if missing but charge succeeded
      const billingCycle = metadata?.billingCycle || metadata?.custom_fields?.find((f: any) => f.variable_name === "billing_cycle")?.value;
      // --- End Reading Metadata ---
      const transactionId = transactionData?.id;

      if (!reference || !userId || !plan || !billingCycle) {
        functions.logger.error(
          "Missing reference, userId, plan, or billingCycle in Paystack data/metadata.",
          {reference, userId, plan, billingCycle, metadata}
        );
        // Still send 200 OK to Paystack to avoid retries, but log the critical error
        res.status(200).send("Webhook received, missing required data/metadata.");
        return;
      }
      // Validate billing cycle again just in case
      if (billingCycle !== "monthly" && billingCycle !== "yearly") {
        functions.logger.error("Invalid billing cycle value found in webhook metadata:", billingCycle);
        res.status(200).send("Webhook received, invalid billing cycle in metadata.");
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
          plan: "premium", // Explicitly set to premium on success
          billingCycle: billingCycle,
          planStatus: "active",
          subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastTransactionRef: reference,
          lastTransactionId: transactionId,
          // paystackCustomerCode: transactionData?.customer?.customer_code // Optional
          // Consider clearing any reminder flags here if you implement reminders
          // expiryReminderSent: admin.firestore.FieldValue.delete(),
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
        // Send 200 OK to Paystack to prevent retries, but log the critical failure
        res.status(200).send("Internal server error processing payment update.");
      }
    } else {
      // Handle other event types if needed (e.g., subscription failures, renewals)
      functions.logger.info(`Ignoring Paystack event type: ${eventType}`);
      res.status(200).send("Webhook received, event ignored.");
    }
  }
);


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
