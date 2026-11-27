
import { db } from "./firebase.js";
import { requireAdmin, logoutAdmin } from "./auth.js";
import {
  collection, addDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const BUSINESS_ID = "cruz-mobile-hub";
const $ = id => document.getElementById(id);
let admin;
let expenses = [];

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
})[c]);

const today = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kampala", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const d = {};
  parts.forEach(p => d[p.type] = p.value);
  return `${d.year}-${d.month}-${d.day}`;
};

const money = (amount, currency) =>
  `${currency} ${Number(amount || 0).toLocaleString("en-UG", { maximumFractionDigits: 2 })}`;

function showMessage(text, success = false) {
  $("expenseMessage").textContent = text;
  $("expenseMessage").style.color = success ? "#80d99b" : "#ed7777";
}

function renderExpenses() {
  const term = $("expenseSearch").value.trim().toLowerCase();
  const filtered = expenses.filter(e =>
    [e.title, e.category, e.paidTo, e.reference, e.paymentMethod]
      .join(" ").toLowerCase().includes(term)
  );

  const todayExpenses = expenses.filter(e => e.dateKey === today());
  const sum = currency => todayExpenses
    .filter(e => e.currency === currency)
    .reduce((n, e) => n + Number(e.amount || 0), 0);

  $("expenseCount").textContent = expenses.length;
  $("todayUGX").textContent = money(sum("UGX"), "UGX");
  $("todayUSD").textContent = money(sum("USD"), "USD");

  $("expensesTable").innerHTML = filtered.length ? filtered.slice(0, 200).map(e => `
    <tr>
      <td>${esc(e.dateKey || "—")}</td>
      <td><strong>${esc(e.title)}</strong></td>
      <td>${esc(e.category)}</td>
      <td>${esc(e.paidTo || "—")}</td>
      <td>${esc(e.paymentMethod || "—")}</td>
      <td>${money(e.amount, e.currency)}</td>
      <td>${esc(e.currency)}</td>
    </tr>
  `).join("") : `<tr><td colspan="7" class="table-empty">No expenses found.</td></tr>`;
}

async function saveExpense(event) {
  event.preventDefault();

  const title = $("expenseTitle").value.trim();
  const category = $("expenseCategory").value;
  const amount = Number($("expenseAmount").value);
  const currency = $("expenseCurrency").value;
  const dateKey = $("expenseDate").value;

  if (!title || !category || !dateKey || !Number.isFinite(amount) || amount <= 0) {
    showMessage("Enter a description, category, valid amount and date.");
    return;
  }

  const button = $("saveExpenseBtn");
  button.disabled = true;
  button.textContent = "Saving...";

  try {
    await addDoc(collection(db, "expenses"), {
      businessId: BUSINESS_ID,
      title,
      category,
      amount,
      currency,
      dateKey,
      paymentMethod: $("expensePayment").value,
      reference: $("expenseReference").value.trim(),
      paidTo: $("expensePaidTo").value.trim(),
      notes: $("expenseNotes").value.trim(),
      recordedBy: admin.uid,
      createdAt: serverTimestamp()
    });

    $("expenseForm").reset();
    $("expenseDate").value = today();
    showMessage("Expense recorded successfully.", true);
  } catch (error) {
    console.error(error);
    showMessage("Could not save expense: " + error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Save expense";
  }
}

async function start() {
  admin = await requireAdmin();
  if (!admin) return;

  $("adminName").textContent = admin.name || "Administrator";
  $("expenseDate").value = today();
  $("expenseForm").addEventListener("submit", saveExpense);
  $("expenseSearch").addEventListener("input", renderExpenses);
  $("logoutBtn").addEventListener("click", logoutAdmin);
  $("menuToggle").addEventListener("click", () => $("sidebar").classList.toggle("sidebar-open"));

  onSnapshot(collection(db, "expenses"), snapshot => {
    expenses = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(e => e.businessId === BUSINESS_ID)
      .sort((a, b) => (b.dateKey || "").localeCompare(a.dateKey || ""));
    renderExpenses();
  }, error => {
    $("expensesTable").innerHTML = `<tr><td colspan="7">Could not load expenses: ${esc(error.message)}</td></tr>`;
  });
}

start();
