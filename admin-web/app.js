import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  updatePassword,
  verifyBeforeUpdateEmail,
  EmailAuthProvider,
  reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// Shared Firebase Project Config (same project & named database as Android app)
const firebaseConfig = {
  apiKey: "AIzaSyBjBNQw1PL3F5cYbOdxynsno-c51v9VBzo",
  authDomain: "gen-lang-client-0198222948.firebaseapp.com",
  projectId: "gen-lang-client-0198222948",
  storageBucket: "gen-lang-client-0198222948.firebasestorage.app",
  messagingSenderId: "315465823648",
  appId: "1:315465823648:android:a4200227b53652160920c5"
};

const FIRESTORE_DATABASE_ID = "ai-studio-android-fa2ba1de-6827-4cf8-960d-7210a1e03a27";
const BOOTSTRAPPED_ADMIN_EMAIL = "akrmshaker8@gmail.com";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, FIRESTORE_DATABASE_ID);

// DOM Elements
const authScreen = document.getElementById("auth-screen");
const dashboardScreen = document.getElementById("dashboard-screen");
const authError = document.getElementById("auth-error");
const adminEmailBadge = document.getElementById("admin-email-badge");
const liveToast = document.getElementById("live-toast");

let unsubOrders = null;
let unsubProducts = null;
let unsubOffers = null;
let unsubSettings = null;
let unsubAdmins = null;

let currentOrders = [];
let currentOrderFilter = "all";
let currentWallets = [];
let knownOrderIds = new Set();
let isInitialOrdersLoad = true;
let soundEnabled = false;

// --- Utility Helpers ---
function showToast(message) {
  liveToast.textContent = message;
  liveToast.classList.remove("hidden");
  setTimeout(() => liveToast.classList.add("hidden"), 4000);
}

function playNotificationBeep() {
  if (!soundEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch (_) {}
}

function formatNumber(n) {
  return Number(n || 0).toLocaleString("en-US");
}

function cleanPhoneForWhatsApp(phone) {
  return String(phone || "").replace(/[^0-9]/g, "");
}

function compressImageToDataUrl(file, maxDimension = 420) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > height && width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function createEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined && text !== null) el.textContent = text;
  return el;
}

// --- Auth & Admin Gate ---
async function verifyAdminAccess(user) {
  if (!user) return false;
  if (user.emailVerified && user.email === BOOTSTRAPPED_ADMIN_EMAIL) {
    return true;
  }
  try {
    const adminDoc = await getDoc(doc(db, "admins", user.uid));
    return adminDoc.exists();
  } catch (err) {
    console.error("Admin check failed:", err);
    return false;
  }
}

document.getElementById("email-login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  authError.classList.add("hidden");
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    authError.textContent = "تعذر تسجيل الدخول: " + (err.message || "تحقق من البريد وكلمة المرور");
    authError.classList.remove("hidden");
  }
});

document.getElementById("google-login-btn").addEventListener("click", async () => {
  authError.classList.add("hidden");
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (err) {
    authError.textContent = "فشل الدخول عبر جوجل: " + (err.message || "");
    authError.classList.remove("hidden");
  }
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  await signOut(auth);
});

document.getElementById("enable-sound-btn").addEventListener("click", async () => {
  soundEnabled = true;
  if ("Notification" in window && Notification.permission === "default") {
    await Notification.requestPermission();
  }
  playNotificationBeep();
  showToast("تم تفعيل التنبيهات الصوتية وإشعارات الطلبات الجديدة");
});

onAuthStateChanged(auth, async (user) => {
  stopListeners();
  if (!user) {
    authScreen.classList.remove("hidden");
    dashboardScreen.classList.add("hidden");
    return;
  }

  const isAdmin = await verifyAdminAccess(user);
  if (!isAdmin) {
    await signOut(auth);
    authError.textContent = "عذراً، هذا الحساب غير مصرح له بالدخول إلى لوحة تحكم المدير.";
    authError.classList.remove("hidden");
    authScreen.classList.remove("hidden");
    dashboardScreen.classList.add("hidden");
    return;
  }

  authScreen.classList.add("hidden");
  dashboardScreen.classList.remove("hidden");
  adminEmailBadge.textContent = user.email || user.uid;
  startListeners();
});

