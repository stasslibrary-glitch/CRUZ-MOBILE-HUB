import { db } from "./firebase.js";
import { requireAdmin, logoutAdmin } from "./auth.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const BUSINESS_ID = "cruz-mobile-hub";
const USD_RATE = 4250;
const $ = id => document.getElementById(id);

let sales = [];

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
})[c]);

function fmtUGX(value) {
  return `UGX ${Number(value || 0).toLocaleString("en-UG", { maximumFractionDigits: 0 })}`;
}

function fmtUSD(value) {
  return `USD ${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function saleUGX(sale) {
  const total = Number(sale.total || 0);
  const currency = String(sale.currency || "UGX").toUpperCase();
  if (currency === "USD") return total * USD_RATE;
  return total;
}

function sellerLabel(sale) {
  return sale.cashierName || sale.soldByName || sale.staffName || sale.recordedBy || sale.createdByName || "Unknown";
}

function sellerKey(sale) {
  return sale.cashierUid || sale.soldByUid || sale.staffId || sellerLabel(sale);
}

function populateSellerFilter() {
  const select = $("salespersonFilter");
  const current = select.value || "all";
  const map = new Map();
  sales.forEach(sale => {
    const key = String(sellerKey(sale));
    const label = sellerLabel(sale);
    if (!map.has(key)) map.set(key, label);
  });
  const options = [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  select.innerHTML = `<option value="all">All salespeople</option>` +
    options.map(([key, label]) => `<option value="${esc(key)}">${esc(label)}</option>`).join("");
  if ([...select.options].some(o => o.value === current)) select.value = current;
}

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
  if (period === "daily") {
    const a = date.toLocaleDateString("en-CA", { timeZone: "Africa/Kampala" });
    const b = now.toLocaleDateString("en-CA", { timeZone: "Africa/Kampala" });
    return a === b;
  }
  if (period === "monthly") {
    const ay = date.toLocaleDateString("en-CA", { timeZone: "Africa/Kampala", year: "numeric" });
    const am = date.toLocaleDateString("en-CA", { timeZone: "Africa/Kampala", month: "2-digit" });
    const by = now.toLocaleDateString("en-CA", { timeZone: "Africa/Kampala", year: "numeric" });
    const bm = now.toLocaleDateString("en-CA", { timeZone: "Africa/Kampala", month: "2-digit" });
    return ay === by && am === bm;
  }
  if (period === "weekly") {
    const localNow = new Date(now.toLocaleString("en-US", { timeZone: "Africa/Kampala" }));
    const day = localNow.getDay();
    const diffToMonday = (day + 6) % 7;
    localNow.setHours(0, 0, 0, 0);
    localNow.setDate(localNow.getDate() - diffToMonday);
    const weekStart = localNow;
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    const localDate = new Date(date.toLocaleString("en-US", { timeZone: "Africa/Kampala" }));
    return localDate >= weekStart && localDate < weekEnd;
  }
  return true;
}

function render() {
  const period = $("salesPeriodFilter")?.value || "daily";
  const filter = $("salespersonFilter").value;
  const term = ($("historySearch").value || "").trim().toLowerCase();

  let filtered = sales.filter(s => isInPeriod(s, period));
  if (filter !== "all") {
    filtered = filtered.filter(s => String(sellerKey(s)) === filter);
  }
  if (term) {
    filtered = filtered.filter(s => {
      const hay = [s.receiptNo, s.productName, s.customerName, s.paymentMethod, sellerLabel(s), s.dateKey].join(" ").toLowerCase();
      return hay.includes(term);
    });
  }

  const totalUGX = filtered.reduce((sum, s) => sum + saleUGX(s), 0);
  $("historyCount").textContent = filtered.length.toLocaleString();
  $("historyTotalUGX").textContent = fmtUGX(totalUGX);
  $("historyTotalUSD").textContent = fmtUSD(totalUGX / USD_RATE);

  const table = $("historyTable");
  if (!filtered.length) {
    table.innerHTML = `<tr><td colspan="8" class="table-empty">No sales found for this filter.</td></tr>`;
    return;
  }

  table.innerHTML = filtered.slice(0, 300).map(s => `
    <tr>
      <td>${esc(s.receiptNo || "—")}</td>
      <td>${esc(s.dateKey || "—")}</td>
      <td>${esc(s.productName || "—")}</td>
      <td>${Number(s.quantity || 0)}</td>
      <td>${esc(s.currency || "UGX")} ${Number(s.total || 0).toLocaleString("en-UG", { maximumFractionDigits: 2 })}</td>
      <td>${esc(s.paymentMethod || "—")}</td>
      <td>${esc(s.customerName || "Walk-in")}</td>
      <td>${esc(sellerLabel(s))}</td>
    </tr>
  `).join("");
}

async function start() {
  const admin = await requireAdmin();
  if (!admin) return;
  $("adminName").textContent = admin.name || "Administrator";

  $("salesPeriodFilter")?.addEventListener("change", render);
  $("salespersonFilter").addEventListener("change", render);
  $("historySearch").addEventListener("input", render);
  $("logoutBtn").addEventListener("click", logoutAdmin);
  $("menuToggle").addEventListener("click", () => $("sidebar").classList.toggle("sidebar-open"));

  onSnapshot(collection(db, "sales"), snapshot => {
    sales = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(s => s.businessId === BUSINESS_ID);
    sales.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    populateSellerFilter();
    render();
    $("historyMessage").textContent = "";
  }, error => {
    console.error("Sales history load error:", error);
    $("historyMessage").textContent = "Could not load sales: " + error.message;
    $("historyTable").innerHTML = `<tr><td colspan="8" class="table-empty">Could not load sales.</td></tr>`;
  });
}

start();
