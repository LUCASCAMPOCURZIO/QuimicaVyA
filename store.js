import {
  auth, db, APP_CONFIG,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile,
  collection, doc, addDoc, setDoc, getDoc, getDocs, query, orderBy, onSnapshot, serverTimestamp,
} from "./firebase-init.js";

// ---------- estado ----------
let products = [];
let cart = {}; // { productId: { producto, cantidad } }
let currentUser = null;
let currentCategory = "Todos";
let pendingCheckout = false; // si el usuario apretó "confirmar pedido" antes de estar logueado

// ---------- refs UI ----------
const brandName = document.getElementById("brandName");
const topbarActions = document.getElementById("topbarActions");
const categoryTabs = document.getElementById("categoryTabs");
const productList = document.getElementById("productList");
const cartFab = document.getElementById("cartFab");
const cartFabText = document.getElementById("cartFabText");
const cartModalOverlay = document.getElementById("cartModalOverlay");
const cartLines = document.getElementById("cartLines");
const cartTotal = document.getElementById("cartTotal");
const checkoutBtn = document.getElementById("checkoutBtn");
const closeCartBtn = document.getElementById("closeCartBtn");
const authModalOverlay = document.getElementById("authModalOverlay");
const tabLogin = document.getElementById("tabLogin");
const tabRegister = document.getElementById("tabRegister");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const loginError = document.getElementById("loginError");
const registerError = document.getElementById("registerError");
const closeAuthBtn = document.getElementById("closeAuthBtn");
const toast = document.getElementById("toast");

brandName.textContent = APP_CONFIG.nombreNegocio;
document.title = APP_CONFIG.nombreNegocio;

// ---------- toast ----------
let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

// ---------- topbar según sesión ----------
function renderTopbar() {
  topbarActions.innerHTML = "";
  if (currentUser) {
    const nameSpan = document.createElement("span");
    nameSpan.className = "hint-text";
    nameSpan.textContent = currentUser.displayName || currentUser.email;
    nameSpan.style.marginRight = "4px";

    const accountBtn = document.createElement("a");
    accountBtn.className = "btn btn-outline btn-sm";
    accountBtn.href = "cuenta.html";
    accountBtn.textContent = "Mis pedidos";

    const logoutBtn = document.createElement("button");
    logoutBtn.className = "btn btn-outline btn-sm";
    logoutBtn.textContent = "Salir";
    logoutBtn.onclick = () => signOut(auth);

    topbarActions.append(nameSpan, accountBtn, logoutBtn);
  } else {
    const loginBtn = document.createElement("button");
    loginBtn.className = "btn btn-sm";
    loginBtn.textContent = "Iniciar sesión";
    loginBtn.onclick = () => openAuthModal();
    topbarActions.append(loginBtn);
  }
}

// ---------- catálogo ----------
function renderCategoryTabs() {
  const cats = ["Todos", ...APP_CONFIG.categorias];
  categoryTabs.innerHTML = "";
  cats.forEach((cat) => {
    const tab = document.createElement("div");
    tab.className = "tab" + (cat === currentCategory ? " active" : "");
    tab.textContent = cat;
    tab.onclick = () => {
      currentCategory = cat;
      renderCategoryTabs();
      renderProducts();
    };
    categoryTabs.appendChild(tab);
  });
}

