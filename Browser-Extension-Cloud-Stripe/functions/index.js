// --- Imports ---
const {onCall, onRequest, HttpsError} = require("firebase-functions/v2/https");
// NEW: Import the scheduler
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");
const {info} = require("firebase-functions/logger");
const express = require("express");
const stripe = require("stripe");

// --- Initialize Firebase ---
initializeApp();
const db = getFirestore();

// --- Config / Stripe Keys ---
// TODO: Replace with Secret Manager or environment variable in production
const STRIPE_KEY = process.env.STRIPE_KEY;
const ENDPOINT_SECRET = process.env.STRIPE_ENDPOINT_SECRET;
const stripeClient = stripe(STRIPE_KEY);

// --- onCall: createStripeCheckout ---
exports.createStripeCheckout = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be logged in to add funds.");
  }

  const uid = request.auth.uid;
  const email = request.auth.token.email;
  const amount = request.data.amount;

  if (!amount || amount < 50) {
    throw new HttpsError("invalid-argument", "Amount must be at least 50 cents.");
  }

  const userDocRef = db.collection("userSettings").doc(uid);
  const userDoc = await userDocRef.get();

  if (!userDoc.exists) {
    throw new HttpsError("not-found", "User document not found.");
  }

  let stripeCustomerId = userDoc.data().stripeCustomerId;

  if (!stripeCustomerId) {
    const customer = await stripeClient.customers.create({
      email,
      metadata: {firebaseUID: uid},
    });
    stripeCustomerId = customer.id;
    await userDocRef.update({stripeCustomerId});
  }

  const YOUR_WEBSITE_URL = "https://time-2-help.web.app";

  const session = await stripeClient.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    customer: stripeCustomerId,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {name: "Add Funds to Wallet"},
          unit_amount: amount,
        },
        quantity: 1,
      },
    ],
    metadata: {firebaseUID: uid, amount},
    success_url: `${YOUR_WEBSITE_URL}/success.html`,
    cancel_url: `${YOUR_WEBSITE_URL}/cancel.html`,
  });

  return {url: session.url};
});

// --- onRequest: stripeWebhook ---
const webhookApp = express();
webhookApp.use(express.raw({type: "application/json"}));
webhookApp.post("/", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripeClient.webhooks.constructEvent(req.body, sig, ENDPOINT_SECRET);
  } catch (err) {
    info("Webhook signature verification failed.", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const uid = session.metadata?.firebaseUID;
    const amount = parseInt(session.metadata?.amount, 10);

    if (!uid || !amount) {
      info("Webhook error: Missing metadata (uid or amount)", session);
      return res.status(400).send("Webhook Error: Missing metadata.");
    }

    try {
      const userDocRef = db.collection("userSettings").doc(uid);
      let newBalance;

      await db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userDocRef);
        if (!userDoc.exists) throw new Error("User document not found!");
        const oldBalance = userDoc.data().walletBalance || 0;
        newBalance = oldBalance + amount;
        transaction.update(userDocRef, {walletBalance: newBalance});
      });

      info(`Successfully added ${amount} cents to user ${uid}. New balance: ${newBalance}`);
    } catch (err) {
      info("Error updating user wallet:", err);
      return res.status(500).send("Internal server error.");
    }
  }

  res.status(200).json({received: true});
});
exports.stripeWebhook = onRequest(webhookApp);


// --- NEW: Daily Scheduled Function ---
/**
 * Runs every day at 11:59 PM (America/New_York timezone).
 * Checks each user's time vs. their limits.
 * If they failed, their wallet is reset to 0.
 * In both cases, their time_tracking is reset for the next day.
 */
exports.dailyAccountCheck = onSchedule({
  schedule: "every day 23:59",
  timeZone: "America/Chicago", // All checks run on Chicago time
}, async (event) => {
  info("Running Daily Account Check...");

  const usersSnapshot = await db.collection("userSettings").get();
  const promises = [];
  const options = {timeZone: "America/Chicago"};
  const today = new Date().toLocaleDateString("en-CA", options); // 'YYYY-MM-DD'

  usersSnapshot.forEach((doc) => {
    promises.push(processUserCheck(doc, today));
  });

  await Promise.all(promises);
  info("Daily Account Check complete.");
});

async function processUserCheck(doc, todayDateString) {
  const user = doc.data();
  let didFailTime = false;
  let didEdit = false;

  // --- 1. Check for Time Failure ---
  if (user.unallowed_urls && user.time_tracking) {
    for (const site of user.unallowed_urls) {
      const timeSpent = user.time_tracking[site.url]?.time || 0;
      if (site.limit > 0 && timeSpent > site.limit) {
        didFailTime = true;
        break;
      }
    }
  }

  // --- 2. Check for Edit Failure ---
  if (user.editHistory && user.editHistory.length > 0) {
    const lastEditTimestamp = user.editHistory[user.editHistory.length - 1].date;
    const lastEditDate = new Date(lastEditTimestamp)
        .toLocaleDateString("en-CA", {timeZone: "America/Chicago"});
    if (lastEditDate === todayDateString) {
      didEdit = true;
    }
  }

  // --- 3. Determine Result ---
  const didFail = didFailTime || didEdit;
  
  const resultStatus = () => {
    if (didFailTime) return "failed_time";
    if (didEdit) return "failed_edit";
    return "success";
  };

  const result = {
    date: todayDateString,
    status: resultStatus(),
    seen: false,
  };

  // --- 4. NEW: Donation Logic ---
  const walletBalance = user.walletBalance || 0;
  const totalDonated = user.totalDonated || 0;
  let newTotalDonated = totalDonated;
  let newWalletBalance = walletBalance;

  if (didFail && walletBalance > 0) {
    // User failed, so their wallet balance is added to their total donated
    newTotalDonated = totalDonated + walletBalance;
    newWalletBalance = 0; // Reset wallet
  }
  // If they succeeded, walletBalance and totalDonated are unchanged.

  info(`User ${doc.id} (Fail: ${didFail}): Wallet ${walletBalance} -> ${newWalletBalance}, Donated ${totalDonated} -> ${newTotalDonated}`);

  return doc.ref.update({
    walletBalance: newWalletBalance,
    totalDonated: newTotalDonated,
    time_tracking: {}, // Reset time for the next day
    dailyResult: result,
    editHistory: [], // Clear edit history for the next day
  });
}