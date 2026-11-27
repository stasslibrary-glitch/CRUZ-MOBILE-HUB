
import { auth, db } from "./firebase.js";

import {
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const $ = id => document.getElementById(id);
const message = $("loginMessage");
const tabs = document.querySelectorAll(".login-tab");
let selectedRole = "admin";

function showMessage(text, type = "error") {
  message.textContent = text;
  message.className = `login-message ${type}`;
}

function switchTab(role) {
  selectedRole = role;
  tabs.forEach(tab => {
    const active = tab.dataset.role === role;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  $("loginBtn").textContent = role === "admin" ? "Sign in as Administrator" : "Sign in as Salesperson";
  $("email").placeholder = role === "admin" ? "Enter admin email" : "Enter salesperson email";
  showMessage("");
}

tabs.forEach(tab => tab.addEventListener("click", () => switchTab(tab.dataset.role)));

function isAdminProfile(profile) {
  return profile?.role === "admin"
    && profile?.active === true
    && profile?.businessId === "cruz-mobile-hub";
}

function isSalesProfile(profile) {
  const role = String(profile?.role || "").toLowerCase();
  return (role === "salesperson" || role === "staff" || role === "sales")
    && profile?.active === true
    && profile?.businessId === "cruz-mobile-hub";
}

const passwordInput = $("password");
const togglePassword = $("togglePassword");
togglePassword?.addEventListener("click", () => {
  const showing = passwordInput.type === "text";
  passwordInput.type = showing ? "password" : "text";
  togglePassword.setAttribute("aria-label", showing ? "Show password" : "Hide password");
  togglePassword.setAttribute("aria-pressed", String(!showing));
  togglePassword.setAttribute("title", showing ? "Show password" : "Hide password");
  passwordInput.focus();
});

$("loginForm").addEventListener("submit", async event => {
  event.preventDefault();

  const button = $("loginBtn");
  const email = $("email").value.trim();
  const password = $("password").value;

  if (!email || !password) {
    showMessage("Enter your email and password.");
    return;
  }

  button.disabled = true;
  button.textContent = "Signing in...";

  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const user = credential.user;
    let profileSnap = await getDoc(doc(db, "users", user.uid));

    if (!profileSnap.exists()) {
      if (selectedRole === "salesperson") {
        try {
          await setDoc(doc(db, "users", user.uid), {
            name: user.displayName || "Salesperson",
            email: user.email || email,
            role: "salesperson",
            active: true,
            businessId: "cruz-mobile-hub",
            createdAt: serverTimestamp()
          });
          profileSnap = await getDoc(doc(db, "users", user.uid));
        } catch (createError) {
          console.error("Salesperson profile auto-create failed:", createError);
        }
      }

      if (!profileSnap.exists()) {
        await signOut(auth);
        const accountType = selectedRole === "admin" ? "administrator" : "salesperson";
        throw new Error(`No ${accountType} account profile was found for this login. In Firestore, create users/${user.uid} with role "${selectedRole}", active true, businessId "cruz-mobile-hub", and email "${user.email || email}". Deploy the updated firebase rules to allow salesperson self-profile creation, or create the profile as admin.`);
      }
    }

    const profile = profileSnap.data();

    if (selectedRole === "admin") {
      if (isAdminProfile(profile)) {
        showMessage("Login successful. Opening dashboard...", "success");
        window.location.replace("admin-dashboard.html");
        return;
      }
      await signOut(auth);
      if (isSalesProfile(profile)) {
        throw new Error("This is a salesperson account. Use the Salesperson login option.");
      }
      throw new Error("This account does not have active administrator access.");
    }

    if (selectedRole === "salesperson") {
      if (isSalesProfile(profile)) {
        showMessage("Login successful. Opening sales...", "success");
        window.location.replace("sales.html");
        return;
      }
      await signOut(auth);
      if (isAdminProfile(profile)) {
        throw new Error("This is an administrator account. Use the Administrator login option.");
      }
      throw new Error("This account does not have active salesperson access.");
    }

    await signOut(auth);
    throw new Error("This account does not have active access.");
  } catch (error) {
    console.error("Login error:", error);

    let errorMessage = error.message;
    if (error.code === "auth/invalid-credential" || error.code === "auth/wrong-password" || error.code === "auth/user-not-found") {
      errorMessage = "Incorrect email or password.";
    } else if (error.code === "auth/too-many-requests") {
      errorMessage = "Too many attempts. Please try again later.";
    } else if (error.code === "auth/network-request-failed") {
      errorMessage = "Network error. Check your internet connection.";
    } else if (error.code === "auth/invalid-email") {
      errorMessage = "Enter a valid email address.";
    }

    showMessage(errorMessage);
  } finally {
    button.disabled = false;
    button.textContent = selectedRole === "admin" ? "Sign in as Administrator" : "Sign in as Salesperson";
  }
});

switchTab("admin");
