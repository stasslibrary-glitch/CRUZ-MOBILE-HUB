
import { auth, db } from "./firebase.js";

import {
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  writeBatch,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const $ = id => document.getElementById(id);

const setupPassword = $("adminPassword");
const toggleSetupPassword = $("toggleSetupPassword");
toggleSetupPassword?.addEventListener("click", () => {
  const showing = setupPassword.type === "text";
  setupPassword.type = showing ? "password" : "text";
  toggleSetupPassword.setAttribute("aria-label", showing ? "Show password" : "Hide password");
  toggleSetupPassword.setAttribute("aria-pressed", String(!showing));
  toggleSetupPassword.setAttribute("title", showing ? "Show password" : "Hide password");
  setupPassword.focus();
});

function message(text, success = false) {
  $("setupMessage").textContent = text;
  $("setupMessage").className =
    success ? "cmh-message success" : "cmh-message error";
}

const categories = [
  ["chargers", "Chargers"],
  ["cables", "USB Cables"],
  ["earphones", "Earphones"],
  ["phone-cases", "Phone Cases"],
  ["screen-protectors", "Screen Protectors"],
  ["power-banks", "Power Banks"],
  ["speakers", "Speakers"],
  ["memory-cards", "Memory Cards"],
  ["other", "Other Accessories"]
];

$("setupForm").addEventListener("submit", async event => {
  event.preventDefault();

  const button = $("setupBtn");
  button.disabled = true;
  button.textContent = "Setting up...";

  try {
    const email = $("adminEmail").value.trim();
    const password = $("adminPassword").value;

    // Sign in to the existing Firebase administrator account.
    const credential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    const user = credential.user;
    const userRef = doc(db, "users", user.uid);

    // Check whether an admin profile already exists.
    const existingProfile = await getDoc(userRef);

    if (existingProfile.exists()) {
      const profile = existingProfile.data();

      if (
        profile.role !== "admin" ||
        profile.businessId !== "cruz-mobile-hub" ||
        profile.active !== true
      ) {
        throw new Error(
          "An existing profile was found, but it is not an active Cruz Mobile Hub administrator."
        );
      }
    } else {
      // Create the first admin profile.
      await setDoc(userRef, {
        name: "Cruz Mobile Hub Admin",
        email: user.email,
        role: "admin",
        active: true,
        businessId: "cruz-mobile-hub",
        createdAt: serverTimestamp()
      });
    }

    // Create the business and default settings.
    const batch = writeBatch(db);

    batch.set(doc(db, "businesses", "cruz-mobile-hub"), {
      businessId: "cruz-mobile-hub",
      businessName: "Cruz Mobile Hub",
      currency: ["UGX", "USD"],
      defaultCurrency: "UGX",
      timezone: "Africa/Kampala",
      theme: "black-gold",
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });

    batch.set(doc(db, "settings", "general"), {
      businessId: "cruz-mobile-hub",
      businessName: "Cruz Mobile Hub",
      currencies: ["UGX", "USD"],
      defaultCurrency: "UGX",
      timezone: "Africa/Kampala",
      theme: "black-gold",
      lowStockNotifications: true,
      minimumStockAlerts: true,
      setupComplete: true,
      updatedAt: serverTimestamp()
    }, { merge: true });

    batch.set(doc(db, "settings", "inventory"), {
      businessId: "cruz-mobile-hub",
      costingMethod: "weighted-average",
      allowNegativeStock: false,
      requireMinimumSellingPrice: true,
      updatedAt: serverTimestamp()
    }, { merge: true });

    batch.set(doc(db, "settings", "sales"), {
      businessId: "cruz-mobile-hub",
      allowCreditSales: true,
      allowDiscounts: true,
      requireReceiptNumbers: true,
      updatedAt: serverTimestamp()
    }, { merge: true });

    batch.set(doc(db, "settings", "staff"), {
      businessId: "cruz-mobile-hub",
      salespersonAccessEnabled: false,
      staffAccountsCreated: false,
      updatedAt: serverTimestamp()
    }, { merge: true });

    // Create product categories.
    for (const [id, name] of categories) {
      batch.set(doc(db, "categories", id), {
        businessId: "cruz-mobile-hub",
        name,
        active: true,
        createdAt: serverTimestamp()
      }, { merge: true });
    }

    await batch.commit();

    message(
      "SUCCESS! Your Cruz Mobile Hub database has been initialized.",
      true
    );

    button.textContent = "Setup Complete";

  } catch (error) {
    console.error(error);
    message(error.message || "Database setup failed.");

    button.disabled = false;
    button.textContent = "Try Again";
  }
});
