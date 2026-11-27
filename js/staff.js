
import { db } from "./firebase.js";
import { requireAdmin, logoutAdmin } from "./auth.js";

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const BUSINESS_ID = "cruz-mobile-hub";
const $ = id => document.getElementById(id);

let staffMembers = [];
let admin = null;

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function showMessage(text, success = false) {
  $("staffMessage").textContent = text;
  $("staffMessage").style.color = success ? "#80d99b" : "#ed7777";
}

function renderStaff() {
  const search = $("staffSearch").value.trim().toLowerCase();

  const filtered = staffMembers.filter(person => {
    const searchable = [
      person.name,
      person.phone,
      person.email,
      person.position
    ].join(" ").toLowerCase();

    return searchable.includes(search);
  });

  const activeCount = staffMembers.filter(
    person => person.active === true
  ).length;

  $("staffCount").textContent = staffMembers.length;
  $("activeStaffCount").textContent = activeCount;
  $("inactiveStaffCount").textContent =
    staffMembers.length - activeCount;

  if (!filtered.length) {
    $("staffTable").innerHTML = `
      <tr>
        <td colspan="7" class="table-empty">
          No salespeople found.
        </td>
      </tr>
    `;
    return;
  }

  $("staffTable").innerHTML = filtered.map(person => `
    <tr>
      <td><strong>${escapeHTML(person.name)}</strong></td>
      <td>${escapeHTML(person.phone || "—")}</td>
      <td>${escapeHTML(person.email || "—")}</td>
      <td>${escapeHTML(person.position || "Salesperson")}</td>
      <td>${escapeHTML(person.startDate || "—")}</td>

      <td>
        <span class="${
          person.active ? "status-active" : "status-inactive"
        }">
          ${person.active ? "Active" : "Inactive"}
        </span>
      </td>

      <td>
        <button
          type="button"
          class="small-action staff-status-btn"
          data-id="${escapeHTML(person.id)}"
          data-active="${person.active ? "false" : "true"}"
        >
          ${person.active ? "Deactivate" : "Activate"}
        </button>
      </td>
    </tr>
  `).join("");
}

async function saveStaff(event) {
  event.preventDefault();

  const name = $("staffName").value.trim();
  const phone = $("staffPhone").value.trim();
  const email = $("staffEmail").value.trim();
  const position = $("staffPosition").value;
  const startDate = $("staffStartDate").value;
  const active = $("staffStatus").value === "active";
  const notes = $("staffNotes").value.trim();

  if (!name || !phone) {
    showMessage("Please enter the salesperson's name and phone number.");
    return;
  }

  const existingPhone = staffMembers.find(person =>
    person.phone.replace(/\s+/g, "") === phone.replace(/\s+/g, "")
  );

  if (existingPhone) {
    showMessage("A salesperson with this phone number is already registered.");
    return;
  }

  if (email) {
    const existingEmail = staffMembers.find(person =>
      (person.email || "").toLowerCase() === email.toLowerCase()
    );

    if (existingEmail) {
      showMessage("A salesperson with this email address is already registered.");
      return;
    }
  }

  const button = $("saveStaffBtn");
  button.disabled = true;
  button.textContent = "Saving...";

  try {
    await addDoc(collection(db, "staff"), {
      businessId: BUSINESS_ID,
      name,
      phone,
      email,
      position,
      startDate,
      notes,
      active,

      // Login account will be linked in a later setup step.
      accountCreated: false,
      authUid: null,

      createdBy: admin.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    $("staffForm").reset();

    showMessage("Salesperson registered successfully.", true);

  } catch (error) {
    console.error("Staff save error:", error);
    showMessage("Could not save salesperson: " + error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Save salesperson";
  }
}

async function changeStaffStatus(id, active) {
  const person = staffMembers.find(member => member.id === id);

  if (!person) return;

  const action = active ? "activate" : "deactivate";

  if (!confirm(`Are you sure you want to ${action} ${person.name}?`)) {
    return;
  }

  try {
    await updateDoc(doc(db, "staff", id), {
      active,
      updatedAt: serverTimestamp()
    });

    showMessage(
      `${person.name} has been ${active ? "activated" : "deactivated"}.`,
      true
    );

  } catch (error) {
    console.error("Staff status update error:", error);
    showMessage("Could not update salesperson: " + error.message);
  }
}

function listenForStaff() {
  onSnapshot(
    collection(db, "staff"),

    snapshot => {
      staffMembers = snapshot.docs
        .map(document => ({
          id: document.id,
          ...document.data()
        }))
        .filter(person => person.businessId === BUSINESS_ID)
        .sort((a, b) =>
          (a.name || "").localeCompare(b.name || "")
        );

      renderStaff();
    },

    error => {
      console.error("Staff loading error:", error);

      $("staffTable").innerHTML = `
        <tr>
          <td colspan="7">
            Could not load salespeople: ${escapeHTML(error.message)}
          </td>
        </tr>
      `;
    }
  );
}

async function start() {
  admin = await requireAdmin();

  if (!admin) return;

  $("adminName").textContent = admin.name || "Administrator";

  $("staffForm").addEventListener("submit", saveStaff);

  $("staffSearch").addEventListener("input", renderStaff);

  $("staffTable").addEventListener("click", event => {
    const button = event.target.closest(".staff-status-btn");

    if (!button) return;

    changeStaffStatus(
      button.dataset.id,
      button.dataset.active === "true"
    );
  });

  $("logoutBtn").addEventListener("click", logoutAdmin);

  $("menuToggle").addEventListener("click", () => {
    $("sidebar").classList.toggle("sidebar-open");
  });

  listenForStaff();
}

start();
