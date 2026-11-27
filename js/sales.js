
import { db } from "./firebase.js";
import { requireSalesAccess, logoutStaff, isAdminProfile } from "./auth.js";

import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const BUSINESS_ID = "cruz-mobile-hub";
const $ = id => document.getElementById(id);

let products = [];
let sales = [];
let currentUser = null;
let selectedProduct = null;
let salesPageStarted = false;
let unsubProducts = null;
let unsubSales = null;

function dateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kampala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const values = {};
  parts.forEach(part => { values[part.type] = part.value; });
  return `${values.year}-${values.month}-${values.day}`;
}

function money(value, currency = "UGX") {
  return `${currency} ${Number(value || 0).toLocaleString("en-UG", {
    maximumFractionDigits: 2
  })}`;
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
  const element = $("saleMessage");
  if (!element) return;
  element.textContent = message;
  element.className = `cmh-message ${type}`;
}

function renderProductOptions() {
  const select = $("saleProduct");
  const previousSelection = select.value;
  const availableProducts = products.filter(product =>
    product.active === true && Number(product.stockQty || 0) > 0
  );

  if (!availableProducts.length) {
    select.innerHTML = `<option value="">No available products found</option>`;
    selectedProduct = null;
    updateTotal();
    return;
  }

  select.innerHTML = `
    <option value="">Select a product</option>
    ${availableProducts.map(product => `
      <option value="${escapeHTML(product.id)}">
        ${escapeHTML(product.name)} —
        ${money(product.standardPrice, product.currency)}
        (Stock: ${Number(product.stockQty || 0)})
      </option>
    `).join("")}
  `;

  if (availableProducts.some(product => product.id === previousSelection)) {
    select.value = previousSelection;
  }

  updateSelectedProduct();
}

function updateSelectedProduct() {
  const productId = $("saleProduct").value;
  selectedProduct = products.find(product => product.id === productId) || null;
  $("salePrice").value = selectedProduct ? Number(selectedProduct.standardPrice || 0) : "";
  updateTotal();
}

function updateTotal() {
  const quantity = Number($("saleQuantity").value || 0);
  const price = Number($("salePrice").value || 0);
  const currency = selectedProduct?.currency || "UGX";
  $("saleTotal").textContent = money(quantity * price, currency);
}

let salesPeriod = "daily";

function getSaleDate(sale) {
  if (sale?.createdAt?.toDate) return sale.createdAt.toDate();
  if (sale?.dateKey && /^\d{4}-\d{2}-\d{2}$/.test(sale.dateKey)) return new Date(`${sale.dateKey}T00:00:00+03:00`);
  return null;
}

function isInPeriod(sale, period) {
  if (period === "all") return true;
  const date = getSaleDate(sale);
  if (!date) return false;
  const now = new Date();
  if (period === "daily") return dateKey(date) === dateKey(now);
  if (period === "monthly") {
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }
  if (period === "weekly") {
    const start = new Date(now);
    const day = start.getDay(); // 0 Sun
    const diffToMonday = (day + 6) % 7;
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - diffToMonday);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return date >= start && date < end;
  }
  return true;
}

