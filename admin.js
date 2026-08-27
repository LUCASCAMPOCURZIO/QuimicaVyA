import {
  auth, db, APP_CONFIG,
  signOut, onAuthStateChanged,
  collection, doc, addDoc, updateDoc, deleteDoc, deleteField, getDocs, orderBy, query,
  storage, ref, uploadBytes, getDownloadURL,
} from "./firebase-init.js";

document.getElementById("logoutBtn").onclick = () => signOut(auth);

const notAuthorized = document.getElementById("notAuthorized");
const adminContent = document.getElementById("adminContent");
const toast = document.getElementById("toast");

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2600);
}

// ---------- fotos: achicar en el navegador y subir a Firebase Storage ----------
function resizeImageFile(file, maxDim = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round(height * (maxDim / width));
          width = maxDim;
        } else {
          width = Math.round(width * (maxDim / height));
          height = maxDim;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(objectUrl);
          blob ? resolve(blob) : reject(new Error("No se pudo procesar la imagen"));
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("No se pudo leer la imagen"));
    };
    img.src = objectUrl;
  });
}

async function uploadImage(file, folder) {
  const blob = await resizeImageFile(file);
  const filename = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  const storageRef = ref(storage, filename);
  await uploadBytes(storageRef, blob, { contentType: "image/jpeg" });
  return getDownloadURL(storageRef);
}

function wirePreview(fileInputId, previewImgId) {
  const input = document.getElementById(fileInputId);
  const preview = document.getElementById(previewImgId);
  input.addEventListener("change", () => {
    const file = input.files[0];
    if (!file) {
      preview.style.display = "none";
      return;
    }
    preview.src = URL.createObjectURL(file);
    preview.style.display = "block";
  });
}
wirePreview("pImagenFile", "pImagenPreview");
wirePreview("promoImagenFile", "promoImagenPreview");

// ---------- selector de ícono para categorías ----------
const ICONOS_CATEGORIA = ["🧴", "🧽", "🧼", "🧻", "🪣", "🧹", "🧺", "🚿", "🛁", "🏠", "🍳", "🍽️", "💧", "✨", "🌸", "👕", "🧤", "♻️", "🐾", "🚗", "📦", "🛒", "🧪", "🌿"];

function renderIconPicker() {
  const picker = document.getElementById("iconPicker");
  const hiddenInput = document.getElementById("catIcono");
  picker.innerHTML = ICONOS_CATEGORIA.map((ic) => `<button type="button" class="icon-option" data-icon="${ic}">${ic}</button>`).join("");
  picker.querySelectorAll(".icon-option").forEach((btn) => {
    btn.onclick = () => {
      picker.querySelectorAll(".icon-option").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      hiddenInput.value = btn.dataset.icon;
    };
  });
}
renderIconPicker();

// ---------- tabs ----------
const tabs = document.querySelectorAll(".tabs .tab");
tabs.forEach((tab) => {
  tab.onclick = () => {
    tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    ["panelStats", "panelOrders", "panelCatalog", "panelPromos", "panelCategories"].forEach((id) => {
      document.getElementById(id).style.display = id === tab.dataset.panel ? "block" : "none";
    });
  };
});

// ---------- auth gate ----------
onAuthStateChanged(auth, async (user) => {
  if (!user || !APP_CONFIG.adminEmails.includes(user.email)) {
    notAuthorized.style.display = "block";
    adminContent.style.display = "none";
    return;
  }
  notAuthorized.style.display = "none";
  adminContent.style.display = "block";
  await loadEverything();
});

let allOrders = [];
let allProducts = [];
let allPromos = [];
let allCategories = [];

async function loadEverything() {
  await loadCategories(); // primero: catálogo y promos agrupan usando las categorías cargadas
  await Promise.all([loadOrders(), loadCatalog(), loadPromos()]);
  renderStats();
}

// ---------- pedidos ----------
async function loadOrders() {
  const q = query(collection(db, "orders"), orderBy("fecha", "desc"));
  const snap = await getDocs(q);
  allOrders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderOrdersAdmin();
}

