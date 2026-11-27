const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

admin.initializeApp();

const db = admin.firestore();
const STAFF_SESSION_SECRET = defineSecret("STAFF_SESSION_SECRET");

setGlobalOptions({
  region: "us-central1",
  maxInstances: 10
});

const BUSINESS_ID = "cruz-mobile-hub";
const SESSION_HOURS = 12;
const TIME_ZONE = "Africa/Kampala";

// --------------------------------------------------
// GENERAL HELPERS
// --------------------------------------------------

function fail(message, code = "invalid-argument") {
  throw new HttpsError(code, message);
}

function getDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const values = {};
  for (const part of parts) {
    values[part.type] = part.value;
  }

  return `${values.year}-${values.month}-${values.day}`;
}

function signToken(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");

  const signature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("base64url");

  return `${body}.${signature}`;
}

function verifyToken(token, secret) {
  if (typeof token !== "string" || token.length > 5000) {
    fail("Invalid staff session.", "unauthenticated");
  }

  const parts = token.split(".");

  if (parts.length !== 2) {
    fail("Invalid staff session.", "unauthenticated");
  }

  const [body, suppliedSignature] = parts;

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest();

  let actualSignature;

  try {
    actualSignature = Buffer.from(suppliedSignature, "base64url");
  } catch {
    fail("Invalid staff session.", "unauthenticated");
  }

  if (
    actualSignature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(actualSignature, expectedSignature)
  ) {
    fail("Invalid staff session.", "unauthenticated");
  }

  let payload;

  try {
    payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    );
  } catch {
    fail("Invalid staff session.", "unauthenticated");
  }

  if (
    payload.businessId !== BUSINESS_ID ||
    !payload.staffId ||
    !payload.exp ||
    payload.exp < Date.now()
  ) {
    fail("Your staff session has expired. Sign in again.", "unauthenticated");
  }

  return payload;
}

async function getStaffFromToken(token, secret) {
  const payload = verifyToken(token, secret);

  const staffRef = db.collection("staffAccounts").doc(payload.username);
  const staffSnap = await staffRef.get();

  if (!staffSnap.exists) {
    fail("This salesperson account no longer exists.", "unauthenticated");
  }

  const staff = staffSnap.data();

  if (
    staff.active !== true ||
    staff.staffId !== payload.staffId ||
    staff.businessId !== BUSINESS_ID
  ) {
    fail("This salesperson account is inactive.", "permission-denied");
  }

  return {
    ref: staffRef,
    staffId: staff.staffId,
    username: staff.username,
    name: staff.name
  };
}

async function requireAdmin(request) {
  if (!request.auth) {
    fail("Administrator login required.", "unauthenticated");
  }

  const userRef = db.collection("users").doc(request.auth.uid);
  const userSnap = await userRef.get();

  if (!userSnap.exists) {
    fail("Administrator profile not found.", "permission-denied");
  }

  const user = userSnap.data();

  if (
    user.role !== "admin" ||
    user.active !== true ||
    user.businessId !== BUSINESS_ID
  ) {
    fail("You do not have administrator access.", "permission-denied");
  }

  return user;
}

function validCurrency(currency) {
  return currency === "UGX" || currency === "USD";
}

function validNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// --------------------------------------------------
// SALESPERSON LOGIN
// --------------------------------------------------

