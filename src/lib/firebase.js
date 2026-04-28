import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB1-brKGr7zI5uZr9qTi3xXxmg_ldzYvsg",
  authDomain: "test-website-5779f.firebaseapp.com",
  projectId: "test-website-5779f",
  storageBucket: "test-website-5779f.firebasestorage.app",
  messagingSenderId: "615559473876",
  appId: "1:615559473876:web:10b704d15b0f03d7442941",
  measurementId: "G-SS9SLRDH4M"
};

// Khởi tạo Firebase (kiểm tra để tránh lỗi khởi tạo nhiều lần trong Next.js)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };
