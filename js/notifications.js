import { db } from "./firebase.js";
import { requireAdmin, logoutAdmin } from "./auth.js";
import {
  collection, doc, onSnapshot, updateDoc, writeBatch
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const BUSINESS_ID = "cruz-mobile-hub";
const $ = id => document.getElementById(id);
let notifications = [];

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
})[c]);

function formatTime(ts) {
  if (!ts) return "—";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-UG", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Kampala"
  }).format(date);
}

function isStockType(n) {
  return n.type === "low_stock" || n.type === "out_of_stock";
}

function labelForType(type) {
  if (type === "low_stock") return "Low stock";
  if (type === "out_of_stock") return "Out of stock";
  return "Notification";
}

function render() {
  const filter = $("notificationFilter").value;
  let filtered = notifications;
  if (filter === "unread") filtered = filtered.filter(n => !n.read);
  if (filter === "read") filtered = filtered.filter(n => n.read);
  if (filter === "stock") filtered = filtered.filter(isStockType);

  $("totalNotifications").textContent = notifications.length.toLocaleString();
  $("unreadNotifications").textContent = notifications.filter(n => !n.read).length.toLocaleString();
  $("stockNotifications").textContent = notifications.filter(isStockType).length.toLocaleString();

    const list = $("notificationsList");
  const limit = 150;
  const msg = $("notificationMessage");
  if (msg && !String(msg.textContent || "").startsWith("Could not")) {
    msg.textContent = filtered.length > limit ? `Showing ${limit} of ${filtered.length} notifications.` : "";
  }
  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state">No notifications found.</div>`;
    return;
  }

  list.innerHTML = filtered.slice(0, limit).map(n => {
    const unreadClass = n.read ? "" : " notification-unread";
    const typeClass = n.type === "out_of_stock" ? " notification-danger" : (n.type === "low_stock" ? " notification-warning" : "");
    const title = esc(n.productName || labelForType(n.type));
    const message = esc(n.message || "Notification");
    const meta = `${labelForType(n.type)} • ${formatTime(n.createdAt)}`;
    const action = n.read
      ? `<span class="notification-read-label">Read</span>`
      : `<button type="button" class="small-action" data-read-id="${esc(n.id)}">Mark as read</button>`;
    return `
      <article class="notification-item${unreadClass}${typeClass}">
        <div class="notification-body">
          <div class="notification-top">
            <strong>${title}</strong>
            <span class="notification-type">${esc(labelForType(n.type))}</span>
          </div>
          <p>${message}</p>
          <small>${esc(meta)}</small>
        </div>
        <div class="notification-action">${action}</div>
      </article>
    `;
  }).join("");
}

async function markRead(id) {
  try {
    await updateDoc(doc(db, "notifications", id), { read: true });
  } catch (error) {
    console.error("Mark read error:", error);
    $("notificationMessage").textContent = "Could not update notification: " + error.message;
  }
}

async function markAllRead() {
  const unread = notifications.filter(n => !n.read).slice(0, 400);
  if (!unread.length) return;
  const btn = $("markAllReadBtn");
  btn.disabled = true;
  btn.textContent = "Updating...";
  try {
    for (let i = 0; i < unread.length; i += 450) {
      const batch = writeBatch(db);
      unread.slice(i, i + 450).forEach(n => batch.update(doc(db, "notifications", n.id), { read: true }));
      await batch.commit();
    }
  } catch (error) {
    console.error("Mark all read error:", error);
    $("notificationMessage").textContent = "Could not mark all as read: " + error.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "Mark all as read";
  }
}

async function start() {
  const admin = await requireAdmin();
  if (!admin) return;
  $("adminName").textContent = admin.name || "Administrator";

  $("notificationFilter").addEventListener("change", render);
  $("markAllReadBtn").addEventListener("click", markAllRead);
  $("logoutBtn").addEventListener("click", logoutAdmin);
  $("menuToggle").addEventListener("click", () => $("sidebar").classList.toggle("sidebar-open"));
  $("notificationsList").addEventListener("click", e => {
    const btn = e.target.closest("[data-read-id]");
    if (btn) markRead(btn.dataset.readId);
  });

  onSnapshot(collection(db, "notifications"), snapshot => {
    notifications = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(n => n.businessId === BUSINESS_ID);
    notifications.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    render();
    $("notificationMessage").textContent = "";
  }, error => {
    console.error("Notifications load error:", error);
    $("notificationMessage").textContent = "Could not load notifications: " + error.message;
    $("notificationsList").innerHTML = `<div class="empty-state">Could not load notifications.</div>`;
  });
}

start();