function stopListeners() {
  if (unsubOrders) { unsubOrders(); unsubOrders = null; }
  if (unsubProducts) { unsubProducts(); unsubProducts = null; }
  if (unsubOffers) { unsubOffers(); unsubOffers = null; }
  if (unsubSettings) { unsubSettings(); unsubSettings = null; }
  if (unsubAdmins) { unsubAdmins(); unsubAdmins = null; }
}

function startListeners() {
  isInitialOrdersLoad = true;
  knownOrderIds.clear();

  // 1. Orders Realtime Listener
  const ordersQuery = query(collection(db, "orders"), orderBy("createdAt", "desc"));
  unsubOrders = onSnapshot(ordersQuery, (snapshot) => {
    const orders = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (!isInitialOrdersLoad) {
      orders.forEach((order) => {
        if (!knownOrderIds.has(order.id) && order.status === "pending") {
          playNotificationBeep();
          showToast(`طلب جديد من ${order.customerName} بقيمة ${formatNumber(order.totalAmountYemeniRiyal)} ريال يمني`);
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("طلب جديد - تسوق ليمونة", {
              body: `${order.customerName} • ${formatNumber(order.totalAmountYemeniRiyal)} ريال يمني`
            });
          }
        }
      });
    }
    isInitialOrdersLoad = false;
    knownOrderIds = new Set(orders.map((o) => o.id));
    currentOrders = orders;
    renderOrders();
  }, (err) => console.error("Orders listener error:", err));

  // 2. Products Realtime Listener
  unsubProducts = onSnapshot(collection(db, "products"), (snapshot) => {
    const products = snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    renderProducts(products);
  }, (err) => console.error("Products listener error:", err));

  // 3. Offers Realtime Listener
  unsubOffers = onSnapshot(collection(db, "offers"), (snapshot) => {
    const offers = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderOffers(offers);
  }, (err) => console.error("Offers listener error:", err));

  // 4. Store Settings Realtime Listener
  unsubSettings = onSnapshot(doc(db, "store_settings", "main"), (snapshot) => {
    if (snapshot.exists()) {
      const s = snapshot.data();
      document.getElementById("setting-store-name").value = s.storeName || "منتجات ليمونة";
      document.getElementById("setting-company-name").value = s.companyName || "شركة فاست اند وايت لصناعة المنظفات";
      document.getElementById("setting-whatsapp").value = s.whatsappNumber || "";
      document.getElementById("setting-phone").value = s.phoneNumber || "";
      document.getElementById("setting-lemona-logo-url").value = s.lemonaLogoUrl || "";
      document.getElementById("setting-company-logo-url").value = s.companyLogoUrl || "";
      currentWallets = Array.isArray(s.wallets) ? s.wallets : [];
    } else {
      currentWallets = [
        { walletName: "جيب", accountNumber: "770000111", accountHolder: "شركة فاست اند وايت" },
        { walletName: "جوالي", accountNumber: "770000222", accountHolder: "شركة فاست اند وايت" },
        { walletName: "الكريمي", accountNumber: "300400500", accountHolder: "شركة فاست اند وايت" }
      ];
    }
    renderWallets();
  }, (err) => console.error("Settings listener error:", err));

  // 5. Admins List Listener
  unsubAdmins = onSnapshot(collection(db, "admins"), (snapshot) => {
    const admins = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderAdmins(admins);
  }, (err) => console.error("Admins listener error:", err));
}

// --- Navigation Tabs ---
document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`section-${btn.dataset.section}`).classList.add("active");
  });
});

document.querySelectorAll("[data-order-filter]").forEach((pill) => {
  pill.addEventListener("click", () => {
    document.querySelectorAll("[data-order-filter]").forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
    currentOrderFilter = pill.dataset.orderFilter;
    renderOrders();
  });
});

