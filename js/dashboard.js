
import { db } from "./firebase.js";
import { requireAdmin, logoutAdmin } from "./auth.js";

import {
  collection,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const BUSINESS_ID = "cruz-mobile-hub";

const $ = id => document.getElementById(id);

const admin = await requireAdmin();

if (admin) {
  $("adminName").textContent = admin.name || "Administrator";
  $("welcomeName").textContent = admin.name || "Administrator";

  $("todayDate").textContent = new Intl.DateTimeFormat("en-UG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Kampala"
  }).format(new Date());

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }

  function money(amount, currency) {
    return `${currency} ${Number(amount || 0).toLocaleString("en-UG", {
      maximumFractionDigits: 2
    })}`;
  }

  function getTodayKey() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Kampala",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());

    const values = {};
    parts.forEach(part => values[part.type] = part.value);

    return `${values.year}-${values.month}-${values.day}`;
  }

  let products = [];
  let sales = [];

  function isValidSale(sale) {
    const status = String(sale.status || "").toLowerCase();

    return !["cancelled", "canceled", "void", "refunded"].includes(status);
  }

  function updateDashboard() {
    const activeProducts = products.filter(
      product => product.active === true
    );

    const totalUnits = activeProducts.reduce(
      (sum, product) => sum + Number(product.stockQty || 0),
      0
    );

    const lowStockProducts = activeProducts.filter(product =>
      Number(product.stockQty || 0) <=
      Number(product.minimumStock || 0)
    );

    const today = getTodayKey();

    // Include completed sales and older sales without a status field.
    const validSales = sales.filter(isValidSale);

    const todaysSales = validSales.filter(
      sale => sale.dateKey === today
    );

    // Today's sales, separated by currency.
    const todayUGX = todaysSales
      .filter(sale => (sale.currency || "UGX") === "UGX")
      .reduce((sum, sale) => sum + Number(sale.total || 0), 0);

    const todayUSD = todaysSales
      .filter(sale => sale.currency === "USD")
      .reduce((sum, sale) => sum + Number(sale.total || 0), 0);

    // All-time sales, separated by currency.
    const allTimeUGX = validSales
      .filter(sale => (sale.currency || "UGX") === "UGX")
      .reduce((sum, sale) => sum + Number(sale.total || 0), 0);

    const allTimeUSD = validSales
      .filter(sale => sale.currency === "USD")
      .reduce((sum, sale) => sum + Number(sale.total || 0), 0);

    // Update existing dashboard elements.
    $("totalProducts").textContent =
      activeProducts.length.toLocaleString();

    $("stockUnits").textContent =
      totalUnits.toLocaleString();

    $("lowStock").textContent =
      lowStockProducts.length.toLocaleString();

    $("todaySalesUGX").textContent = money(todayUGX, "UGX");
    $("todaySalesUSD").textContent = money(todayUSD, "USD");

    // Update all-time elements if they exist in the HTML.
    if ($("allTimeSalesUGX")) {
      $("allTimeSalesUGX").textContent = money(allTimeUGX, "UGX");
    }

    if ($("allTimeSalesUSD")) {
      $("allTimeSalesUSD").textContent = money(allTimeUSD, "USD");
    }

    if ($("todayTransactionCount")) {
      $("todayTransactionCount").textContent = todaysSales.length;
    }

    if ($("allTimeTransactionCount")) {
      $("allTimeTransactionCount").textContent = validSales.length;
    }

    // Low-stock alerts.
    const alertContainer = $("stockAlerts");

    if (alertContainer) {
      if (!lowStockProducts.length) {
        alertContainer.innerHTML = `
          <div class="empty-state">
            <span>✓</span>
            <p>No low-stock products at the moment.</p>
          </div>
        `;
      } else {
        alertContainer.innerHTML = lowStockProducts
          .slice(0, 8)
          .map(product => `
            <div class="alert-row">
              <div>
                <strong>${escapeHTML(product.name)}</strong>
                <small>
                  Minimum level: ${Number(product.minimumStock || 0)}
                </small>
              </div>
              <span class="stock-warning">
                ${Number(product.stockQty || 0)} left
              </span>
            </div>
          `).join("");
      }
    }

    console.log("Dashboard updated:", {
      today,
      totalProducts: activeProducts.length,
      todayTransactions: todaysSales.length,
      todayUGX,
      todayUSD,
      allTimeUGX,
      allTimeUSD
    });
  }

  // Listen for products.
  onSnapshot(
    collection(db, "products"),
    snapshot => {
      products = snapshot.docs
        .map(document => ({
          id: document.id,
          ...document.data()
        }))
        .filter(product => product.businessId === BUSINESS_ID);

      updateDashboard();
    },
    error => {
      console.error("Products listener error:", error);
    }
  );

  // Listen for sales.
  onSnapshot(
    collection(db, "sales"),
    snapshot => {
      sales = snapshot.docs
        .map(document => ({
          id: document.id,
          ...document.data()
        }))
        .filter(sale => sale.businessId === BUSINESS_ID);

      updateDashboard();
    },
    error => {
      console.error("Sales listener error:", error);
    }
  );

$("logoutBtn")?.addEventListener("click", logoutAdmin);
  $("refreshBtn")?.addEventListener("click", updateDashboard);
  $("menuToggle")?.addEventListener("click", () => $("sidebar")?.classList.toggle("sidebar-open"));
}