function renderSales() {
  const search = ($("salesSearch")?.value || "").trim().toLowerCase();
  const period = $("salesPeriodFilter")?.value || salesPeriod || "daily";
  salesPeriod = period;

  const filtered = sales.filter(sale => {
    if (!isInPeriod(sale, period)) return false;
    const searchable = [
      sale.receiptNo,
      sale.productName,
      sale.customerName,
      sale.paymentMethod,
      sale.cashierName
    ].join(" ").toLowerCase();
    return searchable.includes(search);
  });

  $("salesTable").innerHTML = filtered.length
    ? filtered.slice(0, 100).map(sale => `
      <tr>
        <td>${escapeHTML(sale.receiptNo || "—")}</td>
        <td>${escapeHTML(sale.dateKey || "—")}</td>
        <td>${escapeHTML(sale.productName || "—")}</td>
        <td>${Number(sale.quantity || 0)}</td>
        <td>${money(sale.total, sale.currency)}</td>
        <td>${escapeHTML(sale.paymentMethod || "—")}</td>
        <td>${escapeHTML(sale.customerName || "Walk-in")}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="7" class="sales-table-empty">No sales found for this period.</td></tr>`;

  const today = dateKey();
  const todaysSales = sales.filter(sale => sale.dateKey === today);
  const totals = {};
  todaysSales.forEach(sale => {
    const currency = sale.currency || "UGX";
    totals[currency] = (totals[currency] || 0) + Number(sale.total || 0);
  });

  $("todaySales").textContent = Object.keys(totals).length
    ? Object.entries(totals).map(([currency, total]) => money(total, currency)).join(" | ")
    : "UGX 0";
  $("todayTransactions").textContent = todaysSales.length;
  $("allTransactions").textContent = sales.length;
}

function listenToProducts() {
  unsubProducts?.();
  unsubProducts = onSnapshot(
    query(
      collection(db, "products"),
      where("businessId", "==", BUSINESS_ID),
      where("active", "==", true)
    ),
    snapshot => {
      products = snapshot.docs
        .map(item => ({ id: item.id, ...item.data() }));
      renderProductOptions();
      if (!products.length) {
        showMessage("No products found. Add products on the Products page.");
      } else if ($("saleMessage")?.textContent?.includes("No products found")) {
        showMessage("");
      }
    },
    error => {
      console.error("Sales product loading error:", error);
      $("saleProduct").innerHTML = `<option value="">Could not load products</option>`;
      showMessage("Could not load products: " + error.message);
    }
  );
}

function listenToSales() {
  unsubSales?.();
  const canSeeAllSales = isAdminProfile(currentUser);
  const salesQuery = canSeeAllSales
    ? query(collection(db, "sales"), where("businessId", "==", BUSINESS_ID))
    : query(
        collection(db, "sales"),
        where("businessId", "==", BUSINESS_ID),
        where("cashierUid", "==", currentUser?.uid || "")
      );

  unsubSales = onSnapshot(
    salesQuery,
    snapshot => {
      sales = snapshot.docs
        .map(item => ({ id: item.id, ...item.data() }));

      sales.sort((a, b) => {
        const timeA = a.createdAt?.toMillis?.() || 0;
        const timeB = b.createdAt?.toMillis?.() || 0;
        return timeB - timeA;
      });

      renderSales();
    },
    error => {
      console.error("Sales history loading error:", error);
      $("salesTable").innerHTML = `
        <tr>
          <td colspan="7">Could not load sales: ${escapeHTML(error.message)}</td>
        </tr>
      `;
    }
  );
}

async function recordSale(event) {
  event.preventDefault();

  const productId = $("saleProduct").value;
  const quantity = Number($("saleQuantity").value);
  const price = Number($("salePrice").value);
  const paymentMethod = $("salePayment").value;
  const customerName = $("saleCustomer").value.trim();
  const notes = $("saleNotes").value.trim();

  if (!productId) return showMessage("Please select a product.");
  if (!Number.isInteger(quantity) || quantity <= 0) return showMessage("Enter a valid whole-number quantity.");
  if (!Number.isFinite(price) || price <= 0) return showMessage("Enter a valid selling price.");

  const product = products.find(item => item.id === productId);
  if (!product) return showMessage("Product not found. Please refresh the page.");

  const button = $("saveSaleBtn");
  button.disabled = true;
  button.textContent = "Recording sale...";

  const productRef = doc(db, "products", productId);
  const pricingRef = doc(db, "productPricing", productId);
  const saleRef = doc(collection(db, "sales"));
  const receiptNo = `CMH-${Date.now()}`;

  try {
    await runTransaction(db, async transaction => {
      const productSnapshot = await transaction.get(productRef);
      const pricingSnapshot = await transaction.get(pricingRef);

      if (!productSnapshot.exists()) throw new Error("This product no longer exists.");

      const freshProduct = productSnapshot.data();
      const pricing = pricingSnapshot.exists() ? pricingSnapshot.data() : {};

      if (freshProduct.businessId !== BUSINESS_ID) throw new Error("This product does not belong to Cruz Mobile Hub.");
      if (freshProduct.active !== true) throw new Error("This product is inactive.");

      const stock = Number(freshProduct.stockQty || 0);
      const minimumPrice = Number(pricing.minimumPrice || 0);

      if (stock < quantity) throw new Error(`Not enough stock. Available quantity: ${stock}.`);
      if (price < minimumPrice) {
        throw new Error(`The minimum selling price is ${money(minimumPrice, freshProduct.currency)}.`);
      }

      const total = quantity * price;
      const remainingStock = stock - quantity;
      const today = dateKey();

      transaction.update(productRef, {
        stockQty: remainingStock,
        updatedAt: serverTimestamp()
      });

      transaction.set(saleRef, {
        businessId: BUSINESS_ID,
        receiptNo,
        productId,
        productName: freshProduct.name || "",
        quantity,
        unitPrice: price,
        total,
        currency: freshProduct.currency || "UGX",
        paymentMethod,
        customerName,
        notes,
        dateKey: today,
        cashierName: currentUser?.name || "Salesperson",
        cashierUid: currentUser?.uid || "sales",
        cashierRole: currentUser?.role || "salesperson",
        createdAt: serverTimestamp()
      });

      if (remainingStock <= Number(freshProduct.minimumStock || 0)) {
        const notificationRef = doc(collection(db, "notifications"));
        transaction.set(notificationRef, {
          businessId: BUSINESS_ID,
          type: remainingStock <= 0 ? "out_of_stock" : "low_stock",
          productId,
          productName: freshProduct.name || "",
          remainingStock,
          message: remainingStock <= 0
            ? `${freshProduct.name} is out of stock.`
            : `${freshProduct.name} has reached its low-stock level.`,
          read: false,
          createdAt: serverTimestamp()
        });
      }
    });

    $("saleForm").reset();
    selectedProduct = null;
    updateSelectedProduct();
    showMessage(`Sale recorded successfully. Receipt: ${receiptNo}`, "success");
  } catch (error) {
    console.error("Sale recording error:", error);
    showMessage(error.message || "Could not record this sale.");
  } finally {
    button.disabled = false;
    button.textContent = "Record Sale";
  }
}

function showSalesApp(user) {
  const app = $("salesApplication");
  if (app) app.style.display = "flex";
  const label = $("salesUserLabel");
  if (label) label.textContent = user?.name || user?.email || "Salesperson";
  const adminBtn = $("adminAreaBtn");
  if (adminBtn) adminBtn.style.display = isAdminProfile(user) ? "inline-flex" : "none";
}

function startSalesPage(user) {
  currentUser = {
    uid: user.uid || "",
    name: user.name || user.email || "Salesperson",
    role: user.role || "salesperson"
  };

  if (salesPageStarted) return;
  salesPageStarted = true;

  $("saleProduct").addEventListener("change", updateSelectedProduct);
  $("saleQuantity").addEventListener("input", updateTotal);
  $("salePrice").addEventListener("input", updateTotal);
  $("saleForm").addEventListener("submit", recordSale);
  $("salesSearch").addEventListener("input", renderSales);
  $("salesPeriodFilter")?.addEventListener("change", renderSales);
  $("logoutBtn")?.addEventListener("click", logoutStaff);

  listenToProducts();
  listenToSales();
}

async function init() {
  try {
    const user = await requireSalesAccess();
    if (user) {
      showSalesApp(user);
      startSalesPage(user);
      return;
    }
  } catch (error) {
    console.error("Sales init error:", error);
  }

  window.location.replace("login.html");
}

init();