// --- Render Orders ---
function renderOrders() {
  const pendingCount = currentOrders.filter((o) => o.status === "pending").length;
  document.getElementById("pending-orders-badge").textContent = pendingCount;

  const list = document.getElementById("orders-list");
  list.replaceChildren();

  const filtered = currentOrderFilter === "all"
    ? currentOrders
    : currentOrders.filter((o) => o.status === currentOrderFilter);

  if (filtered.length === 0) {
    list.appendChild(createEl("div", "card muted", "لا توجد طلبات في هذا القسم حالياً."));
    return;
  }

  filtered.forEach((order) => {
    const card = createEl("div", "card");

    const topRow = createEl("div", "section-header");
    topRow.style.marginBottom = "8px";
    const title = createEl("strong", "", `طلب #${order.id.slice(0, 8).toUpperCase()}`);
    const statusBadge = createEl(
      "span",
      `order-status status-${order.status || "pending"}`,
      order.status === "delivered" ? "تم التوصيل" : order.status === "cancelled" ? "ملغي" : "طلب جديد / قيد الانتظار"
    );
    topRow.append(title, statusBadge);
    card.appendChild(topRow);

    card.appendChild(createEl("div", "", `الزبون: ${order.customerName} (${order.customerPhone})`));
    card.appendChild(createEl("div", "", `المستلم: ${order.recipientName} (${order.recipientPhone})`));

    if (order.manualAddress) {
      card.appendChild(createEl("div", "muted small", `العنوان اليدوي: ${order.manualAddress}`));
    }
    if (order.locationLink && /^https:\/\//i.test(order.locationLink)) {
      const locLink = createEl("a", "btn btn-outline btn-sm", "فتح موقع المستلم في خرائط جوجل");
      locLink.href = order.locationLink;
      locLink.target = "_blank";
      locLink.rel = "noopener noreferrer";
      locLink.style.marginTop = "6px";
      card.appendChild(locLink);
    }

    const payText = order.paymentMethod === "wallet"
      ? `تحويل محفظة (${order.walletName || "-"}) • مرجع: ${order.transferReference || "-"}`
      : "الدفع كاش عند الاستلام";
    card.appendChild(createEl("div", "small", `الدفع: ${payText}`));

    const itemsBox = createEl("div", "order-items-box");
    (order.items || []).forEach((it) => {
      itemsBox.appendChild(
        createEl("div", "", `• ${it.name} × ${it.quantity} = ${formatNumber(it.lineTotal)} ريال يمني`)
      );
    });
    card.appendChild(itemsBox);

    card.appendChild(
      createEl("div", "price-yellow", `الإجمالي: ${formatNumber(order.totalAmountYemeniRiyal)} ريال يمني`)
    );

    const actions = createEl("div", "card-actions");

    const waBtn = createEl("a", "btn btn-yellow btn-sm", "تواصل عبر واتساب");
    const targetPhone = cleanPhoneForWhatsApp(order.customerPhone || order.recipientPhone);
    const waPhone = targetPhone.startsWith("967") ? targetPhone : `967${targetPhone}`;
    const waText = encodeURIComponent(
      `مرحباً ${order.customerName}، بخصوص طلبك من منتجات ليمونة رقم #${order.id.slice(0, 8).toUpperCase()} بقيمة ${formatNumber(order.totalAmountYemeniRiyal)} ريال يمني.`
    );
    waBtn.href = `https://wa.me/${waPhone}?text=${waText}`;
    waBtn.target = "_blank";
    waBtn.rel = "noopener noreferrer";
    actions.appendChild(waBtn);

    if (order.status !== "delivered") {
      const deliverBtn = createEl("button", "btn btn-green btn-sm", "تأشير تم التوصيل");
      deliverBtn.addEventListener("click", async () => {
        await updateDoc(doc(db, "orders", order.id), {
          status: "delivered",
          updatedAt: serverTimestamp()
        });
        showToast("تم تحديث حالة الطلب إلى تم التوصيل");
      });
      actions.appendChild(deliverBtn);
    }

    const delBtn = createEl("button", "btn btn-danger btn-sm", "حذف");
    delBtn.addEventListener("click", async () => {
      if (confirm("هل تريد حذف هذا الطلب نهائياً؟")) {
        await deleteDoc(doc(db, "orders", order.id));
      }
    });
    actions.appendChild(delBtn);

    card.appendChild(actions);
    list.appendChild(card);
  });
}

// --- Products CRUD ---
const productImgFile = document.getElementById("product-image-file");
const productImgUrl = document.getElementById("product-image-url");
const productImgPreview = document.getElementById("product-image-preview");

productImgFile.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const dataUrl = await compressImageToDataUrl(file);
  productImgUrl.value = dataUrl;
  productImgPreview.src = dataUrl;
  productImgPreview.classList.remove("hidden");
});

document.getElementById("clear-product-img").addEventListener("click", () => {
  productImgFile.value = "";
  productImgUrl.value = "";
  productImgPreview.classList.add("hidden");
});

