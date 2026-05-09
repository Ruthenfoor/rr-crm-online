// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBb1cvOi6FPXY0jlBHeXucXPptMlz5c8yQ",
  authDomain: "crm-ryr.firebaseapp.com",
  projectId: "crm-ryr",
  storageBucket: "crm-ryr.firebasestorage.app",
  messagingSenderId: "549933485429",
  appId: "1:549933485429:web:f05566c65dc3261fe5173c",
  measurementId: "G-MG6Z7CWZMT"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const db = getFirestore(app);
export const auth = getAuth(app);