function renderOrdersAdmin() {
  const list = document.getElementById("ordersAdminList");
  if (allOrders.length === 0) {
    list.innerHTML = `<div class="empty-state">Todavía no hay pedidos.</div>`;
    return;
  }
  list.innerHTML = "";
  allOrders.forEach((order) => {
    const fecha = order.fecha?.toDate ? order.fecha.toDate() : null;
    const fechaTexto = fecha ? fecha.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
    const badgeClass = order.estado === "confirmado" ? "badge-confirmed" : "badge-pending";
    const badgeText = order.estado === "confirmado" ? "Confirmado" : "Pendiente";
    const itemsHtml = (order.items || [])
      .map((i) => {
        // Preferimos la foto guardada en el momento del pedido (así el pedido queda como una
        // "foto" fiel de lo que se compró); si es un pedido viejo de antes de este cambio,
        // probamos con la foto actual del producto como respaldo.
        const productoActual = allProducts.find((p) => p.id === i.productId);
        const imagenSrc = i.imagen || productoActual?.imagen || "";
        const thumbHtml = imagenSrc
          ? `<img class="order-item-thumb" src="${escapeHtml(imagenSrc)}" alt="">`
          : `<div class="order-item-thumb-placeholder">🧴</div>`;
        return `
          <div class="order-item-line">
            ${thumbHtml}
            <span class="order-item-name">${escapeHtml(i.nombre)} x${i.cantidad}</span>
            <span class="order-item-price">${APP_CONFIG.moneda}${formatNumber(i.subtotal)}</span>
          </div>
        `;
      })
      .join("");

    const card = document.createElement("div");
    card.className = "card order-card";
    card.innerHTML = `
      <div class="order-header">
        <div>
          <span class="badge ${badgeClass}">${badgeText}</span>
          <div style="font-weight:600; margin-top:6px;">${escapeHtml(order.customerNombre || order.customerEmail || "Cliente")}</div>
          <div class="order-date">${fechaTexto}</div>
        </div>
        <div class="order-total">${APP_CONFIG.moneda}${formatNumber(order.total)}</div>
      </div>
      <div class="collapsible-body" style="display:none; padding-top:10px;">
        ${itemsHtml}
        ${order.nota ? `<div class="hint-text" style="margin-top:8px;">Nota: ${escapeHtml(order.nota)}</div>` : ""}
        <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn btn-sm" data-action="confirm">Marcar confirmado</button>
          <button class="btn btn-outline btn-sm" data-action="pending">Marcar pendiente</button>
          <button class="btn btn-danger btn-sm" data-action="delete" style="margin-left:auto;">Eliminar</button>
        </div>
      </div>
    `;
    const body = card.querySelector(".collapsible-body");
    card.querySelector(".order-header").addEventListener("click", () => {
      body.style.display = body.style.display === "none" ? "block" : "none";
    });
    card.querySelector('[data-action="confirm"]').addEventListener("click", async (e) => {
      e.stopPropagation();
      await updateDoc(doc(db, "orders", order.id), { estado: "confirmado" });
      order.estado = "confirmado";
      renderOrdersAdmin();
      renderStats();
      showToast("Pedido marcado como confirmado");
    });
    card.querySelector('[data-action="pending"]').addEventListener("click", async (e) => {
      e.stopPropagation();
      await updateDoc(doc(db, "orders", order.id), { estado: "pendiente" });
      order.estado = "pendiente";
      renderOrdersAdmin();
      renderStats();
      showToast("Pedido marcado como pendiente");
    });
    card.querySelector('[data-action="delete"]').addEventListener("click", async (e) => {
      e.stopPropagation();
      const quien = order.customerNombre || order.customerEmail || "este cliente";
      if (!confirm(`¿Eliminar el pedido de ${quien} por ${APP_CONFIG.moneda}${formatNumber(order.total)}? Esta acción no se puede deshacer.`)) return;
      await deleteDoc(doc(db, "orders", order.id));
      allOrders = allOrders.filter((o) => o.id !== order.id);
      renderOrdersAdmin();
      renderStats();
      showToast("Pedido eliminado");
    });
    list.appendChild(card);
  });
}