document.getElementById("cancel-product-edit").addEventListener("click", resetProductForm);

function resetProductForm() {
  document.getElementById("product-form").reset();
  document.getElementById("product-id").value = "";
  document.getElementById("product-form-title").textContent = "إضافة منتج جديد";
  document.getElementById("cancel-product-edit").classList.add("hidden");
  productImgUrl.value = "";
  productImgPreview.classList.add("hidden");
}

document.getElementById("product-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("product-id").value;
  const payload = {
    name: document.getElementById("product-name").value.trim(),
    category: document.getElementById("product-category").value.trim(),
    priceYemeniRiyal: Number(document.getElementById("product-price").value),
    sortOrder: Number(document.getElementById("product-sort").value || 1),
    description: document.getElementById("product-desc").value.trim(),
    available: document.getElementById("product-available").checked,
    updatedAt: serverTimestamp()
  };
  const img = productImgUrl.value.trim();
  if (img) payload.imageUrl = img;

  if (id) {
    await updateDoc(doc(db, "products", id), payload);
    showToast("تم تحديث المنتج بنجاح");
  } else {
    payload.createdAt = serverTimestamp();
    await addDoc(collection(db, "products"), payload);
    showToast("تمت إضافة المنتج الجديد بنجاح");
  }
  resetProductForm();
});

function renderProducts(products) {
  const list = document.getElementById("products-list");
  list.replaceChildren();
  if (products.length === 0) {
    list.appendChild(createEl("div", "card muted", "لا توجد منتجات مضافة بعد. اضغط على (تهيئة البيانات الافتراضية) أو أضف منتجاً جديداً."));
    return;
  }

  products.forEach((p) => {
    const card = createEl("div", "card");
    const row = createEl("div", "product-card-row");
    const img = document.createElement("img");
    img.className = "product-thumb";
    img.src = p.imageUrl || "./assets/logo_lemona.png";
    img.alt = p.name;

    const info = createEl("div", "");
    info.style.flex = "1";
    info.appendChild(createEl("strong", "", p.name));
    info.appendChild(createEl("div", "muted small", `${p.category} • ${p.available ? "متاح" : "مخفي"}`));
    info.appendChild(createEl("div", "muted small", p.description || ""));
    info.appendChild(createEl("div", "price-yellow", `${formatNumber(p.priceYemeniRiyal)} ريال يمني`));

    row.append(img, info);
    card.appendChild(row);

    const actions = createEl("div", "card-actions");
    const editBtn = createEl("button", "btn btn-yellow btn-sm", "تعديل");
    editBtn.addEventListener("click", () => {
      document.getElementById("product-id").value = p.id;
      document.getElementById("product-name").value = p.name;
      document.getElementById("product-category").value = p.category;
      document.getElementById("product-price").value = p.priceYemeniRiyal;
      document.getElementById("product-sort").value = p.sortOrder || 1;
      document.getElementById("product-desc").value = p.description || "";
      document.getElementById("product-available").checked = p.available !== false;
      productImgUrl.value = p.imageUrl || "";
      if (p.imageUrl) {
        productImgPreview.src = p.imageUrl;
        productImgPreview.classList.remove("hidden");
      } else {
        productImgPreview.classList.add("hidden");
      }
      document.getElementById("product-form-title").textContent = `تعديل: ${p.name}`;
      document.getElementById("cancel-product-edit").classList.remove("hidden");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    const delBtn = createEl("button", "btn btn-danger btn-sm", "حذف");
    delBtn.addEventListener("click", async () => {
      if (confirm(`هل تريد حذف المنتج "${p.name}"؟`)) {
        await deleteDoc(doc(db, "products", p.id));
        showToast("تم حذف المنتج");
      }
    });

    actions.append(editBtn, delBtn);
    card.appendChild(actions);
    list.appendChild(card);
  });
}

// --- Offers CRUD ---
const offerImgFile = document.getElementById("offer-image-file");
const offerImgUrl = document.getElementById("offer-image-url");
const offerImgPreview = document.getElementById("offer-image-preview");

offerImgFile.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const dataUrl = await compressImageToDataUrl(file);
  offerImgUrl.value = dataUrl;
  offerImgPreview.src = dataUrl;
  offerImgPreview.classList.remove("hidden");
});

