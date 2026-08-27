import {
  auth, db, APP_CONFIG,
  signOut, onAuthStateChanged,
  collection, query, where, orderBy, getDocs, getDoc, doc,
} from "./firebase-init.js";

const customerInfo = document.getElementById("customerInfo");
const ordersList = document.getElementById("ordersList");
document.getElementById("logoutBtn").onclick = () => signOut(auth);

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  await loadCustomer(user);
  await loadOrders(user);
});

async function loadCustomer(user) {
  let telefono = "";
  try {
    const snap = await getDoc(doc(db, "customers", user.uid));
    if (snap.exists()) telefono = snap.data().telefono || "";
  } catch (e) { /* no bloquea la carga de pedidos */ }

  customerInfo.innerHTML = `
    <div style="font-weight:700; font-size:16px;">${escapeHtml(user.displayName || "Cliente")}</div>
    <div class="hint-text">${escapeHtml(user.email || "")}${telefono ? " · " + escapeHtml(telefono) : ""}</div>
  `;
}

async function loadOrders(user) {
  try {
    const q = query(collection(db, "orders"), where("customerId", "==", user.uid), orderBy("fecha", "desc"));
    const snap = await getDocs(q);
    if (snap.empty) {
      ordersList.innerHTML = `<div class="empty-state">Todavía no hiciste ningún pedido.</div>`;
      return;
    }
    ordersList.innerHTML = "";
    snap.forEach((docSnap) => {
      const order = docSnap.data();
      ordersList.appendChild(renderOrderCard(order));
    });
  } catch (err) {
    console.error(err);
    ordersList.innerHTML = `<div class="empty-state">No se pudo cargar tu historial. Probá de nuevo más tarde.</div>`;
  }
}

function renderOrderCard(order) {
  const wrapper = document.createElement("div");
  wrapper.className = "card order-card";

  const fecha = order.fecha?.toDate ? order.fecha.toDate() : null;
  const fechaTexto = fecha ? fecha.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

  const badgeClass = order.estado === "confirmado" ? "badge-confirmed" : "badge-pending";
  const badgeText = order.estado === "confirmado" ? "Confirmado" : "Pendiente";

  const itemsHtml = (order.items || [])
    .map((i) => `<div class="cart-line"><span>${escapeHtml(i.nombre)} x${i.cantidad}</span><span>${APP_CONFIG.moneda}${formatNumber(i.subtotal)}</span></div>`)
    .join("");

  wrapper.innerHTML = `
    <div class="order-header">
      <div>
        <span class="badge ${badgeClass}">${badgeText}</span>
        <div class="order-date" style="margin-top:6px;">${fechaTexto}</div>
      </div>
      <div class="order-total">${APP_CONFIG.moneda}${formatNumber(order.total)}</div>
    </div>
    <div class="collapsible-body" style="display:none; padding-top:10px;">
      ${itemsHtml}
      ${order.nota ? `<div class="hint-text" style="margin-top:8px;">Nota: ${escapeHtml(order.nota)}</div>` : ""}
    </div>
  `;

  const body = wrapper.querySelector(".collapsible-body");
  wrapper.addEventListener("click", () => {
    body.style.display = body.style.display === "none" ? "block" : "none";
  });

  return wrapper;
}

function formatNumber(n) {
  return Number(n || 0).toLocaleString("es-AR");
}
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
