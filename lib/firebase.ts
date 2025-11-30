// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration (from env)
const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY as string,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN as string,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID as string,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID as string,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID as string,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET as string,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID as string,
};

// Initialize Firebase (avoid re-init on client hot reload)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const analytics = typeof window !== 'undefined' && firebaseConfig.measurementId ? getAnalytics(app) : null;
const auth = getAuth(app);
auth.languageCode = 'pt';

export { app, analytics, auth };
export default firebaseConfig;