import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const BUSINESS_ID = "cruz-mobile-hub";

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

function isAdminProfile(profile) {
  const role = normalizeRole(profile?.role);
  return role === "admin" && profile?.active === true && profile?.businessId === BUSINESS_ID;
}

function isSalesProfile(profile) {
  const role = normalizeRole(profile?.role);
  return (role === "salesperson" || role === "staff" || role === "sales")
    && profile?.active === true
    && profile?.businessId === BUSINESS_ID;
}

async function getProfile(uid) {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);
  return userSnap.exists() ? userSnap.data() : null;
}

function redirectByRole(profile) {
  if (isAdminProfile(profile)) {
    window.location.href = "admin-dashboard.html";
    return;
  }
  if (isSalesProfile(profile)) {
    window.location.href = "sales.html";
    return;
  }
  window.location.href = "login.html";
}

export async function requireAdmin() {
  return new Promise(resolve => {
    const unsubscribe = onAuthStateChanged(auth, async user => {
      unsubscribe();

      if (!user) {
        window.location.href = "login.html";
        resolve(null);
        return;
      }

      try {
        const profile = await getProfile(user.uid);

        if (!profile) {
          await signOut(auth);
          window.location.href = "login.html";
          resolve(null);
          return;
        }

        if (isAdminProfile(profile)) {
          resolve({ uid: user.uid, email: user.email, ...profile });
          return;
        }

        if (isSalesProfile(profile)) {
          window.location.href = "sales.html";
          resolve(null);
          return;
        }

        await signOut(auth);
        window.location.href = "login.html";
        resolve(null);
      } catch (error) {
        console.error("Admin access check failed:", error);
        await signOut(auth);
        window.location.href = "login.html";
        resolve(null);
      }
    });
  });
}

export async function requireSalesAccess() {
  return new Promise(resolve => {
    const unsubscribe = onAuthStateChanged(auth, async user => {
      unsubscribe();

      if (!user) {
        resolve(null);
        return;
      }

      try {
        const profile = await getProfile(user.uid);
        if (isAdminProfile(profile) || isSalesProfile(profile)) {
          resolve({ uid: user.uid, email: user.email, ...profile });
          return;
        }
        resolve(null);
      } catch (error) {
        console.error("Sales access check failed:", error);
        resolve(null);
      }
    });
  });
}

export async function requireStaff() {
  return requireSalesAccess();
}

export async function logoutAdmin() {

  await signOut(auth);
  window.location.href = "login.html";
}

export function logoutStaff() {

  signOut(auth).finally(() => {
    window.location.href = "login.html";
  });
}

export { getProfile, isAdminProfile, isSalesProfile, redirectByRole, BUSINESS_ID };