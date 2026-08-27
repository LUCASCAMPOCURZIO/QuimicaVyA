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
let searchQuery = "";
let pendingCheckout = false; // si el usuario apretó "confirmar pedido" antes de estar logueado
let promos = [];
let promoIndex = 0;
let promoTimer = null;
let promoTouchStartX = null;

// ---------- refs UI ----------
const brandName = document.getElementById("brandName");
const footerBrandName = document.getElementById("footerBrandName");
const topbarActions = document.getElementById("topbarActions");
const categoryStrip = document.getElementById("categoryStrip");
const productList = document.getElementById("productList");
const statProductCount = document.getElementById("statProductCount");
const statCategoryCount = document.getElementById("statCategoryCount");
const heroWhatsappBtn = document.getElementById("heroWhatsappBtn");
const footerWhatsappLink = document.getElementById("footerWhatsappLink");
const waFloat = document.getElementById("waFloat");
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
const searchInput = document.getElementById("searchInput");
const clearSearchBtn = document.getElementById("clearSearchBtn");
const promoCarousel = document.getElementById("promoCarousel");
const promoTrack = document.getElementById("promoTrack");
const promoDots = document.getElementById("promoDots");
const promoPrev = document.getElementById("promoPrev");
const promoNext = document.getElementById("promoNext");

brandName.textContent = APP_CONFIG.nombreNegocio;
footerBrandName.textContent = APP_CONFIG.nombreNegocio;
document.title = APP_CONFIG.nombreNegocio;

const consultaGeneralUrl = `https://wa.me/${APP_CONFIG.whatsappNumero}?text=${encodeURIComponent("Hola! Quería hacer una consulta.")}`;
heroWhatsappBtn.href = consultaGeneralUrl;
footerWhatsappLink.href = consultaGeneralUrl;
waFloat.href = consultaGeneralUrl;

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
const CATEGORY_ICONS = [
  [["lavado", "ropa"], "🧺"],
  [["cocina"], "🍳"],
  [["desengras"], "🧴"],
  [["descart"], "🧻"],
  [["hogar"], "🏠"],
  [["baño", "bano"], "🚿"],
  [["perfum", "aroma"], "🌸"],
];

function getCategoryIcon(cat) {
  if (cat === "Todos") return "🗂️";
  const norm = normalize(cat);
  const match = CATEGORY_ICONS.find(([keywords]) => keywords.some((k) => norm.includes(k)));
  return match ? match[1] : "🧽";
}

function renderCategoryStrip() {
  const cats = ["Todos", ...APP_CONFIG.categorias];
  categoryStrip.innerHTML = "";
  cats.forEach((cat) => {
    const card = document.createElement("div");
    card.className = "cat-card" + (cat === currentCategory && !searchQuery ? " active" : "");
    card.innerHTML = `<div class="cat-ic">${getCategoryIcon(cat)}</div><span>${escapeHtml(cat)}</span>`;
    card.onclick = () => {
      currentCategory = cat;
      if (searchQuery) {
        searchQuery = "";
        searchInput.value = "";
        clearSearchBtn.style.display = "none";
      }
      renderCategoryStrip();
      renderProducts();
    };
    categoryStrip.appendChild(card);
  });
}

function renderProducts() {
  let visible;
  if (searchQuery) {
    const q = normalize(searchQuery);
    visible = products.filter(
      (p) => p.activo !== false && (normalize(p.nombre).includes(q) || normalize(p.categoria).includes(q))
    );
  } else {
    visible = products.filter(
      (p) => p.activo !== false && (currentCategory === "Todos" || p.categoria === currentCategory)
    );
  }

  if (visible.length === 0) {
    productList.innerHTML = searchQuery
      ? `<div class="empty-state">No encontramos productos para "${escapeHtml(searchQuery)}". Probá con otra palabra.</div>`
      : `<div class="empty-state">No hay productos en esta categoría todavía.</div>`;
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
  renderCategoryStrip();
  renderProducts();
  renderHeroStats();
}, (err) => {
  console.error(err);
  productList.innerHTML = `<div class="empty-state">No se pudo cargar el catálogo. Revisá la configuración de Firebase en config.js.</div>`;
});