function renderProducts() {
  const visible = products.filter(
    (p) => p.activo !== false && (currentCategory === "Todos" || p.categoria === currentCategory)
  );

  if (visible.length === 0) {
    productList.innerHTML = `<div class="empty-state">No hay productos en esta categoría todavía.</div>`;
    return;
  }

  productList.className = "product-grid";
  productList.innerHTML = "";
  visible.forEach((p) => {
    const qty = cart[p.id]?.cantidad || 0;
    const imageHtml = p.imagen
      ? `<img class="product-image" src="${escapeHtml(p.imagen)}" alt="${escapeHtml(p.nombre)}" loading="lazy">`
      : `<div class="product-image-placeholder">🧴</div>`;

    const card = document.createElement("div");
    card.className = "card product-card";
    card.innerHTML = `
      ${imageHtml}
      <div class="product-body">
        <div class="product-name">${escapeHtml(p.nombre)}</div>
        <div class="product-unit">${escapeHtml(p.unidad || "")}</div>
        <div class="product-price">${APP_CONFIG.moneda}${formatNumber(p.precio)}</div>
        <div class="qty-row">
          <div class="qty-controls">
            <button class="qty-btn" data-action="minus">−</button>
            <span class="qty-value">${qty}</span>
            <button class="qty-btn" data-action="plus">+</button>
          </div>
        </div>
      </div>
    `;
    card.querySelector('[data-action="minus"]').onclick = () => changeQty(p, -1);
    card.querySelector('[data-action="plus"]').onclick = () => changeQty(p, 1);
    productList.appendChild(card);
  });
}

function changeQty(product, delta) {
  const current = cart[product.id]?.cantidad || 0;
  const next = Math.max(0, current + delta);
  if (next === 0) {
    delete cart[product.id];
  } else {
    cart[product.id] = { producto: product, cantidad: next };
  }
  renderProducts();
  renderCartFab();
}

// ---------- carrito ----------
function cartItemCount() {
  return Object.values(cart).reduce((sum, l) => sum + l.cantidad, 0);
}

function cartSubtotal() {
  return Object.values(cart).reduce((sum, l) => sum + l.cantidad * l.producto.precio, 0);
}

function renderCartFab() {
  const count = cartItemCount();
  if (count === 0) {
    cartFab.classList.remove("visible");
    return;
  }
  cartFab.classList.add("visible");
  cartFabText.textContent = `${count} producto${count === 1 ? "" : "s"} · ${APP_CONFIG.moneda}${formatNumber(cartSubtotal())}`;
}

function renderCartModal() {
  const lines = Object.values(cart);
  if (lines.length === 0) {
    cartLines.innerHTML = `<div class="empty-state">Todavía no agregaste productos.</div>`;
  } else {
    cartLines.innerHTML = "";
    lines.forEach(({ producto, cantidad }) => {
      const line = document.createElement("div");
      line.className = "cart-line";
      line.innerHTML = `
        <div>
          <div style="font-weight:600;">${escapeHtml(producto.nombre)}</div>
          <div class="hint-text">${cantidad} x ${APP_CONFIG.moneda}${formatNumber(producto.precio)}</div>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-weight:700;">${APP_CONFIG.moneda}${formatNumber(cantidad * producto.precio)}</span>
        </div>
      `;
      cartLines.appendChild(line);
    });
  }
  cartTotal.textContent = `${APP_CONFIG.moneda}${formatNumber(cartSubtotal())}`;
}

cartFab.onclick = () => {
  renderCartModal();
  cartModalOverlay.classList.add("open");
};
closeCartBtn.onclick = () => cartModalOverlay.classList.remove("open");

// ---------- checkout ----------
checkoutBtn.onclick = async () => {
  if (cartItemCount() === 0) return;
  if (!currentUser) {
    pendingCheckout = true;
    cartModalOverlay.classList.remove("open");
    openAuthModal();
    return;
  }
  await doCheckout();
};