// ---------- estadísticas ----------
function renderStats() {
  const totalPedidos = allOrders.length;
  const totalFacturado = allOrders.reduce((sum, o) => sum + (o.total || 0), 0);
  const clientesUnicos = new Set(allOrders.map((o) => o.customerId)).size;
  const ticketPromedio = totalPedidos ? totalFacturado / totalPedidos : 0;

  const statGrid = document.getElementById("statGrid");
  statGrid.innerHTML = `
    <div class="card stat-card"><div class="stat-value">${totalPedidos}</div><div class="stat-label">Pedidos totales</div></div>
    <div class="card stat-card"><div class="stat-value">${APP_CONFIG.moneda}${formatNumber(totalFacturado)}</div><div class="stat-label">Facturado</div></div>
    <div class="card stat-card"><div class="stat-value">${clientesUnicos}</div><div class="stat-label">Clientes distintos</div></div>
    <div class="card stat-card"><div class="stat-value">${APP_CONFIG.moneda}${formatNumber(ticketPromedio)}</div><div class="stat-label">Ticket promedio</div></div>
  `;

  // ranking de clientes
  const porCliente = {};
  allOrders.forEach((o) => {
    const key = o.customerId || o.customerEmail;
    if (!porCliente[key]) porCliente[key] = { nombre: o.customerNombre || o.customerEmail, pedidos: 0, total: 0 };
    porCliente[key].pedidos += 1;
    porCliente[key].total += o.total || 0;
  });
  const rankingClientes = Object.values(porCliente).sort((a, b) => b.total - a.total).slice(0, 10);
  const topCustomersBody = document.querySelector("#topCustomersTable tbody");
  topCustomersBody.innerHTML = rankingClientes.length
    ? rankingClientes.map((c) => `<tr><td>${escapeHtml(c.nombre)}</td><td>${c.pedidos}</td><td>${APP_CONFIG.moneda}${formatNumber(c.total)}</td></tr>`).join("")
    : `<tr><td colspan="3" class="hint-text">Sin datos todavía</td></tr>`;

  // ranking de productos
  const porProducto = {};
  allOrders.forEach((o) => {
    (o.items || []).forEach((i) => {
      if (!porProducto[i.nombre]) porProducto[i.nombre] = { cantidad: 0, total: 0 };
      porProducto[i.nombre].cantidad += i.cantidad;
      porProducto[i.nombre].total += i.subtotal;
    });
  });
  const rankingProductos = Object.entries(porProducto)
    .map(([nombre, v]) => ({ nombre, ...v }))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 10);
  const topProductsBody = document.querySelector("#topProductsTable tbody");
  topProductsBody.innerHTML = rankingProductos.length
    ? rankingProductos.map((p) => `<tr><td>${escapeHtml(p.nombre)}</td><td>${p.cantidad}</td><td>${APP_CONFIG.moneda}${formatNumber(p.total)}</td></tr>`).join("")
    : `<tr><td colspan="3" class="hint-text">Sin datos todavía</td></tr>`;
}

// ---------- catálogo ----------
function populateCategorySelect() {
  const select = document.getElementById("pCategoria");
  const previo = select.value;
  select.innerHTML = allCategories.map((c) => `<option value="${escapeHtml(c.nombre)}">${escapeHtml(c.nombre)}</option>`).join("");
  if (previo && allCategories.some((c) => c.nombre === previo)) select.value = previo;
}

async function loadCatalog() {
  const q = query(collection(db, "products"), orderBy("categoria"));
  const snap = await getDocs(q);
  allProducts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderCatalogList();
  populatePromoProductSelect();
  renderPromoList(); // refresca el nombre del producto vinculado por si cambió
  renderOrdersAdmin(); // refresca las fotos de respaldo de pedidos viejos por si cargó después
}

let editingProductId = null;

function renderCatalogList() {
  const list = document.getElementById("catalogList");
  if (allProducts.length === 0) {
    list.innerHTML = `<div class="empty-state">Todavía no cargaste productos.</div>`;
    return;
  }
  list.innerHTML = "";

  // Agrupado por categoría (en el orden que configuraste en la pestaña "Categorías",
  // y cualquier categoría vieja/borrada que todavía tenga productos, al final)
  const categoriasOrden = allCategories.map((c) => c.nombre);
  allProducts.forEach((p) => {
    if (!categoriasOrden.includes(p.categoria)) categoriasOrden.push(p.categoria);
  });

  categoriasOrden.forEach((cat) => {
    const productosCat = allProducts.filter((p) => p.categoria === cat);
    if (productosCat.length === 0) return;

    const header = document.createElement("div");
    header.className = "section-title";
    header.style.cssText = "margin-top:18px; display:flex; align-items:center; justify-content:space-between;";
    header.innerHTML = `<span>${escapeHtml(cat)}</span><span class="hint-text" style="text-transform:none; letter-spacing:0;">${productosCat.length}</span>`;
    list.appendChild(header);

    productosCat.forEach((p) => list.appendChild(buildProductRow(p)));
  });
}