document.getElementById("clear-offer-img").addEventListener("click", () => {
  offerImgFile.value = "";
  offerImgUrl.value = "";
  offerImgPreview.classList.add("hidden");
});

document.getElementById("cancel-offer-edit").addEventListener("click", resetOfferForm);

function resetOfferForm() {
  document.getElementById("offer-form").reset();
  document.getElementById("offer-id").value = "";
  document.getElementById("offer-form-title").textContent = "إضافة عرض خاص جديد";
  document.getElementById("cancel-offer-edit").classList.add("hidden");
  offerImgUrl.value = "";
  offerImgPreview.classList.add("hidden");
}

document.getElementById("offer-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("offer-id").value;
  const payload = {
    title: document.getElementById("offer-title").value.trim(),
    description: document.getElementById("offer-desc").value.trim(),
    priceYemeniRiyal: Number(document.getElementById("offer-price").value),
    active: document.getElementById("offer-active").checked,
    updatedAt: serverTimestamp()
  };
  const orig = Number(document.getElementById("offer-original-price").value);
  if (orig > 0) payload.originalPriceYemeniRiyal = orig;
  const badge = document.getElementById("offer-badge").value.trim();
  if (badge) payload.badgeText = badge;
  const img = offerImgUrl.value.trim();
  if (img) payload.imageUrl = img;

  if (id) {
    await updateDoc(doc(db, "offers", id), payload);
    showToast("تم تحديث العرض بنجاح");
  } else {
    payload.createdAt = serverTimestamp();
    await addDoc(collection(db, "offers"), payload);
    showToast("تمت إضافة العرض الخاص بنجاح");
  }
  resetOfferForm();
});

function renderOffers(offers) {
  const list = document.getElementById("offers-list");
  list.replaceChildren();
  if (offers.length === 0) {
    list.appendChild(createEl("div", "card muted", "لا توجد عروض مضافة حالياً."));
    return;
  }

  offers.forEach((o) => {
    const card = createEl("div", "card");
    const row = createEl("div", "product-card-row");
    const img = document.createElement("img");
    img.className = "product-thumb";
    img.src = o.imageUrl || "./assets/logo_lemona.png";
    img.alt = o.title;

    const info = createEl("div", "");
    info.style.flex = "1";
    info.appendChild(createEl("strong", "", o.title));
    if (o.badgeText) info.appendChild(createEl("div", "small", `الشارة: ${o.badgeText}`));
    info.appendChild(createEl("div", "muted small", o.description || ""));
    info.appendChild(createEl("div", "price-yellow", `${formatNumber(o.priceYemeniRiyal)} ريال يمني`));

    row.append(img, info);
    card.appendChild(row);

    const actions = createEl("div", "card-actions");
    const editBtn = createEl("button", "btn btn-yellow btn-sm", "تعديل");
    editBtn.addEventListener("click", () => {
      document.getElementById("offer-id").value = o.id;
      document.getElementById("offer-title").value = o.title;
      document.getElementById("offer-badge").value = o.badgeText || "";
      document.getElementById("offer-price").value = o.priceYemeniRiyal;
      document.getElementById("offer-original-price").value = o.originalPriceYemeniRiyal || "";
      document.getElementById("offer-desc").value = o.description || "";
      document.getElementById("offer-active").checked = o.active !== false;
      offerImgUrl.value = o.imageUrl || "";
      if (o.imageUrl) {
        offerImgPreview.src = o.imageUrl;
        offerImgPreview.classList.remove("hidden");
      } else {
        offerImgPreview.classList.add("hidden");
      }
      document.getElementById("offer-form-title").textContent = `تعديل العرض: ${o.title}`;
      document.getElementById("cancel-offer-edit").classList.remove("hidden");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    const delBtn = createEl("button", "btn btn-danger btn-sm", "حذف");
    delBtn.addEventListener("click", async () => {
      if (confirm(`هل تريد حذف العرض "${o.title}"؟`)) {
        await deleteDoc(doc(db, "offers", o.id));
        showToast("تم حذف العرض");
      }
    });

    actions.append(editBtn, delBtn);
    card.appendChild(actions);
    list.appendChild(card);
  });
}

// --- Store Settings, Logos & Wallets ---
function renderWallets() {
  const container = document.getElementById("wallets-container");
  container.replaceChildren();
  currentWallets.forEach((w, idx) => {
    const row = createEl("div", "wallet-row");
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = "اسم المحفظة (جيب، جوالي...)";
    nameInput.value = w.walletName || "";
    nameInput.addEventListener("input", (e) => { currentWallets[idx].walletName = e.target.value; });

    const numInput = document.createElement("input");
    numInput.type = "text";
    numInput.placeholder = "رقم الحساب";
    numInput.value = w.accountNumber || "";
    numInput.addEventListener("input", (e) => { currentWallets[idx].accountNumber = e.target.value; });

    const holderInput = document.createElement("input");
    holderInput.type = "text";
    holderInput.placeholder = "اسم صاحب الحساب";
    holderInput.value = w.accountHolder || "";
    holderInput.addEventListener("input", (e) => { currentWallets[idx].accountHolder = e.target.value; });

    const removeBtn = createEl("button", "btn btn-danger btn-sm", "حذف");
    removeBtn.type = "button";
    removeBtn.addEventListener("click", () => {
      currentWallets.splice(idx, 1);
      renderWallets();
    });

    row.append(nameInput, numInput, holderInput, removeBtn);
    container.appendChild(row);
  });
}

document.getElementById("add-wallet-btn").addEventListener("click", () => {
  currentWallets.push({ walletName: "", accountNumber: "", accountHolder: "" });
  renderWallets();
});

document.getElementById("setting-lemona-logo-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (file) {
    document.getElementById("setting-lemona-logo-url").value = await compressImageToDataUrl(file, 320);
  }
});