exports.staffLogin = onCall(
  {
    secrets: [STAFF_SESSION_SECRET],
    enforceAppCheck: false
  },
  async request => {
    const username = String(request.data?.username || "")
      .trim()
      .toLowerCase();

    const pin = String(request.data?.pin || "").trim();

    if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
      fail("Enter a valid username.");
    }

    if (!/^\d{4,8}$/.test(pin)) {
      fail("Your PIN must contain 4 to 8 digits.");
    }

    const staffRef = db.collection("staffAccounts").doc(username);
    const staffSnap = await staffRef.get();

    // Use the same general response for missing/inactive accounts.
    if (!staffSnap.exists) {
      fail("Incorrect username or PIN.", "unauthenticated");
    }

    const staff = staffSnap.data();

    if (
      staff.active !== true ||
      staff.businessId !== BUSINESS_ID ||
      !staff.pinHash
    ) {
      fail("This account is not active.", "permission-denied");
    }

    const pinMatches = await bcrypt.compare(pin, staff.pinHash);

    if (!pinMatches) {
      fail("Incorrect username or PIN.", "unauthenticated");
    }

    const now = Date.now();

    const token = signToken(
      {
        staffId: staff.staffId,
        username,
        businessId: BUSINESS_ID,
        iat: now,
        exp: now + SESSION_HOURS * 60 * 60 * 1000
      },
      STAFF_SESSION_SECRET.value()
    );

    return {
      sessionToken: token,
      staff: {
        id: staff.staffId,
        username,
        name: staff.name
      }
    };
  }
);

// --------------------------------------------------
// VERIFY SALESPERSON SESSION
// --------------------------------------------------

exports.verifyStaffSession = onCall(
  {
    secrets: [STAFF_SESSION_SECRET],
    enforceAppCheck: false
  },
  async request => {
    const token = request.data?.sessionToken;

    const staff = await getStaffFromToken(
      token,
      STAFF_SESSION_SECRET.value()
    );

    return {
      valid: true,
      staff: {
        id: staff.staffId,
        username: staff.username,
        name: staff.name
      }
    };
  }
);

// --------------------------------------------------
// SALESPERSON DASHBOARD
// --------------------------------------------------


exports.getStaffDashboard = onCall(
  {
    secrets: [STAFF_SESSION_SECRET],
    enforceAppCheck: false
  },
  async request => {
    const staff = await getStaffFromToken(
      request.data?.sessionToken,
      STAFF_SESSION_SECRET.value()
    );

    const dateKey = getDateKey();

    const totalRef = db
      .collection("staffDailyTotals")
      .doc(`${staff.staffId}_${dateKey}`);

    const totalSnap = await totalRef.get();
    const totals = totalSnap.exists ? totalSnap.data() : {};

    const salesSnap = await db
      .collection("sales")
      .where("staffId", "==", staff.staffId)
      .where("dateKey", "==", dateKey)
      .get();

    const recentSales = salesSnap.docs
      .map(document => {
        const sale = document.data();

        return {
          id: document.id,
          receiptNumber: sale.receiptNumber || "",
          productName: sale.productName || "",
          quantity: sale.quantity || 0,
          sellingPrice: sale.sellingPrice || 0,
          total: sale.total || 0,
          currency: sale.currency || "UGX",
          paymentMethod: sale.paymentMethod || ""
        };
      })
      .sort((a, b) => {
        const saleA = salesSnap.docs.find(d => d.id === a.id)?.data();
        const saleB = salesSnap.docs.find(d => d.id === b.id)?.data();

        const timeA = saleA?.createdAt?.toMillis?.() || 0;
        const timeB = saleB?.createdAt?.toMillis?.() || 0;

        return timeB - timeA;
      })
      .slice(0, 20);

    return {
      staff: {
        id: staff.staffId,
        name: staff.name
      },
      dateKey,
      totals: {
        UGX: totals.UGX || 0,
        USD: totals.USD || 0,
        saleCount: totals.saleCount || 0
      },
      recentSales
    };
  }
);

// --------------------------------------------------
// RECORD A SALE
// --------------------------------------------------