function buildProductRow(p) {
  const row = document.createElement("div");
  row.className = "card";
  row.style.cssText = "padding:12px 16px; margin-bottom:8px; display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;";
  const thumbHtml = p.imagen
    ? `<img src="${escapeHtml(p.imagen)}" alt="" style="width:44px; height:44px; border-radius:8px; object-fit:cover; flex-shrink:0;">`
    : `<div style="width:44px; height:44px; border-radius:8px; flex-shrink:0; display:flex; align-items:center; justify-content:center; background:var(--bg-elev-2); font-size:18px;">🧴</div>`;

  const tieneStock = typeof p.stock === "number";
  const stockHtml = tieneStock
    ? `<div style="display:flex; align-items:center; gap:6px;">
        <button class="btn btn-outline btn-sm" data-action="stock-minus" style="padding:2px 10px;">−</button>
        <span style="min-width:26px; text-align:center; font-weight:700; ${p.stock <= 0 ? "color:var(--text-dim);" : ""}">${p.stock}</span>
        <button class="btn btn-outline btn-sm" data-action="stock-plus" style="padding:2px 10px;">+</button>
      </div>`
    : "";

  row.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px;">
      ${thumbHtml}
      <div>
        <div style="font-weight:600;">${escapeHtml(p.nombre)} ${p.activo === false ? '<span class="hint-text">(oculto)</span>' : ""}</div>
        <div class="hint-text">${APP_CONFIG.moneda}${formatNumber(p.precio)} ${p.unidad ? "· " + escapeHtml(p.unidad) : ""} ${tieneStock ? (p.stock <= 0 ? "· sin stock" : "") : ""}</div>
      </div>
    </div>
    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
      ${stockHtml}
      <button class="btn btn-outline btn-sm" data-action="edit">Editar</button>
      <button class="btn btn-outline btn-sm" data-action="toggle">${p.activo === false ? "Mostrar" : "Ocultar"}</button>
      <button class="btn btn-danger btn-sm" data-action="delete">Eliminar</button>
    </div>
  `;

  if (tieneStock) {
    row.querySelector('[data-action="stock-minus"]').onclick = async () => {
      const nuevo = Math.max(0, p.stock - 1);
      await updateDoc(doc(db, "products", p.id), { stock: nuevo });
      p.stock = nuevo;
      renderCatalogList();
    };
    row.querySelector('[data-action="stock-plus"]').onclick = async () => {
      const nuevo = p.stock + 1;
      await updateDoc(doc(db, "products", p.id), { stock: nuevo });
      p.stock = nuevo;
      renderCatalogList();
    };
  }
  row.querySelector('[data-action="edit"]').onclick = () => fillProductFormForEdit(p);
  row.querySelector('[data-action="toggle"]').onclick = async () => {
    const nuevoEstado = p.activo === false ? true : false;
    await updateDoc(doc(db, "products", p.id), { activo: nuevoEstado });
    p.activo = nuevoEstado;
    renderCatalogList();
  };
  row.querySelector('[data-action="delete"]').onclick = async () => {
    if (!confirm(`¿Eliminar "${p.nombre}" del catálogo?`)) return;
    await deleteDoc(doc(db, "products", p.id));
    allProducts = allProducts.filter((x) => x.id !== p.id);
    if (editingProductId === p.id) cancelProductEdit();
    renderCatalogList();
    showToast("Producto eliminado");
  };

  return row;
}

// ---------- edición de producto ----------
const productForm = document.getElementById("productForm");
const productSubmitBtn = document.getElementById("productSubmitBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const catalogFormTitle = document.getElementById("catalogFormTitle");
const pImagenPreview = document.getElementById("pImagenPreview");

function fillProductFormForEdit(p) {
  editingProductId = p.id;
  document.getElementById("pEditId").value = p.id;
  document.getElementById("pNombre").value = p.nombre || "";
  document.getElementById("pCategoria").value = p.categoria || "";
  document.getElementById("pPrecio").value = p.precio ?? "";
  document.getElementById("pUnidad").value = p.unidad || "";
  document.getElementById("pStock").value = typeof p.stock === "number" ? p.stock : "";
  document.getElementById("pImagenFile").value = "";
  if (p.imagen) {
    pImagenPreview.src = p.imagen;
    pImagenPreview.style.display = "block";
  } else {
    pImagenPreview.style.display = "none";
  }
  catalogFormTitle.textContent = `Editando "${p.nombre}"`;
  productSubmitBtn.textContent = "Guardar cambios";
  cancelEditBtn.style.display = "inline-flex";
  productForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function cancelProductEdit() {
  editingProductId = null;
  productForm.reset();
  document.getElementById("pEditId").value = "";
  pImagenPreview.style.display = "none";
  catalogFormTitle.textContent = "Agregar producto";
  productSubmitBtn.textContent = "Agregar al catálogo";
  cancelEditBtn.style.display = "none";
}

cancelEditBtn.onclick = () => cancelProductEdit();

productForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const nombre = document.getElementById("pNombre").value.trim();
  const categoria = document.getElementById("pCategoria").value;
  const precio = parseFloat(document.getElementById("pPrecio").value);
  const unidad = document.getElementById("pUnidad").value.trim();
  const stockRaw = document.getElementById("pStock").value.trim();
  const stock = stockRaw === "" ? null : Math.max(0, parseInt(stockRaw, 10));
  const file = document.getElementById("pImagenFile").files[0];
  const submitBtn = productSubmitBtn;

  try {
    submitBtn.disabled = true;

    let imagen;
    if (file) {
      submitBtn.textContent = "Subiendo foto...";
      imagen = await uploadImage(file, "productos");
    }

    if (editingProductId) {
      const cambios = { nombre, categoria, precio, unidad };
      if (imagen) cambios.imagen = imagen;
      if (stock === null) cambios.stock = deleteField();
      else cambios.stock = stock;
      await updateDoc(doc(db, "products", editingProductId), cambios);
      showToast("Producto actualizado");
    } else {
      const nuevo = { nombre, categoria, precio, unidad, imagen: imagen || "", activo: true };
      if (stock !== null) nuevo.stock = stock;
      await addDoc(collection(db, "products"), nuevo);
      showToast("Producto agregado");
    }

    cancelProductEdit();
    await loadCatalog();
  } catch (err) {
    console.error("Error al guardar producto:", err);
    showToast("No se pudo guardar el producto. Probá de nuevo.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = editingProductId ? "Guardar cambios" : "Agregar al catálogo";
  }
});

// ---------- promos del carrusel ----------
function populatePromoProductSelect() {
  const select = document.getElementById("promoProducto");
  const previo = select.value;
  const categoriasOrden = allCategories.map((c) => c.nombre);
  allProducts.forEach((p) => {
    if (!categoriasOrden.includes(p.categoria)) categoriasOrden.push(p.categoria);
  });
  let optionsHtml = `<option value="">— No vincular a ningún producto —</option>`;
  categoriasOrden.forEach((cat) => {
    const productosCat = allProducts.filter((p) => p.categoria === cat);
    if (productosCat.length === 0) return;
    optionsHtml += `<optgroup label="${escapeHtml(cat)}">`;
    optionsHtml += productosCat.map((p) => `<option value="${p.id}">${escapeHtml(p.nombre)}</option>`).join("");
    optionsHtml += `</optgroup>`;
  });
  select.innerHTML = optionsHtml;
  if (previo && allProducts.some((p) => p.id === previo)) select.value = previo;
}

async function loadPromos() {
  const snap = await getDocs(collection(db, "promos"));
  allPromos = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.orden || 0) - (b.orden || 0));
  renderPromoList();
}

function renderPromoList() {
  const list = document.getElementById("promoList");
  if (allPromos.length === 0) {
    list.innerHTML = `<div class="empty-state">Todavía no cargaste promos. El carrusel no se muestra en la tienda hasta que haya al menos una.</div>`;
    return;
  }
  list.innerHTML = "";
  allPromos.forEach((p) => {
    const productoVinculado = p.productId ? allProducts.find((prod) => prod.id === p.productId) : null;
    const row = document.createElement("div");
    row.className = "card";
    row.style.cssText = "padding:12px 16px; margin-bottom:8px; display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;";
    row.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px; min-width:0;">
        <img src="${escapeHtml(p.imagen)}" alt="" style="width:64px; height:40px; border-radius:8px; object-fit:cover; flex-shrink:0;">
        <div style="min-width:0;">
          <div style="font-weight:600;">${p.texto ? escapeHtml(p.texto) : '<span class="hint-text">(sin texto)</span>'} ${p.activo === false ? '<span class="hint-text">(oculta)</span>' : ""}</div>
          <div class="hint-text">Orden: ${p.orden || 0}${productoVinculado ? " · lleva a: " + escapeHtml(productoVinculado.nombre) : (p.productId ? " · el producto vinculado ya no existe" : "")}</div>
        </div>
      </div>
      <div style="display:flex; gap:8px; flex-shrink:0;">
        <button class="btn btn-outline btn-sm" data-action="edit">Editar</button>
        <button class="btn btn-outline btn-sm" data-action="toggle">${p.activo === false ? "Mostrar" : "Ocultar"}</button>
        <button class="btn btn-danger btn-sm" data-action="delete">Eliminar</button>
      </div>
    `;
    row.querySelector('[data-action="edit"]').onclick = () => fillPromoFormForEdit(p);
    row.querySelector('[data-action="toggle"]').onclick = async () => {
      const nuevoEstado = p.activo === false ? true : false;
      await updateDoc(doc(db, "promos", p.id), { activo: nuevoEstado });
      p.activo = nuevoEstado;
      renderPromoList();
    };
    row.querySelector('[data-action="delete"]').onclick = async () => {
      if (!confirm("¿Eliminar esta promo del carrusel?")) return;
      await deleteDoc(doc(db, "promos", p.id));
      allPromos = allPromos.filter((x) => x.id !== p.id);
      if (editingPromoId === p.id) cancelPromoEdit();
      renderPromoList();
      showToast("Promo eliminada");
    };
    list.appendChild(row);
  });
}