document.getElementById("setting-company-logo-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (file) {
    document.getElementById("setting-company-logo-url").value = await compressImageToDataUrl(file, 320);
  }
});

document.getElementById("reset-lemona-logo").addEventListener("click", () => {
  document.getElementById("setting-lemona-logo-url").value = "";
  document.getElementById("setting-lemona-logo-file").value = "";
  showToast("سيتم استعادة شعار ليمونة الافتراضي عند الحفظ");
});

document.getElementById("reset-company-logo").addEventListener("click", () => {
  document.getElementById("setting-company-logo-url").value = "";
  document.getElementById("setting-company-logo-file").value = "";
  showToast("سيتم استعادة شعار فاست أند وايت الافتراضي عند الحفظ");
});

document.getElementById("settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    storeName: document.getElementById("setting-store-name").value.trim(),
    companyName: document.getElementById("setting-company-name").value.trim(),
    whatsappNumber: document.getElementById("setting-whatsapp").value.trim(),
    phoneNumber: document.getElementById("setting-phone").value.trim(),
    wallets: currentWallets.filter((w) => w.walletName.trim() && w.accountNumber.trim()),
    updatedAt: serverTimestamp()
  };
  const lLogo = document.getElementById("setting-lemona-logo-url").value.trim();
  const cLogo = document.getElementById("setting-company-logo-url").value.trim();
  if (lLogo) payload.lemonaLogoUrl = lLogo;
  if (cLogo) payload.companyLogoUrl = cLogo;

  await setDoc(doc(db, "store_settings", "main"), payload);
  showToast("تم حفظ إعدادات التواصل والمحافظ والشعارات بنجاح");
});

// --- Admin Account Settings ---
document.getElementById("account-update-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msgEl = document.getElementById("account-msg");
  msgEl.className = "alert hidden";
  const user = auth.currentUser;
  if (!user) return;

  const currentPassword = document.getElementById("current-password").value;
  const newEmail = document.getElementById("new-admin-email").value.trim();
  const newPassword = document.getElementById("new-admin-password").value;

  try {
    if (currentPassword && user.email) {
      const cred = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, cred);
    }
    if (newEmail) {
      await verifyBeforeUpdateEmail(user, newEmail);
    }
    if (newPassword) {
      await updatePassword(user, newPassword);
    }
    msgEl.textContent = "تم تحديث بيانات حساب المدير بنجاح (تحقق من بريدك الجديد لتأكيده إذا تم تغييره).";
    msgEl.className = "alert alert-success";
    document.getElementById("account-update-form").reset();
  } catch (err) {
    msgEl.textContent = "تعذر التحديث: " + (err.message || "يرجى إعادة تسجيل الدخول أو التأكد من كلمة المرور الحالية");
    msgEl.className = "alert alert-error";
  }
});

