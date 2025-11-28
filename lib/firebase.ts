// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCCYcm59Sk-DZwhe7Co--BGzzI0NZVd52c",
    authDomain: "zerokm-64d2f.firebaseapp.com",
    projectId: "zerokm-64d2f",
    storageBucket: "zerokm-64d2f.firebasestorage.app",
    messagingSenderId: "10708933516",
    appId: "1:10708933516:web:41a16d6e84854fa2d454a9",
    measurementId: "G-V4ZPR6Q59K"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;
const auth = getAuth(app);
auth.languageCode = 'pt';

export { app, analytics, auth };
export default firebaseConfig;