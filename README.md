# Tienda + WhatsApp + panel del dueño

App de 3 partes, todo en HTML/JS + Firebase (mismo enfoque que veníamos usando en AS13):

- `index.html` — tienda pública: catálogo, carrito, checkout que manda el pedido por WhatsApp
- `cuenta.html` — historial de pedidos del cliente logueado
- `admin.html` — panel del dueño: estadísticas, pedidos, alta/baja de productos

## 1. Crear el proyecto de Firebase

1. [console.firebase.google.com](https://console.firebase.google.com) → crear proyecto nuevo.
2. **Authentication** → Sign-in method → habilitar **Email/contraseña**.
3. **Firestore Database** → crear base (modo producción).
4. Configuración del proyecto → Tus apps → agregar app **Web** → copiar el objeto de config y pegarlo en `config.js` (`firebaseConfig`).

## 2. Configurar `config.js`

- `nombreNegocio`: nombre que se ve en la tienda.
- `whatsappNumero`: número de WhatsApp del negocio, con código de país, sin `+` ni espacios (ej: `5491155555555`).
- `categorias`: las categorías del catálogo.
- `adminEmails`: el/los email(s) que van a poder entrar a `admin.html`. Ese email tiene que registrarse como cliente normal desde la tienda (con "Registrarme").

## 3. Reglas de seguridad

Copiá `firestore.rules` en Firebase Console → Firestore Database → Reglas (o hacé deploy con la CLI). **Importante:** el email de `adminEmails` tiene que estar repetido ahí adentro también (está comentado en el archivo).

## 4. Cargar el catálogo

No hace falta cargar nada a mano en Firestore: una vez que entrás a `admin.html` con el email admin, la pestaña **Catálogo** te deja agregar productos (nombre, categoría, precio, unidad) directo desde ahí.

## 5. Hosting (GitHub + Vercel)

1. Creá un repo nuevo en GitHub (ej: `distribuidora-limpieza`) y subí todos estos archivos.
2. En [vercel.com](https://vercel.com) → "Add New" → "Project" → importás ese repo.
3. Es un sitio estático sin build: en la config del proyecto elegí Framework Preset **"Other"**, dejá el Build Command vacío y el Output Directory como `.` (raíz). Vercel debería detectarlo solo.
4. Deploy → te da una URL (`algo.vercel.app`).
5. De ahí en más, cada cambio que subas a GitHub (`git push`) se despliega solo — mismo flujo que usás con AS13OBJETIVOS.

## Cómo funciona el flujo

1. El cliente entra a la tienda, arma su carrito.
2. Al confirmar, si no está logueado le pide crear cuenta o iniciar sesión (Firebase Auth, usuario y contraseña).
3. Se guarda el pedido en Firestore (colección `orders`, con `estado: "pendiente"`) y se abre WhatsApp con el mensaje del pedido ya armado, para que el cliente lo mande y ahí definan forma de pago y entrega.
4. El cliente puede ver su historial en `cuenta.html`.
5. El dueño entra a `admin.html` y ve: estadísticas (pedidos totales, facturado, clientes distintos, ticket promedio, ranking de clientes y de productos), la lista completa de pedidos (puede marcarlos como confirmados), y gestiona el catálogo.

## Estructura en Firestore

- `products/{id}`: `{ nombre, categoria, precio, unidad, imagen, activo }`
- `customers/{uid}`: `{ nombre, telefono, email, fechaAlta }`
- `orders/{id}`: `{ customerId, customerNombre, customerEmail, items[], total, nota, estado, fecha }`

## Cosas para charlar con el cliente / posibles mejoras después

- Hoy el precio es único para todos los clientes (así lo definimos). Si más adelante el cliente quiere precios diferenciados por comprador (típico en mayoristas), hay que sumar una colección de listas de precio — es un cambio de alcance, no de 5 minutos.
- No hay manejo de stock todavía (no se descuenta inventario). Si lo necesita, se puede agregar.
- El carrito vive en memoria mientras el cliente navega (no se guarda si cierra la pestaña a mitad de compra). Se puede persistir si hace falta.
- El WhatsApp es un link `wa.me` con el mensaje pre-armado — no hay integración con WhatsApp Business API (eso es otro nivel de complejidad/costo, normalmente no hace falta para este tamaño de negocio).
- Fotos de producto: ya se pueden cargar (campo "URL de la foto" al agregar un producto en `admin.html`). Hay que subir la foto a algún lugar que te dé un link directo a la imagen (Imgur, Google Fotos con "compartir públicamente", etc.) y pegar ese link — no se suben archivos directo a Firebase todavía.