exports.recordSale = onCall(
  {
    secrets: [STAFF_SESSION_SECRET],
    enforceAppCheck: false
  },
  async request => {
    const staff = await getStaffFromToken(
      request.data?.sessionToken,
      STAFF_SESSION_SECRET.value()
    );

    const productId = String(request.data?.productId || "").trim();
    const quantity = Number(request.data?.quantity);
    const sellingPrice = Number(request.data?.sellingPrice);
    const currency = String(request.data?.currency || "").toUpperCase();
    const paymentMethod = String(
      request.data?.paymentMethod || "cash"
    ).toLowerCase();

    if (!productId || productId.length > 150) {
      fail("Select a valid product.");
    }

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) {
      fail("Enter a valid quantity.");
    }

    if (!validNumber(sellingPrice) || sellingPrice <= 0) {
      fail("Enter a valid selling price.");
    }

    if (!validCurrency(currency)) {
      fail("Currency must be UGX or USD.");
    }

    const allowedPayments = ["cash", "mobile_money", "bank"];

    if (!allowedPayments.includes(paymentMethod)) {
      fail("Select a valid payment method.");
    }

    const productRef = db.collection("products").doc(productId);
    const pricingRef = db.collection("productPricing").doc(productId);

    const saleRef = db.collection("sales").doc();
    const now = admin.firestore.Timestamp.now();
    const dateKey = getDateKey(now.toDate());

    const totalRef = db
      .collection("staffDailyTotals")
      .doc(`${staff.staffId}_${dateKey}`);

    let receiptNumber = "";

    await db.runTransaction(async transaction => {
      const productSnap = await transaction.get(productRef);
      const pricingSnap = await transaction.get(pricingRef);

      if (!productSnap.exists || !pricingSnap.exists) {
        fail("Product information is incomplete.", "not-found");
      }

      const product = productSnap.data();
      const pricing = pricingSnap.data();

      if (
        product.active !== true ||
        product.businessId !== BUSINESS_ID
      ) {
        fail("This product is unavailable.", "failed-precondition");
      }

      if (product.currency !== currency) {
        fail("The selected currency does not match this product.");
      }

      if (product.stockQty < quantity) {
        fail(`Only ${product.stockQty} units are available.`);
      }

      const minimumPrice = Number(pricing.minimumPrice);
      const wholesaleCost = Number(pricing.wholesaleCost);

      if (
        !validNumber(minimumPrice) ||
        !validNumber(wholesaleCost)
      ) {
        fail("Product pricing has not been configured.");
      }

      if (sellingPrice < minimumPrice) {
        fail(
          `You cannot sell below the minimum price of ${minimumPrice.toLocaleString()} ${currency}.`,
          "failed-precondition"
        );
      }

      const standardPrice = Number(product.standardPrice);

      if (sellingPrice > standardPrice * 100) {
        fail("The entered price is unusually high. Ask the administrator.");
      }

      const total = sellingPrice * quantity;
      const costTotal = wholesaleCost * quantity;
      const profit = total - costTotal;

      const newStock = product.stockQty - quantity;

      receiptNumber = `CMH-${dateKey.replaceAll("-", "")}-${saleRef.id
        .slice(0, 6)
        .toUpperCase()}`;

      transaction.update(productRef, {
        stockQty: newStock,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      transaction.set(saleRef, {
        businessId: BUSINESS_ID,
        receiptNumber,
        staffId: staff.staffId,
        staffName: staff.name,
        productId,
        productName: product.name,
        quantity,
        sellingPrice,
        total,
        currency,
        paymentMethod,
        costPerUnit: wholesaleCost,
        costTotal,
        profit,
        dateKey,
        status: "completed",
        createdAt: now
      });

      transaction.set(
        totalRef,
        {
          businessId: BUSINESS_ID,
          staffId: staff.staffId,
          dateKey,
          [currency]: admin.firestore.FieldValue.increment(total),
          saleCount: admin.firestore.FieldValue.increment(1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      // Record a stock alert for the administrator when stock is low.
      const threshold = Number(product.minimumStock || 0);

      if (newStock <= threshold) {
        const alertRef = db.collection("notifications").doc();

        transaction.set(alertRef, {
          businessId: BUSINESS_ID,
          type: newStock === 0 ? "out_of_stock" : "low_stock",
          productId,
          productName: product.name,
          remainingStock: newStock,
          threshold,
          message: newStock === 0
            ? `${product.name} is out of stock.`
            : `${product.name} has reached its low-stock level.`,
          read: false,
          createdAt: now
        });
      }
    });

    return {
      success: true,
      receiptNumber,
      message: "Sale recorded successfully."
    };
  }
);

// --------------------------------------------------
// ADMIN: CREATE SALESPERSON ACCOUNT
// --------------------------------------------------

exports.createStaffAccount = onCall(
  async request => {
    await requireAdmin(request);

    const username = String(request.data?.username || "")
      .trim()
      .toLowerCase();

    const name = String(request.data?.name || "").trim();
    const pin = String(request.data?.pin || "").trim();

    if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
      fail("Username must be 3–40 characters using letters, numbers, dots, _ or -.");
    }

    if (!name || name.length > 80) {
      fail("Enter a valid salesperson name.");
    }

    if (!/^\d{4,8}$/.test(pin)) {
      fail("PIN must contain 4 to 8 digits.");
    }

    const staffRef = db.collection("staffAccounts").doc(username);
    const existing = await staffRef.get();

    if (existing.exists) {
      fail("That username already exists.", "already-exists");
    }

    const pinHash = await bcrypt.hash(pin, 12);
    const staffId = crypto.randomUUID();

    await staffRef.set({
      staffId,
      username,
      name,
      pinHash,
      active: true,
      businessId: BUSINESS_ID,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: request.auth.uid
    });

    return {
      success: true,
      staffId,
      username,
      name
    };
  }
);

// --------------------------------------------------
// SIMPLE SALES PAGE LOGIN - PASSWORD 4321
// --------------------------------------------------

exports.salesPageLogin = onCall(
  {
    secrets: [STAFF_SESSION_SECRET],
    enforceAppCheck: false
  },
  async request => {
    const pin = String(request.data?.pin || "").trim();

    if (pin !== "4321") {
      fail("Incorrect sales password.", "unauthenticated");
    }

    const username = "salesperson";
    const staffRef = db.collection("staffAccounts").doc(username);

    let staffSnap = await staffRef.get();

    if (!staffSnap.exists) {
      await staffRef.create({
        staffId: crypto.randomUUID(),
        username,
        name: "Salesperson",
        pinHash: await bcrypt.hash(pin, 12),
        active: true,
        businessId: BUSINESS_ID,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: "sales-page"
      });

      staffSnap = await staffRef.get();
    }

    const staff = staffSnap.data();

    if (
      staff.active !== true ||
      staff.businessId !== BUSINESS_ID
    ) {
      fail("The salesperson account is inactive.", "permission-denied");
    }

    const now = Date.now();

    const sessionToken = signToken(
      {
        staffId: staff.staffId,
        username,
        businessId: BUSINESS_ID,
        iat: now,
        exp: now + SESSION_HOURS * 60 * 60 * 1000
      },
      STAFF_SESSION_SECRET.value()
    );

    return {
      success: true,
      sessionToken,
      staff: {
        id: staff.staffId,
        username,
        name: staff.name
      }
    };
  }
);


// --------------------------------------------------
// LOAD PRODUCTS FOR SALES PAGE
// --------------------------------------------------

exports.getSalesProducts = onCall(
  {
    secrets: [STAFF_SESSION_SECRET],
    enforceAppCheck: false
  },
  async request => {
    await getStaffFromToken(
      request.data?.sessionToken,
      STAFF_SESSION_SECRET.value()
    );

    const snapshot = await db
      .collection("products")
      .where("businessId", "==", BUSINESS_ID)
      .get();

    const products = snapshot.docs
      .map(document => {
        const product = document.data();

        return {
          id: document.id,
          name: product.name || "Unnamed product",
          sku: product.sku || "",
          currency: product.currency || "UGX",
          standardPrice: Number(product.standardPrice || 0),
          stockQty: Number(product.stockQty || 0),
          active: product.active === true
        };
      })
      .filter(product => product.active && product.stockQty > 0);

    return { products };
  }
);