// ---------- carrusel de promos ----------
function activePromos() {
  return promos.filter((p) => p.activo !== false && p.imagen);
}

function renderPromoCarousel() {
  const activos = activePromos();
  if (activos.length === 0) {
    promoCarousel.style.display = "none";
    stopPromoAutoplay();
    return;
  }
  promoCarousel.style.display = "block";
  if (promoIndex >= activos.length) promoIndex = 0;

  promoTrack.innerHTML = activos.map((p) => `
    <div class="promo-slide">
      <img src="${escapeHtml(p.imagen)}" alt="${escapeHtml(p.texto || "Promo")}" loading="lazy">
      ${p.texto ? `<div class="promo-caption">${escapeHtml(p.texto)}</div>` : ""}
    </div>
  `).join("");

  promoDots.innerHTML = activos.map((_, i) =>
    `<button type="button" class="promo-dot${i === promoIndex ? " active" : ""}" data-index="${i}" aria-label="Ir a promo ${i + 1}"></button>`
  ).join("");
  promoDots.querySelectorAll(".promo-dot").forEach((dot) => {
    dot.onclick = () => {
      goToPromo(Number(dot.dataset.index));
      resetPromoAutoplay();
    };
  });

  const showArrows = activos.length > 1;
  promoPrev.style.display = showArrows ? "flex" : "none";
  promoNext.style.display = showArrows ? "flex" : "none";

  updatePromoPosition();
  startPromoAutoplay(activos.length);
}

function updatePromoPosition() {
  promoTrack.style.transform = `translateX(-${promoIndex * 100}%)`;
  promoDots.querySelectorAll(".promo-dot").forEach((dot, i) => dot.classList.toggle("active", i === promoIndex));
}

function goToPromo(i) {
  const count = activePromos().length;
  if (count === 0) return;
  promoIndex = ((i % count) + count) % count;
  updatePromoPosition();
}

function startPromoAutoplay(count) {
  stopPromoAutoplay();
  if (count <= 1) return;
  promoTimer = setInterval(() => goToPromo(promoIndex + 1), 4200);
}

function stopPromoAutoplay() {
  if (promoTimer) clearInterval(promoTimer);
  promoTimer = null;
}

function resetPromoAutoplay() {
  startPromoAutoplay(activePromos().length);
}

promoPrev.onclick = () => {
  goToPromo(promoIndex - 1);
  resetPromoAutoplay();
};
promoNext.onclick = () => {
  goToPromo(promoIndex + 1);
  resetPromoAutoplay();
};

promoTrack.addEventListener("touchstart", (e) => {
  promoTouchStartX = e.touches[0].clientX;
}, { passive: true });

promoTrack.addEventListener("touchend", (e) => {
  if (promoTouchStartX === null) return;
  const delta = e.changedTouches[0].clientX - promoTouchStartX;
  if (Math.abs(delta) > 40) {
    goToPromo(promoIndex + (delta < 0 ? 1 : -1));
    resetPromoAutoplay();
  }
  promoTouchStartX = null;
});

onSnapshot(collection(db, "promos"), (snap) => {
  promos = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.orden || 0) - (b.orden || 0));
  renderPromoCarousel();
}, (err) => {
  console.error(err);
});

// ---------- buscador ----------
searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value.trim();
  clearSearchBtn.style.display = searchQuery ? "flex" : "none";
  renderProducts();
});
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    searchQuery = "";
    searchInput.value = "";
    clearSearchBtn.style.display = "none";
    renderProducts();
  }
});
clearSearchBtn.addEventListener("click", () => {
  searchQuery = "";
  searchInput.value = "";
  clearSearchBtn.style.display = "none";
  renderProducts();
  searchInput.focus();
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
function normalize(str) {
  return (str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function renderHeroStats() {
  const activos = products.filter((p) => p.activo !== false);
  statProductCount.textContent = activos.length;
  statCategoryCount.textContent = new Set(activos.map((p) => p.categoria)).size;
}

renderCategoryStrip();
renderTopbar();
