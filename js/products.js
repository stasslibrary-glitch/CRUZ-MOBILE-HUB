
import { db } from "./firebase.js";
import { requireAdmin, logoutAdmin } from "./auth.js";

import {
  collection,
  doc,
  onSnapshot,
  writeBatch,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const BUSINESS_ID = "cruz-mobile-hub";
const $ = id => document.getElementById(id);

let products = [];
let pricingMap = new Map();
let productsReady = false;
let pricingReady = false;

const escapeHTML = value =>
  String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);

function money(value, currency = "UGX") {
  if (value === undefined || value === null || value === "") return "—";

  return `${currency} ${Number(value).toLocaleString("en-UG", {
    maximumFractionDigits: 2
  })}`;
}

function showMessage(text, success = false) {
  const message = $("productMessage");
  if (!message) return;

  message.textContent = text;
  message.style.color = success ? "#80d99b" : "#ed7777";
}

function renderProducts() {
  if (!productsReady || !pricingReady) return;

  const term = ($("productSearch")?.value || "").trim().toLowerCase();

  const combined = products.map(product => ({
    ...product,
    ...(pricingMap.get(product.id) || {})
  }));

  const filtered = combined.filter(product => {
    const searchable = [
      product.name,
      product.sku,
      product.category
    ].join(" ").toLowerCase();

    return searchable.includes(term);
  });

  const active = combined.filter(product => product.active === true);

  $("productCount").textContent = active.length.toLocaleString();

  $("unitCount").textContent = active.reduce(
    (total, product) => total + Number(product.stockQty || 0),
    0
  ).toLocaleString();

  $("lowCount").textContent = active.filter(product =>
    Number(product.stockQty || 0) <= Number(product.minimumStock || 0)
  ).length.toLocaleString();

  const table = $("productsTable");

  if (!filtered.length) {
    table.innerHTML = `
      <tr>
        <td colspan="9" class="table-empty">
          ${term ? "No matching products found." : "No products have been added yet."}
        </td>
      </tr>
    `;
    return;
  }

  table.innerHTML = filtered.map(product => {
    const low =
      Number(product.stockQty || 0) <=
      Number(product.minimumStock || 0);

    return `
      <tr>
        <td>
          <strong>${escapeHTML(product.name)}</strong>
          <small class="table-subtext">${escapeHTML(product.category)}</small>
        </td>
        <td>${escapeHTML(product.sku || "—")}</td>
        <td>${money(product.wholesaleCost, product.currency)}</td>
        <td>${money(product.standardPrice, product.currency)}</td>
        <td>${money(product.minimumPrice, product.currency)}</td>
        <td>
          <span class="${low ? "stock-warning" : "stock-good"}">
            ${Number(product.stockQty || 0)}
          </span>
        </td>
        <td>${escapeHTML(product.currency || "UGX")}</td>
        <td>
          <span class="${product.active ? "status-active" : "status-inactive"}">
            ${product.active ? "Active" : "Inactive"}
          </span>
        </td>
        <td>
          <button
            class="small-action ${product.active ? "deactivate-btn" : "activate-btn"}"
            data-id="${escapeHTML(product.id)}"
            data-active="${product.active ? "false" : "true"}"
            type="button">
            ${product.active ? "Deactivate" : "Activate"}
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

async function changeProductStatus(productId, active) {
  const confirmed = confirm(
    active
      ? "Reactivate this product?"
      : "Deactivate this product? Its sales history will be preserved."
  );

  if (!confirmed) return;

  try {
    await updateDoc(doc(db, "products", productId), {
      active,
      updatedAt: serverTimestamp()
    });

    showMessage(
      active ? "Product reactivated successfully." : "Product deactivated successfully.",
      true
    );
  } catch (error) {
    console.error("Product status error:", error);
    showMessage("Could not update product: " + error.message);
  }
}

async function saveProduct(event) {
  event.preventDefault();

  const name = $("productName").value.trim();
  const sku = $("productSku").value.trim();
  const category = $("productCategory").value.trim();
  const currency = $("productCurrency").value;

  const wholesaleCost = Number($("wholesaleCost").value);
  const standardPrice = Number($("standardPrice").value);
  const minimumPrice = Number($("minimumPrice").value);
  const stockQty = Number($("stockQty").value);
  const minimumStock = Number($("minimumStock").value);

  if (!name || !category) {
    showMessage("Enter the product name and category.");
    return;
  }

  if (
    !["UGX", "USD"].includes(currency) ||
    !Number.isFinite(wholesaleCost) ||
    !Number.isFinite(standardPrice) ||
    !Number.isFinite(minimumPrice) ||
    !Number.isInteger(stockQty) ||
    !Number.isInteger(minimumStock) ||
    wholesaleCost < 0 ||
    standardPrice <= 0 ||
    minimumPrice < 0 ||
    minimumPrice > standardPrice ||
    stockQty < 0 ||
    minimumStock < 0
  ) {
    showMessage(
      "Please check the prices and quantities. The minimum selling price cannot exceed the standard price."
    );
    return;
  }

  const button = $("saveProductBtn");
  button.disabled = true;
  button.textContent = "Saving product...";

  try {
    const productRef = doc(collection(db, "products"));
    const pricingRef = doc(db, "productPricing", productRef.id);
    const batch = writeBatch(db);

    batch.set(productRef, {
      businessId: BUSINESS_ID,
      name,
      sku,
      category,
      currency,
      standardPrice,
      stockQty,
      minimumStock,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    batch.set(pricingRef, {
      businessId: BUSINESS_ID,
      wholesaleCost,
      minimumPrice,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await batch.commit();

    $("productForm").reset();
    showMessage("Product successfully added to your inventory.", true);

  } catch (error) {
    console.error("Product save error:", error);
    showMessage("Could not save product: " + error.message);
  } finally {
    button.disabled = false;
    button.textContent = "+ Save product";
  }
}

async function start() {
  try {
    const admin = await requireAdmin();
    if (!admin) return;

    $("adminName").textContent = admin.name || "Administrator";

    $("productForm").addEventListener("submit", saveProduct);
    $("productSearch").addEventListener("input", renderProducts);

    $("productsTable").addEventListener("click", event => {
      const button = event.target.closest("button[data-id]");
      if (!button) return;

      changeProductStatus(
        button.dataset.id,
        button.dataset.active === "true"
      );
    });

    $("logoutBtn").addEventListener("click", logoutAdmin);

    $("menuToggle").addEventListener("click", () => {
      $("sidebar").classList.toggle("sidebar-open");
    });

    onSnapshot(
      collection(db, "products"),
      snapshot => {
        products = snapshot.docs
          .map(item => ({ id: item.id, ...item.data() }))
          .filter(product => product.businessId === BUSINESS_ID);

        productsReady = true;
        renderProducts();
      },
      error => {
        console.error("Products loading error:", error);
        $("productsTable").innerHTML = `
          <tr><td colspan="9" class="table-empty">
            Could not load products: ${escapeHTML(error.message)}
          </td></tr>
        `;
        showMessage("Products loading failed: " + error.message);
      }
    );

    onSnapshot(
      collection(db, "productPricing"),
      snapshot => {
        pricingMap = new Map(
          snapshot.docs
            .map(item => [item.id, item.data()])
            .filter(([, data]) => data.businessId === BUSINESS_ID)
        );

        pricingReady = true;
        renderProducts();
      },
      error => {
        console.error("Pricing loading error:", error);
        pricingReady = true;
        showMessage("Could not load private product prices: " + error.message);
        renderProducts();
      }
    );

  } catch (error) {
    console.error("Products page startup error:", error);
    showMessage("Could not start products page: " + error.message);
  }
}

start();
