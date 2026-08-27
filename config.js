// ============================================================
// CONFIGURACIÓN DEL NEGOCIO — editá estos valores
// ============================================================
export const APP_CONFIG = {
  nombreNegocio: "QuimicaVya",
  whatsappNumero: "5491123345336", // código de país + área + número, SIN + ni espacios (ej Argentina: 549 + código de área sin 0 + número sin 15)
  moneda: "$",
  categorias: ["Limpieza del hogar", "Lavado de ropa", "Cocina", "Desengrasantes", "Descartables", "Otros"],
  // Emails que pueden entrar al panel de administración (admin.html).
  // Tienen que registrarse como cliente normal en la tienda con ESE email para poder entrar.
  adminEmails: ["lucas.campo@hotmail.com.ar"],
};

// ============================================================
// CONFIGURACIÓN DE FIREBASE — pegá acá la config de tu proyecto
// (Firebase console → Configuración del proyecto → Tus apps → SDK setup and configuration)
// ============================================================
export const firebaseConfig = {
  apiKey: "AIzaSyCEYctPUBptYZWjz23G0nntC6bvkkbB4tg",
  authDomain: "quimicavya-91bfb.firebaseapp.com",
  projectId: "quimicavya-91bfb",
  storageBucket: "quimicavya-91bfb.firebasestorage.app",
  messagingSenderId: "196339203695",
  appId: "1:196339203695:web:17d1fc6fec9cb2332d179a",
};