/*
 * =================================================================
 * == NOTE: LOCAL SDK FILES SETUP ==
 * =================================================================
 * * This file now uses local, relative imports (e.g., './firebase-app.js').
 * * This does NOT require a bundler.
 * *
 * * You must download the following files and place them in
 * * the SAME folder as this script:
 * * - firebase-app.js
 * * - firebase-auth.js
 * * - firebase-firestore.js
 * * =================================================================
 */

import { initializeApp } from './firebase-app.js';
import { 
  getAuth, 
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail 
} from './firebase-auth.js';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc,
  updateDoc 
} from './firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyDEd2vgkZ5QXzr46HaqKAZnHOdKK1Qu7Ek",
  authDomain: "time-2-help.firebaseapp.com",
  projectId: "time-2-help",
  storageBucket: "time-2-help.firebasestorage.app",
  messagingSenderId: "218361433357",
  appId: "1:218361433357:web:c46fa403f88df9b36d3444",
  measurementId: "G-WJ4QLXMR5Y"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { 
  app, 
  auth, 
  onAuthStateChanged,
  db,
  doc,
  getDoc,
  setDoc,
  updateDoc, 
  sendEmailVerification,
  sendPasswordResetEmail
};