// ---------- edición de promo ----------
let editingPromoId = null;
const promoForm = document.getElementById("promoForm");
const promoSubmitBtn = document.getElementById("promoSubmitBtn");
const cancelPromoEditBtn = document.getElementById("cancelPromoEditBtn");
const promoFormTitle = document.getElementById("promoFormTitle");
const promoImagenPreview = document.getElementById("promoImagenPreview");

function fillPromoFormForEdit(p) {
  editingPromoId = p.id;
  document.getElementById("promoEditId").value = p.id;
  document.getElementById("promoTexto").value = p.texto || "";
  document.getElementById("promoOrden").value = p.orden || 0;
  document.getElementById("promoProducto").value = p.productId || "";
  document.getElementById("promoImagenFile").value = "";
  if (p.imagen) {
    promoImagenPreview.src = p.imagen;
    promoImagenPreview.style.display = "block";
  } else {
    promoImagenPreview.style.display = "none";
  }
  promoFormTitle.textContent = "Editando promo";
  promoSubmitBtn.textContent = "Guardar cambios";
  cancelPromoEditBtn.style.display = "inline-flex";
  promoForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function cancelPromoEdit() {
  editingPromoId = null;
  promoForm.reset();
  document.getElementById("promoEditId").value = "";
  promoImagenPreview.style.display = "none";
  promoFormTitle.textContent = "Agregar promo";
  promoSubmitBtn.textContent = "Agregar promo";
  cancelPromoEditBtn.style.display = "none";
}

cancelPromoEditBtn.onclick = () => cancelPromoEdit();

promoForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const file = document.getElementById("promoImagenFile").files[0];
  const texto = document.getElementById("promoTexto").value.trim();
  const productId = document.getElementById("promoProducto").value;
  const ordenRaw = document.getElementById("promoOrden").value.trim();
  const orden = ordenRaw ? parseInt(ordenRaw, 10) : 0;
  const submitBtn = promoSubmitBtn;

  if (!editingPromoId && !file) {
    showToast("Elegí una imagen primero.");
    return;
  }

  try {
    submitBtn.disabled = true;

    let imagen;
    if (file) {
      submitBtn.textContent = "Subiendo imagen...";
      imagen = await uploadImage(file, "promos");
    }

    if (editingPromoId) {
      const cambios = { texto, orden, productId: productId || "" };
      if (imagen) cambios.imagen = imagen;
      await updateDoc(doc(db, "promos", editingPromoId), cambios);
      showToast("Promo actualizada");
    } else {
      await addDoc(collection(db, "promos"), { imagen, texto, orden, productId: productId || "", activo: true });
      showToast("Promo agregada");
    }

    cancelPromoEdit();
    await loadPromos();
  } catch (err) {
    console.error("Error al guardar la promo:", err);
    showToast("No se pudo guardar la promo. Probá de nuevo.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = editingPromoId ? "Guardar cambios" : "Agregar promo";
  }
});

