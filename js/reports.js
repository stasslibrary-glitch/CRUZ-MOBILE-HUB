
import { db } from "./firebase.js";
import { requireAdmin, logoutAdmin } from "./auth.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const BUSINESS_ID = "cruz-mobile-hub";
const $ = id => document.getElementById(id);

let sales = [];
let expenses = [];
let purchases = [];
let products = [];
let pricing = {};

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
})[c]);

function localDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kampala", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(date);
  const d = {};
  parts.forEach(p => d[p.type] = p.value);
  return `${d.year}-${d.month}-${d.day}`;
}

function dateFromKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function rangeForPeriod() {
  const period = $("reportPeriod").value;
  const now = new Date();
  const today = localDate(now);
  let start = today;
  let end = today;

  if (period === "week") {
    const day = dateFromKey(today).getDay();
    const mondayOffset = (day + 6) % 7;
    const monday = dateFromKey(today);
    monday.setDate(monday.getDate() - mondayOffset);
    start = localDate(monday);
  } else if (period === "month") {
    start = `${today.slice(0, 7)}-01`;
  } else if (period === "year") {
    start = `${today.slice(0, 4)}-01-01`;
  } else if (period === "all") {
    start = "0000-01-01";
    end = "9999-12-31";
  } else if (period === "custom") {
    start = $("reportStart").value;
    end = $("reportEnd").value;
  }

  return { start, end };
}

function inRange(record, start, end) {
  const key = record.dateKey || "";
  return key && key >= start && key <= end;
}

const USD_RATE = 4250;

function saleUGX(sale) {
  const total = Number(sale.total || 0);
  return String(sale.currency || "UGX").toUpperCase() === "USD" ? total * USD_RATE : total;
}

function expenseUGX(expense) {
  const amount = Number(expense.amount || 0);
  return String(expense.currency || "UGX").toUpperCase() === "USD" ? amount * USD_RATE : amount;
}

function purchaseUGX(purchase) {
  const total = Number(purchase.total || 0);
  return String(purchase.currency || "UGX").toUpperCase() === "USD" ? total * USD_RATE : total;
}

function fmtUGX(value) {
  return `UGX ${Number(value || 0).toLocaleString("en-UG", { maximumFractionDigits: 0 })}`;
}

function fmtUSDFromUGX(value) {
  return `USD ${Number((Number(value || 0) / USD_RATE) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function updateCurrency(records) {
  const revenue = records.sales.reduce((n, s) => n + saleUGX(s), 0);

  const cost = records.sales.reduce((n, s) => {
    const unitCost = Number(pricing[s.productId]?.wholesaleCost || 0);
    const costValue = unitCost * Number(s.quantity || 0);
    return n + (String(s.currency || "UGX").toUpperCase() === "USD" ? costValue * USD_RATE : costValue);
  }, 0);

  const expenseTotal = records.expenses.reduce((n, e) => n + expenseUGX(e), 0);
  const purchaseTotal = records.purchases.reduce((n, p) => n + purchaseUGX(p), 0);
  const gross = revenue - cost;
  const net = gross - expenseTotal;

  $("ugxRevenue").textContent = fmtUGX(revenue);
  $("ugxCost").textContent = fmtUGX(cost);
  $("ugxGross").textContent = fmtUGX(gross);
  $("ugxExpenses").textContent = fmtUGX(expenseTotal);
  $("ugxNet").textContent = fmtUGX(net);
  $("ugxPurchases").textContent = fmtUGX(purchaseTotal);

  $("usdRevenue").textContent = fmtUSDFromUGX(revenue);
  $("usdCost").textContent = fmtUSDFromUGX(cost);
  $("usdGross").textContent = fmtUSDFromUGX(gross);
  $("usdExpenses").textContent = fmtUSDFromUGX(expenseTotal);
  $("usdNet").textContent = fmtUSDFromUGX(net);
  $("usdPurchases").textContent = fmtUSDFromUGX(purchaseTotal);
}

function renderReport() {
  const { start, end } = rangeForPeriod();

  if (!start || !end || start > end) {
    $("reportMessage").textContent = "Choose a valid start and end date.";
    return;
  }

  $("reportMessage").textContent = `Showing records from ${start} to ${end}.`;

  const records = {
    sales: sales.filter(s => inRange(s, start, end)),
    expenses: expenses.filter(e => inRange(e, start, end)),
    purchases: purchases.filter(p => inRange(p, start, end))
  };

  updateCurrency(records);

  $("reportSalesCount").textContent = records.sales.length;
  $("reportUnitsSold").textContent = records.sales.reduce((n, s) => n + Number(s.quantity || 0), 0);
  $("reportPurchaseCount").textContent = records.purchases.length;
  $("reportExpenseCount").textContent = records.expenses.length;
}

function setupCollection(name, callback) {
  return onSnapshot(collection(db, name), snapshot => {
    callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(item => item.businessId === BUSINESS_ID));
    renderReport();
  }, error => {
    console.error(`Could not load ${name}:`, error);
    $("reportMessage").textContent = `Could not load ${name}: ${error.message}`;
  });
}

async function start() {
  const admin = await requireAdmin();
  if (!admin) return;

  $("adminName").textContent = admin.name || "Administrator";

  $("reportPeriod").addEventListener("change", () => {
    const custom = $("reportPeriod").value === "custom";
    $("reportStart").disabled = !custom;
    $("reportEnd").disabled = !custom;
    renderReport();
  });
  $("reportStart").addEventListener("change", renderReport);
  $("reportEnd").addEventListener("change", renderReport);
  $("logoutBtn").addEventListener("click", logoutAdmin);
  $("menuToggle").addEventListener("click", () => $("sidebar").classList.toggle("sidebar-open"));
  $("printReportBtn").addEventListener("click", () => window.print());

  setupCollection("sales", data => sales = data);
  setupCollection("expenses", data => expenses = data);
  setupCollection("purchases", data => purchases = data);

  onSnapshot(collection(db, "products"), snapshot => {
    products = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(p => p.businessId === BUSINESS_ID);
    renderReport();
  });

  onSnapshot(collection(db, "productPricing"), snapshot => {
    pricing = {};
    snapshot.docs.forEach(d => {
      const data = d.data();
      if (data.businessId === BUSINESS_ID) pricing[d.id] = data;
    });
    renderReport();
  });
}

start();
