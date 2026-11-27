import { initializeApp } from
  "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";

import { getAuth } from
  "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

import { getFirestore } from
  "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { getFunctions } from
  "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

const firebaseConfig = {
  apiKey: "AIzaSyDMxDwNyDaf4jqJqesQ-n1yfO6yeNLaOcg",
  authDomain: "cruz-mobile-hub.firebaseapp.com",
  projectId: "cruz-mobile-hub",
  storageBucket: "cruz-mobile-hub.firebasestorage.app",
  messagingSenderId: "526155404100",
  appId: "1:526155404100:web:b39f75278acc79c0a77d11"
};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, "us-central1");

export { app, auth, db, functions };