// ---------- categorías ----------

// Íconos por defecto SOLO para la migración automática la primera vez que se abre este panel
// después de esta actualización (antes las categorías vivían fijas en config.js).
const ICONO_MIGRACION = [
  [["lavado", "ropa"], "🧺"],
  [["cocina"], "🍳"],
  [["desengras"], "🧴"],
  [["descart"], "🧻"],
  [["hogar"], "🏠"],
  [["baño", "bano"], "🚿"],
  [["perfum", "aroma"], "🌸"],
];
function iconoDeMigracion(nombre) {
  const norm = (nombre || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const match = ICONO_MIGRACION.find(([keywords]) => keywords.some((k) => norm.includes(k)));
  return match ? match[1] : ICONOS_CATEGORIA[0];
}

async function loadCategories() {
  const catsQuery = query(collection(db, "categories"), orderBy("orden"));
  let snap = await getDocs(catsQuery);

  // Migración automática (se hace una sola vez): si en Firestore todavía no hay categorías
  // pero en config.js sí había una lista vieja, las importamos para no perder lo que ya tenías cargado.
  if (snap.empty && Array.isArray(APP_CONFIG.categorias) && APP_CONFIG.categorias.length > 0) {
    for (let i = 0; i < APP_CONFIG.categorias.length; i++) {
      const nombre = APP_CONFIG.categorias[i];
      await addDoc(collection(db, "categories"), { nombre, icono: iconoDeMigracion(nombre), orden: i });
    }
    snap = await getDocs(catsQuery);
  }

  allCategories = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.orden || 0) - (b.orden || 0));
  renderCategoryList();
  populateCategorySelect();
}