async function doCheckout() {
  checkoutBtn.disabled = true;
  checkoutBtn.textContent = "Enviando...";
  try {
    const nota = document.getElementById("notaPedido").value.trim();
    const items = Object.values(cart).map(({ producto, cantidad }) => ({
      productId: producto.id,
      nombre: producto.nombre,
      precio: producto.precio,
      cantidad,
      subtotal: cantidad * producto.precio,
    }));
    const total = cartSubtotal();

    const orderRef = await addDoc(collection(db, "orders"), {
      customerId: currentUser.uid,
      customerNombre: currentUser.displayName || "",
      customerEmail: currentUser.email || "",
      items,
      total,
      nota,
      estado: "pendiente",
      fecha: serverTimestamp(),
    });

    const mensaje = buildWhatsAppMessage(items, total, nota, currentUser.displayName);
    const url = `https://wa.me/${APP_CONFIG.whatsappNumero}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, "_blank");

    cart = {};
    renderCartFab();
    cartModalOverlay.classList.remove("open");
    document.getElementById("notaPedido").value = "";
    showToast("¡Pedido enviado! Confirmá por WhatsApp.");
  } catch (err) {
    console.error(err);
    showToast("Hubo un error al enviar el pedido. Probá de nuevo.");
  } finally {
    checkoutBtn.disabled = false;
    checkoutBtn.textContent = "Confirmar y enviar por WhatsApp";
  }
}

function buildWhatsAppMessage(items, total, nota, nombreCliente) {
  const lineas = items.map((i) => `• ${i.nombre} x${i.cantidad} — ${APP_CONFIG.moneda}${formatNumber(i.subtotal)}`).join("\n");
  let msg = `Hola! Quiero hacer este pedido${nombreCliente ? " (" + nombreCliente + ")" : ""}:\n\n${lineas}\n\n*Total: ${APP_CONFIG.moneda}${formatNumber(total)}*`;
  if (nota) msg += `\n\nNota: ${nota}`;
  msg += `\n\nMe confirmás forma de pago y entrega? Gracias!`;
  return msg;
}

// ---------- auth modal ----------
function openAuthModal() {
  authModalOverlay.classList.add("open");
}
closeAuthBtn.onclick = () => {
  authModalOverlay.classList.remove("open");
  pendingCheckout = false;
};

tabLogin.onclick = () => {
  tabLogin.classList.add("active");
  tabRegister.classList.remove("active");
  loginForm.style.display = "block";
  registerForm.style.display = "none";
};
tabRegister.onclick = () => {
  tabRegister.classList.add("active");
  tabLogin.classList.remove("active");
  registerForm.style.display = "block";
  loginForm.style.display = "none";
};

loginForm.onsubmit = async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
    authModalOverlay.classList.remove("open");
  } catch (err) {
    loginError.textContent = traducirErrorAuth(err);
  }
};

registerForm.onsubmit = async (e) => {
  e.preventDefault();
  registerError.textContent = "";
  const nombre = document.getElementById("regNombre").value.trim();
  const telefono = document.getElementById("regTelefono").value.trim();
  const email = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPassword").value;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: nombre });
    await setDoc(doc(db, "customers", cred.user.uid), {
      nombre,
      telefono,
      email,
      fechaAlta: serverTimestamp(),
    });
    authModalOverlay.classList.remove("open");
  } catch (err) {
    registerError.textContent = traducirErrorAuth(err);
  }
};

function traducirErrorAuth(err) {
  const code = err?.code || "";
  if (code.includes("email-already-in-use")) return "Ese email ya tiene una cuenta. Iniciá sesión.";
  if (code.includes("invalid-email")) return "El email no es válido.";
  if (code.includes("weak-password")) return "La contraseña debe tener al menos 6 caracteres.";
  if (code.includes("wrong-password") || code.includes("invalid-credential")) return "Contraseña incorrecta.";
  if (code.includes("user-not-found")) return "No existe una cuenta con ese email.";
  return "Ocurrió un error. Probá de nuevo.";
}

// ---------- auth state ----------
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  renderTopbar();
  if (user && pendingCheckout) {
    pendingCheckout = false;
    await doCheckout();
  }
});

// ---------- carga de catálogo (tiempo real) ----------
const productsQuery = query(collection(db, "products"), orderBy("categoria"));
onSnapshot(productsQuery, (snap) => {
  products = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderCategoryTabs();
  renderProducts();
}, (err) => {
  console.error(err);
  productList.innerHTML = `<div class="empty-state">No se pudo cargar el catálogo. Revisá la configuración de Firebase en config.js.</div>`;
});

// ---------- utils ----------
function formatNumber(n) {
  return Number(n || 0).toLocaleString("es-AR");
}
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

renderCategoryTabs();
renderTopbar();
