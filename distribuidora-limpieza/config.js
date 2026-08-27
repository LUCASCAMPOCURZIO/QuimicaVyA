// ============================================================
// CONFIGURACIÓN DEL NEGOCIO — editá estos valores
// ============================================================
export const APP_CONFIG = {
  nombreNegocio: "Tu Distribuidora",
  whatsappNumero: "5491100000000", // código de país + área + número, SIN + ni espacios (ej Argentina: 549 + código de área sin 0 + número sin 15)
  moneda: "$",
  categorias: ["Limpieza del hogar", "Lavado de ropa", "Cocina", "Desengrasantes", "Descartables", "Otros"],
  // Emails que pueden entrar al panel de administración (admin.html).
  // Tienen que registrarse como cliente normal en la tienda con ESE email para poder entrar.
  adminEmails: ["dueño@ejemplo.com"],
};

// ============================================================
// CONFIGURACIÓN DE FIREBASE — pegá acá la config de tu proyecto
// (Firebase console → Configuración del proyecto → Tus apps → SDK setup and configuration)
// ============================================================
export const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto",
  storageBucket: "tu-proyecto.appspot.com",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID",
};