function renderCategoryList() {
  const list = document.getElementById("categoryList");
  if (allCategories.length === 0) {
    list.innerHTML = `<div class="empty-state">Todavía no cargaste categorías.</div>`;
    return;
  }
  list.innerHTML = "";
  allCategories.forEach((c, i) => {
    const cantidadProductos = allProducts.filter((p) => p.categoria === c.nombre).length;
    const row = document.createElement("div");
    row.className = "card";
    row.style.cssText = "padding:12px 16px; margin-bottom:8px; display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;";
    row.innerHTML = `
      <div style="display:flex; align-items:center; gap:12px;">
        <div style="width:40px; height:40px; border-radius:10px; background:var(--bg-elev-2); display:flex; align-items:center; justify-content:center; font-size:20px; flex-shrink:0;">${c.icono || "🧽"}</div>
        <div>
          <div style="font-weight:600;">${escapeHtml(c.nombre)}</div>
          <div class="hint-text">${cantidadProductos} producto${cantidadProductos === 1 ? "" : "s"}</div>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
        <button class="btn btn-outline btn-sm" data-action="up" style="padding:4px 10px;" ${i === 0 ? "disabled" : ""}>↑</button>
        <button class="btn btn-outline btn-sm" data-action="down" style="padding:4px 10px;" ${i === allCategories.length - 1 ? "disabled" : ""}>↓</button>
        <button class="btn btn-outline btn-sm" data-action="edit">Editar</button>
        <button class="btn btn-danger btn-sm" data-action="delete">Eliminar</button>
      </div>
    `;
    row.querySelector('[data-action="up"]').onclick = () => moveCategory(i, -1);
    row.querySelector('[data-action="down"]').onclick = () => moveCategory(i, 1);
    row.querySelector('[data-action="edit"]').onclick = () => fillCategoryFormForEdit(c);
    row.querySelector('[data-action="delete"]').onclick = async () => {
      const aviso = cantidadProductos > 0
        ? `Hay ${cantidadProductos} producto${cantidadProductos === 1 ? "" : "s"} cargado${cantidadProductos === 1 ? "" : "s"} en "${c.nombre}". Si la eliminás, esos productos van a seguir existiendo pero esta categoría no va a aparecer más como filtro en la tienda. ¿Eliminar igual?`
        : `¿Eliminar la categoría "${c.nombre}"?`;
      if (!confirm(aviso)) return;
      await deleteDoc(doc(db, "categories", c.id));
      allCategories = allCategories.filter((x) => x.id !== c.id);
      if (editingCategoryId === c.id) cancelCategoryEdit();
      renderCategoryList();
      populateCategorySelect();
      showToast("Categoría eliminada");
    };
    list.appendChild(row);
  });
}

