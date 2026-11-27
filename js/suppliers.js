
import { db } from "./firebase.js";
import { requireAdmin, logoutAdmin } from "./auth.js";
import {
  collection, doc, addDoc, updateDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const BUSINESS_ID = "cruz-mobile-hub";
const $ = id => document.getElementById(id);

let suppliers = [];

const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
})[c]);

function showMessage(text, success = false) {
  $("supplierMessage").textContent = text;
  $("supplierMessage").style.color = success ? "#80d99b" : "#ed7777";
}

function renderSuppliers() {
  const term = $("supplierSearch").value.trim().toLowerCase();

  const filtered = suppliers.filter(s => [
    s.name, s.phone, s.email, s.location
  ].join(" ").toLowerCase().includes(term));

  const active = suppliers.filter(s => s.active !== false).length;
  $("supplierCount").textContent = suppliers.length;
  $("activeSupplierCount").textContent = active;
  $("inactiveSupplierCount").textContent = suppliers.length - active;

  $("suppliersTable").innerHTML = filtered.length
    ? filtered.map(s => `
      <tr>
        <td><strong>${escapeHTML(s.name)}</strong></td>
        <td>${escapeHTML(s.phone || "—")}</td>
        <td>${escapeHTML(s.email || "—")}</td>
        <td>${escapeHTML(s.location || "—")}</td>
        <td>
          <span class="${s.active === false ? "status-inactive" : "status-active"}">
            ${s.active === false ? "Inactive" : "Active"}
          </span>
        </td>
        <td>
          <button
            type="button"
            class="small-action supplier-status-btn"
            data-id="${escapeHTML(s.id)}"
            data-active="${s.active === false ? "true" : "false"}">
            ${s.active === false ? "Activate" : "Deactivate"}
          </button>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="6" class="table-empty">No suppliers found.</td></tr>`;
}

async function saveSupplier(event) {
  event.preventDefault();

  const name = $("supplierName").value.trim();
  const phone = $("supplierPhone").value.trim();
  const email = $("supplierEmail").value.trim();
  const location = $("supplierLocation").value.trim();
  const notes = $("supplierNotes").value.trim();

  if (!name || !phone) {
    showMessage("Supplier name and phone number are required.");
    return;
  }

  const button = $("saveSupplierBtn");
  button.disabled = true;
  button.textContent = "Saving supplier...";

  try {
    await addDoc(collection(db, "suppliers"), {
      businessId: BUSINESS_ID,
      name,
      phone,
      email,
      location,
      notes,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    $("supplierForm").reset();
    showMessage("Supplier saved successfully.", true);

  } catch (error) {
    console.error("Supplier save error:", error);
    showMessage("Could not save supplier: " + error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Save supplier";
  }
}

async function changeStatus(id, active) {
  const supplier = suppliers.find(s => s.id === id);
  if (!supplier) return;

  const confirmed = confirm(
    active ? "Activate this supplier?" : "Deactivate this supplier?"
  );
  if (!confirmed) return;

  try {
    await updateDoc(doc(db, "suppliers", id), {
      active,
      updatedAt: serverTimestamp()
    });
    showMessage("Supplier status updated.", true);
  } catch (error) {
    console.error("Supplier status error:", error);
    showMessage("Could not update supplier: " + error.message);
  }
}

async function start() {
  const admin = await requireAdmin();
  if (!admin) return;

  $("adminName").textContent = admin.name || "Administrator";

  $("supplierForm").addEventListener("submit", saveSupplier);
  $("supplierSearch").addEventListener("input", renderSuppliers);

  $("suppliersTable").addEventListener("click", event => {
    const button = event.target.closest(".supplier-status-btn");
    if (!button) return;

    changeStatus(button.dataset.id, button.dataset.active === "true");
  });

  $("logoutBtn").addEventListener("click", logoutAdmin);
  $("menuToggle").addEventListener("click", () => {
    $("sidebar").classList.toggle("sidebar-open");
  });

  onSnapshot(collection(db, "suppliers"), snapshot => {
    suppliers = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(s => s.businessId === BUSINESS_ID)
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    renderSuppliers();
  }, error => {
    console.error("Supplier loading error:", error);
    $("suppliersTable").innerHTML = `
      <tr><td colspan="6">Could not load suppliers: ${escapeHTML(error.message)}</td></tr>
    `;
  });
}

start();
