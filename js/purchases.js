
import { db } from "./firebase.js";
import { requireAdmin, logoutAdmin } from "./auth.js";

import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const $ = id => document.getElementById(id);

let products = [];
let purchases = [];

function money(value, currency = "UGX") {
  return `${currency} ${Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: 2
  })}`;
}

function dateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kampala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function showMessage(message, type = "error") {
  const el = $("purchaseMessage");
  el.textContent = message;
  el.className = `cmh-message ${type}`;
}

function updateTotal() {
  const product = products.find(p => p.id === $("purchaseProduct").value);
  const quantity = Number($("purchaseQuantity").value || 0);
  const cost = Number($("purchaseCost").value || 0);

  $("purchaseTotal").textContent = money(
    quantity * cost,
    product?.currency || "UGX"
  );
}

function renderProductOptions() {
  $("purchaseProduct").innerHTML =
    `<option value="">Select a product</option>` +
    products.filter(p => p.active !== false).map(p => `
      <option value="${escapeHTML(p.id)}">
        ${escapeHTML(p.name)} — Stock: ${Number(p.stockQty || 0)}
      </option>
    `).join("");

  updateTotal();
}

function renderPurchases() {
  const search = $("purchaseSearch").value.trim().toLowerCase();

  const filtered = purchases.filter(p => [
    p.productName, p.supplierName, p.paymentMethod, p.notes
  ].join(" ").toLowerCase().includes(search));

  $("purchasesTable").innerHTML = filtered.length
    ? filtered.slice(0, 100).map(p => `
      <tr>
        <td>${escapeHTML(p.dateKey || "—")}</td>
        <td>${escapeHTML(p.productName || "—")}</td>
        <td>${Number(p.quantity || 0)}</td>
        <td>${money(p.unitCost, p.currency)}</td>
        <td>${money(p.total, p.currency)}</td>
        <td>${escapeHTML(p.supplierName || "—")}</td>
        <td>${escapeHTML(p.paymentMethod || "—")}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="7">No purchases found.</td></tr>`;
}

function listenToProducts() {
  onSnapshot(collection(db, "products"), snapshot => {
    products = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderProductOptions();
  }, error => showMessage(error.message));
}

function listenToPurchases() {
  onSnapshot(collection(db, "purchases"), snapshot => {
    purchases = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    purchases.sort((a, b) => {
      const at = a.createdAt?.toMillis?.() || 0;
      const bt = b.createdAt?.toMillis?.() || 0;
      return bt - at;
    });

    renderPurchases();
  }, error => {
    $("purchasesTable").innerHTML =
      `<tr><td colspan="7">Could not load purchases: ${escapeHTML(error.message)}</td></tr>`;
  });
}

async function savePurchase(event) {
  event.preventDefault();

  const productId = $("purchaseProduct").value;
  const quantity = Number($("purchaseQuantity").value);
  const unitCost = Number($("purchaseCost").value);
  const supplierName = $("purchaseSupplier").value.trim();
  const paymentMethod = $("purchasePayment").value;
  const notes = $("purchaseNotes").value.trim();

  if (!productId) return showMessage("Please select a product.");
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return showMessage("Enter a valid whole-number quantity.");
  }
  if (!Number.isFinite(unitCost) || unitCost <= 0) {
    return showMessage("Enter a valid unit buying cost.");
  }

  const button = $("savePurchaseBtn");
  button.disabled = true;
  button.textContent = "Saving purchase...";

  const productRef = doc(db, "products", productId);
  const pricingRef = doc(db, "productPricing", productId);
  const purchaseRef = doc(collection(db, "purchases"));

  try {
    await runTransaction(db, async transaction => {
      const productSnap = await transaction.get(productRef);
      const pricingSnap = await transaction.get(pricingRef);

      if (!productSnap.exists()) {
        throw new Error("The selected product no longer exists.");
      }

      const product = productSnap.data();
      const pricing = pricingSnap.exists() ? pricingSnap.data() : {};

      const currency = product.currency || "UGX";
      const oldQuantity = Number(product.stockQty || 0);
      const oldAverageCost = Number(pricing.wholesaleCost || 0);

      // Weighted-average inventory costing.
      const newQuantity = oldQuantity + quantity;
      const newAverageCost = newQuantity > 0
        ? ((oldQuantity * oldAverageCost) + (quantity * unitCost)) / newQuantity
        : unitCost;

      const total = quantity * unitCost;

      transaction.update(productRef, {
        stockQty: newQuantity,
        updatedAt: serverTimestamp()
      });

      transaction.set(pricingRef, {
        businessId: "cruz-mobile-hub",
        wholesaleCost: Number(newAverageCost.toFixed(4)),
        updatedAt: serverTimestamp()
      }, { merge: true });

      transaction.set(purchaseRef, {
        productId,
        productName: product.name || "",
        quantity,
        unitCost,
        total,
        currency,
        supplierName,
        paymentMethod,
        notes,
        dateKey: dateKey(),
        businessId: "cruz-mobile-hub",
        createdAt: serverTimestamp()
      });
    });

    $("purchaseForm").reset();
    updateTotal();
    showMessage("Purchase saved. Product stock and average buying cost have been updated.", "success");
  } catch (error) {
    console.error("Purchase error:", error);
    showMessage(error.message || "Could not save this purchase.");
  } finally {
    button.disabled = false;
    button.textContent = "Save Purchase & Update Stock";
  }
}

async function start() {
  try {
    const admin = await requireAdmin();
    if (!admin) return;

    const adminName = document.getElementById("adminName");
    if (adminName) adminName.textContent = admin.name || "Administrator";

    listenToProducts();
    listenToPurchases();

    $("purchaseProduct").addEventListener("change", updateTotal);
    $("purchaseQuantity").addEventListener("input", updateTotal);
    $("purchaseCost").addEventListener("input", updateTotal);
    $("purchaseSearch").addEventListener("input", renderPurchases);
    $("purchaseForm").addEventListener("submit", savePurchase);

    $("logoutBtn")?.addEventListener("click", logoutAdmin);
    $("menuToggle")?.addEventListener("click", () => {
      $("sidebar")?.classList.toggle("sidebar-open");
    });
  } catch (error) {
    console.error(error);
  }
}

start();
