
import { db } from "./firebase.js";
import { requireAdmin, logoutAdmin } from "./auth.js";
import { applyTheme } from "./theme-loader.js";
import {
  doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const BUSINESS_ID = "cruz-mobile-hub";
const SETTINGS_ID = "business";
const $ = id => document.getElementById(id);

function showMessage(text, success = false) {
  $("settingsMessage").textContent = text;
  $("settingsMessage").style.color = success ? "#80d99b" : "#ed7777";
}

function fillSettings(data = {}) {
  const currentTheme = localStorage.getItem("cruz_theme") || document.documentElement.getAttribute("data-theme") || "midnight-blue";
  const theme = data.appTheme || currentTheme;
  $("businessName").value = data.businessName || "Cruz Mobile Hub";
  $("businessPhone").value = data.businessPhone || "";
  $("businessEmail").value = data.businessEmail || "";
  $("businessLocation").value = data.businessLocation || "";
  $("defaultCurrency").value = data.defaultCurrency || "Both";
  $("lowStockDefault").value = Number.isInteger(data.lowStockDefault)
    ? data.lowStockDefault : 5;
  $("appTheme").value = theme;
  applyTheme(theme);
}

async function saveSettings(event) {
  event.preventDefault();

  const businessName = $("businessName").value.trim();
  const lowStockDefault = Number($("lowStockDefault").value);

  if (!businessName) {
    showMessage("Enter your business name.");
    return;
  }

  if (!Number.isInteger(lowStockDefault) || lowStockDefault < 0) {
    showMessage("Low-stock threshold must be a whole number of zero or more.");
    return;
  }

  const button = $("saveSettingsBtn");
  button.disabled = true;
  button.textContent = "Saving...";

  const data = {
    businessId: BUSINESS_ID,
    businessName,
    businessPhone: $("businessPhone").value.trim(),
    businessEmail: $("businessEmail").value.trim(),
    businessLocation: $("businessLocation").value.trim(),
    defaultCurrency: $("defaultCurrency").value,
    lowStockDefault,
    appTheme: $("appTheme").value,
    updatedAt: serverTimestamp()
  };

  try {
    await setDoc(doc(db, "settings", SETTINGS_ID), data, { merge: true });
    applyTheme(data.appTheme);
    showMessage("Business settings saved successfully.", true);
  } catch (error) {
    console.error("Settings save error:", error);
    showMessage("Could not save settings: " + error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Save settings";
  }
}

async function start() {
  const admin = await requireAdmin();
  if (!admin) return;

  $("adminName").textContent = admin.name || "Administrator";
  $("settingsForm").addEventListener("submit", saveSettings);
  $("appTheme").addEventListener("change", () => applyTheme($("appTheme").value));
  $("logoutBtn").addEventListener("click", logoutAdmin);
  $("menuToggle").addEventListener("click", () => $("sidebar").classList.toggle("sidebar-open"));

  try {
    const snapshot = await getDoc(doc(db, "settings", SETTINGS_ID));
    fillSettings(snapshot.exists() ? snapshot.data() : { appTheme: "midnight-blue" });
  } catch (error) {
    console.error("Settings load error:", error);
    fillSettings();
    showMessage("Could not load saved settings: " + error.message);
  }
}

start();
