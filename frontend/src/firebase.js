import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAMxBjzlB3O_FBFcPMpmn9zfan6qpdPaf4",
  authDomain: "realtimereporting-27b2b.firebaseapp.com",
  projectId: "realtimereporting-27b2b",
  storageBucket: "realtimereporting-27b2b.firebasestorage.app",
  messagingSenderId: "188657881867",
  appId: "1:188657881867:web:b69d4e552898821fafc80e",
  measurementId: "G-X91QC3RZ59",
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);

export const analyticsPromise =
  typeof window !== "undefined"
    ? isSupported()
        .then((supported) => (supported ? getAnalytics(firebaseApp) : null))
        .catch(() => null)
    : Promise.resolve(null);
