import {
  auth, db, APP_CONFIG,
  signOut, onAuthStateChanged,
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs, orderBy, query,
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

// ---------- tabs ----------
const tabs = document.querySelectorAll(".tabs .tab");
tabs.forEach((tab) => {
  tab.onclick = () => {
    tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    ["panelStats", "panelOrders", "panelCatalog"].forEach((id) => {
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

async function loadEverything() {
  await Promise.all([loadOrders(), loadCatalog()]);
  renderStats();
  populateCategorySelect();
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
      .map((i) => `<div class="cart-line"><span>${escapeHtml(i.nombre)} x${i.cantidad}</span><span>${APP_CONFIG.moneda}${formatNumber(i.subtotal)}</span></div>`)
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
        <div style="margin-top:10px; display:flex; gap:8px;">
          <button class="btn btn-sm" data-action="confirm">Marcar confirmado</button>
          <button class="btn btn-outline btn-sm" data-action="pending">Marcar pendiente</button>
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
  select.innerHTML = APP_CONFIG.categorias.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
}

async function loadCatalog() {
  const q = query(collection(db, "products"), orderBy("categoria"));
  const snap = await getDocs(q);
  allProducts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderCatalogList();
}

function renderCatalogList() {
  const list = document.getElementById("catalogList");
  if (allProducts.length === 0) {
    list.innerHTML = `<div class="empty-state">Todavía no cargaste productos.</div>`;
    return;
  }
  list.innerHTML = "";
  allProducts.forEach((p) => {
    const row = document.createElement("div");
    row.className = "card";
    row.style.cssText = "padding:12px 16px; margin-bottom:8px; display:flex; align-items:center; justify-content:space-between; gap:10px;";
    row.innerHTML = `
      <div>
        <div style="font-weight:600;">${escapeHtml(p.nombre)} ${p.activo === false ? '<span class="hint-text">(oculto)</span>' : ""}</div>
        <div class="hint-text">${escapeHtml(p.categoria)} · ${APP_CONFIG.moneda}${formatNumber(p.precio)} ${p.unidad ? "· " + escapeHtml(p.unidad) : ""}</div>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-outline btn-sm" data-action="toggle">${p.activo === false ? "Mostrar" : "Ocultar"}</button>
        <button class="btn btn-danger btn-sm" data-action="delete">Eliminar</button>
      </div>
    `;
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
      renderCatalogList();
      showToast("Producto eliminado");
    };
    list.appendChild(row);
  });
}

document.getElementById("productForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const nombre = document.getElementById("pNombre").value.trim();
  const categoria = document.getElementById("pCategoria").value;
  const precio = parseFloat(document.getElementById("pPrecio").value);
  const unidad = document.getElementById("pUnidad").value.trim();

  await addDoc(collection(db, "products"), { nombre, categoria, precio, unidad, activo: true });
  showToast("Producto agregado");
  e.target.reset();
  await loadCatalog();
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