async function moveCategory(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= allCategories.length) return;
  const a = allCategories[index];
  const b = allCategories[target];
  const ordenA = a.orden ?? index;
  const ordenB = b.orden ?? target;
  await Promise.all([
    updateDoc(doc(db, "categories", a.id), { orden: ordenB }),
    updateDoc(doc(db, "categories", b.id), { orden: ordenA }),
  ]);
  a.orden = ordenB;
  b.orden = ordenA;
  [allCategories[index], allCategories[target]] = [allCategories[target], allCategories[index]];
  renderCategoryList();
}

// ---------- edición de categoría ----------
let editingCategoryId = null;
const categoryForm = document.getElementById("categoryForm");
const categorySubmitBtn = document.getElementById("categorySubmitBtn");
const cancelCategoryEditBtn = document.getElementById("cancelCategoryEditBtn");
const categoryFormTitle = document.getElementById("categoryFormTitle");

function fillCategoryFormForEdit(c) {
  editingCategoryId = c.id;
  document.getElementById("catEditId").value = c.id;
  document.getElementById("catNombre").value = c.nombre || "";
  document.getElementById("catIcono").value = c.icono || "";
  document.querySelectorAll("#iconPicker .icon-option").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.icon === c.icono);
  });
  categoryFormTitle.textContent = `Editando "${c.nombre}"`;
  categorySubmitBtn.textContent = "Guardar cambios";
  cancelCategoryEditBtn.style.display = "inline-flex";
  categoryForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function cancelCategoryEdit() {
  editingCategoryId = null;
  categoryForm.reset();
  document.getElementById("catEditId").value = "";
  document.getElementById("catIcono").value = "";
  document.querySelectorAll("#iconPicker .icon-option").forEach((btn) => btn.classList.remove("selected"));
  categoryFormTitle.textContent = "Agregar categoría";
  categorySubmitBtn.textContent = "Agregar categoría";
  cancelCategoryEditBtn.style.display = "none";
}

cancelCategoryEditBtn.onclick = () => cancelCategoryEdit();

categoryForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const nombre = document.getElementById("catNombre").value.trim();
  const icono = document.getElementById("catIcono").value;
  const submitBtn = categorySubmitBtn;

  if (!icono) {
    showToast("Elegí un ícono para la categoría.");
    return;
  }
  const yaExiste = allCategories.some(
    (c) => c.nombre.toLowerCase() === nombre.toLowerCase() && c.id !== editingCategoryId
  );
  if (yaExiste) {
    showToast("Ya existe una categoría con ese nombre.");
    return;
  }

  try {
    submitBtn.disabled = true;

    if (editingCategoryId) {
      const nombreAnterior = allCategories.find((c) => c.id === editingCategoryId)?.nombre;
      await updateDoc(doc(db, "categories", editingCategoryId), { nombre, icono });
      // si cambió el nombre, actualizamos los productos que lo usaban para que no queden huérfanos
      if (nombreAnterior && nombreAnterior !== nombre) {
        const productosAfectados = allProducts.filter((p) => p.categoria === nombreAnterior);
        await Promise.all(productosAfectados.map((p) => updateDoc(doc(db, "products", p.id), { categoria: nombre })));
      }
      showToast("Categoría actualizada");
    } else {
      const orden = allCategories.length ? Math.max(...allCategories.map((c) => c.orden ?? 0)) + 1 : 0;
      await addDoc(collection(db, "categories"), { nombre, icono, orden });
      showToast("Categoría agregada");
    }

    cancelCategoryEdit();
    await loadCategories();
    await loadCatalog(); // por si se renombró una categoría, refresca los productos ya agrupados
  } catch (err) {
    console.error("Error al guardar la categoría:", err);
    showToast("No se pudo guardar la categoría. Probá de nuevo.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = editingCategoryId ? "Guardar cambios" : "Agregar categoría";
  }
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