document.getElementById("add-admin-uid-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const uid = document.getElementById("extra-admin-uid").value.trim();
  const email = document.getElementById("extra-admin-email").value.trim();
  const displayName = document.getElementById("extra-admin-name").value.trim() || "مدير المتجر";
  if (!uid || !email) return;

  await setDoc(doc(db, "admins", uid), {
    email,
    displayName,
    createdAt: serverTimestamp()
  });
  document.getElementById("add-admin-uid-form").reset();
  showToast("تمت إضافة المدير المصرح بنجاح");
});

function renderAdmins(admins) {
  const list = document.getElementById("admins-list");
  list.replaceChildren();
  const primary = createEl("div", "admin-chip");
  primary.appendChild(createEl("span", "", `${BOOTSTRAPPED_ADMIN_EMAIL} (مدير أساسي)`));
  list.appendChild(primary);

  admins.forEach((a) => {
    const chip = createEl("div", "admin-chip");
    chip.appendChild(createEl("span", "", `${a.email} (${a.id.slice(0, 8)}...)`));
    const delBtn = createEl("button", "btn btn-danger btn-sm", "إزالة");
    delBtn.addEventListener("click", async () => {
      await deleteDoc(doc(db, "admins", a.id));
    });
    chip.appendChild(delBtn);
    list.appendChild(chip);
  });
}

// --- Seed Default Lemona Data ---
document.getElementById("seed-data-btn").addEventListener("click", async () => {
  const starterProducts = [
    {
      id: "lemona_dish_1l",
      name: "ليمونة سائل غسيل الصحون",
      description: "عبوة 1 لتر - يزيل الدهون بقوة",
      category: "سائل صحون",
      priceYemeniRiyal: 1200,
      defaultIconKey: "dish_liquid",
      available: true,
      sortOrder: 1
    },
    {
      id: "lemona_disinfectant_500ml",
      name: "ليمونة معقم ومطهر",
      description: "عبوة 500 مل - معقم ومطهر للجروح والأرضيات",
      category: "معقمات ومطهرات",
      priceYemeniRiyal: 800,
      defaultIconKey: "disinfectant",
      available: true,
      sortOrder: 2
    },
    {
      id: "lemona_floor_cleaner_2l",
      name: "ليمونة منظف وملمع الأرضيات",
      description: "عبوة 2 لتر - رائحة الليمون المنعشة وثبات يدوم طويلاً",
      category: "منظفات أرضيات",
      priceYemeniRiyal: 1500,
      defaultIconKey: "floor_cleaner",
      available: true,
      sortOrder: 3
    },
    {
      id: "lemona_laundry_powder_3kg",
      name: "ليمونة مسحوق غسيل مركز",
      description: "كيس 3 كجم - نظافة فائقة وإزالة البقع الصعبة",
      category: "مساحيق غسيل",
      priceYemeniRiyal: 3200,
      defaultIconKey: "laundry_powder",
      available: true,
      sortOrder: 4
    }
  ];

  for (const p of starterProducts) {
    const { id, ...rest } = p;
    await setDoc(doc(db, "products", id), {
      ...rest,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
  }

  await setDoc(doc(db, "offers", "offer_family_pack"), {
    title: "عرض التوفير العائلي من ليمونة",
    description: "عبوة سائل صحون 1 لتر + معقم ومطهر 500 مل + منظف أرضيات 2 لتر",
    priceYemeniRiyal: 2900,
    originalPriceYemeniRiyal: 3500,
    badgeText: "وفر 600 ريال",
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });

  await setDoc(doc(db, "store_settings", "main"), {
    storeName: "منتجات ليمونة",
    companyName: "شركة فاست اند وايت لصناعة المنظفات",
    whatsappNumber: "967770000000",
    phoneNumber: "770000000",
    wallets: [
      { walletName: "جيب", accountNumber: "770000111", accountHolder: "شركة فاست اند وايت" },
      { walletName: "جوالي", accountNumber: "770000222", accountHolder: "شركة فاست اند وايت" },
      { walletName: "الكريمي", accountNumber: "300400500", accountHolder: "شركة فاست اند وايت" }
    ],
    updatedAt: serverTimestamp()
  }, { merge: true });

  showToast("تمت تهيئة المنتجات والعروض والإعدادات الافتراضية في السحابة");
});
