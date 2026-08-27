# Tienda + WhatsApp + panel del dueño

App de 3 partes, todo en HTML/JS + Firebase (mismo enfoque que veníamos usando en AS13):

- `index.html` — tienda pública: home tipo landing (hero, carrusel de promos, franja de categorías con íconos, buscador, catálogo, sección "por qué pedirnos", footer), carrito, checkout que manda el pedido por WhatsApp
- `cuenta.html` — historial de pedidos del cliente logueado
- `admin.html` — panel del dueño: estadísticas, pedidos, alta/baja de productos

### Sobre la sección "¿Por qué pedirnos?" y las estadísticas del hero

Las estadísticas del hero (cantidad de productos y categorías) son reales — se calculan solas a partir de lo que cargues en el catálogo, no hay que tocar nada. Los 4 textos de "¿Por qué pedirnos?" describen cómo funciona la herramienta (son ciertos apenas la usás), no son data del negocio en sí — si en algún momento el cliente quiere sumar algo específico de su negocio (años en el rubro, zona de entrega, medios de pago que acepta, etc.) hay que agregarlo a mano en `index.html`, ese contenido no lo puedo inventar yo.

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

⚠️ Si ya tenías las reglas viejas publicadas (de antes de que existiera el carrusel de promos), tenés que volver a pegar el `firestore.rules` actualizado y publicar de nuevo — si no, cargar promos desde `admin.html` va a fallar con un error de permisos.

## Habilitar Storage (para poder subir fotos)

Las fotos de productos y de promos se suben directo desde `admin.html` (elegís el archivo desde tu compu o celular, no hace falta subirlo a otro lado ni pegar ningún link). Para que esto funcione hay que habilitar un producto más de Firebase, aparte de Authentication y Firestore:

1. En Firebase Console → menú de la izquierda, sección **Build** → **Storage** → botón "Comenzar"/"Get started". Aceptás las reglas por defecto (las vamos a reemplazar en el paso siguiente) y elegís la ubicación (podés dejar la que sugiere).
2. Una vez creado, andá a la pestaña **Rules** dentro de Storage y pegá el contenido de `storage.rules` (reemplazando lo que haya), igual que hiciste con las reglas de Firestore. **Importante:** ahí también tiene que estar repetido el email de `adminEmails` (está comentado en el archivo).
3. Listo — ya podés elegir una foto al cargar un producto o una promo en `admin.html`.

La imagen se comprime y redimensiona automáticamente en el navegador antes de subirse (para que no pese de más ni tarde en cargar en la tienda), así que podés sacar la foto directo con el celular sin preocuparte por el tamaño.

## Carrusel de promos

En `admin.html` → pestaña **"Promos"** cargás imágenes (idealmente horizontales/apaisadas) con un texto opcional superpuesto y un orden. Van pasando solas cada ~4 segundos en la home, con flechas y puntitos para navegar a mano, y también se puede deslizar con el dedo en el celular. Si no cargaste ninguna promo, esa sección directamente no aparece — no queda un hueco vacío. Cada promo también tiene botón **"Editar"** para corregir la foto, el texto, el orden o el producto vinculado sin tener que borrarla y recargarla.

### Vincular una promo a un producto

Al cargar o editar una promo podés elegir, de forma opcional, a qué producto del catálogo corresponde. Si la vinculás, en la tienda esa promo muestra un botón **"¡Lo quiero!"** sobre la imagen (y la imagen entera también es clickeable) — al tocarlo, la página baja sola hasta ese producto en el catálogo y lo resalta un instante con un brillo verde, para que el cliente lo vea al toque y pueda ajustar la cantidad y confirmar el pedido. Si no vinculás ningún producto, la promo se muestra igual que antes, sin botón.

## 4. Cargar el catálogo

No hace falta cargar nada a mano en Firestore: una vez que entrás a `admin.html` con el email admin, la pestaña **Catálogo** te deja agregar productos (nombre, categoría, precio, unidad, foto y stock opcional) directo desde ahí. La lista queda agrupada por categoría para que sea fácil de recorrer, y cada producto tiene un botón **"Editar"** para corregir cualquier dato después (incluida la foto — si no elegís una nueva, se mantiene la que ya tenía).

⚠️ Si ya tenías las reglas de Firestore publicadas de antes de este cambio, tenés que volver a pegar el `firestore.rules` actualizado y publicar de nuevo (ver sección 3) — si no, el descuento automático de stock al confirmar un pedido no va a funcionar.

### Stock

El campo "Stock" al cargar o editar un producto es opcional:

- **Vacío** (como hasta ahora): el producto siempre figura disponible, sin límite.
- **Con un número**: en la tienda se muestra un cartelito "¡Últimas N!" cuando queda poco (5 o menos), y "Sin stock" cuando llega a 0 — ahí el cliente ya no puede agregarlo al carrito. Cada vez que se confirma un pedido, el stock de esos productos se descuenta solo.

Para cargar o corregir stock rápido sin entrar a editar todo el producto, en la lista del panel (pestaña Catálogo) cada producto con stock cargado tiene botones **−** / **+** al lado para ajustarlo a mano en el momento (por ejemplo, después de contar mercadería o reponer).

Ojo con un detalle: el descuento de stock pasa apenas el cliente confirma el pedido y se abre WhatsApp — no espera a que se confirme el pago. Si un pedido termina cayéndose (el cliente se arrepiente, no contesta, etc.), hay que sumar el stock de vuelta a mano con el botón "+". Para este tamaño de negocio es la forma más simple; un control más estricto (reservar stock, liberarlo automáticamente, etc.) es un desarrollo más grande.

## 5. Hosting (GitHub + Vercel)

1. Creá un repo nuevo en GitHub (ej: `distribuidora-limpieza`) y subí todos estos archivos.
2. En [vercel.com](https://vercel.com) → "Add New" → "Project" → importás ese repo.
3. Es un sitio estático sin build: en la config del proyecto elegí Framework Preset **"Other"**, dejá el Build Command vacío y el Output Directory como `.` (raíz). Vercel debería detectarlo solo.
4. Deploy → te da una URL (`algo.vercel.app`).
5. De ahí en más, cada cambio que subas a GitHub (`git push`) se despliega solo — mismo flujo que usás con AS13OBJETIVOS.

## Cómo funciona el flujo

1. El cliente entra a la tienda, busca productos (hay un buscador arriba del catálogo que filtra por nombre o categoría, sin importar mayúsculas/tildes) o navega por categoría, y arma su carrito.
2. Al confirmar, si no está logueado le pide crear cuenta o iniciar sesión (Firebase Auth, usuario y contraseña).
3. Se guarda el pedido en Firestore (colección `orders`, con `estado: "pendiente"`) y se abre WhatsApp con el mensaje del pedido ya armado, para que el cliente lo mande y ahí definan forma de pago y entrega.
4. El cliente puede ver su historial en `cuenta.html`.
5. El dueño entra a `admin.html` y ve: estadísticas (pedidos totales, facturado, clientes distintos, ticket promedio, ranking de clientes y de productos), la lista completa de pedidos (puede marcarlos como confirmados), y gestiona el catálogo.

## ¿Y si un cliente (o vos) se olvida la contraseña?

En el modal de login hay un botón **"¿Olvidaste tu contraseña?"**. Escribís el email arriba y lo tocás — Firebase manda automáticamente un mail con un link para elegir una contraseña nueva. No hace falta que hagas nada manual en la consola. Ese email lo manda Firebase con una dirección genérica (`noreply@tu-proyecto.firebaseapp.com`); si en algún momento querés que el mail tenga el nombre del negocio, se puede personalizar en Firebase Console → Authentication → Templates.

## Estructura en Firestore

- `products/{id}`: `{ nombre, categoria, precio, unidad, imagen, activo, stock }` (`stock` es opcional — si no está, el producto no tiene control de stock)
- `customers/{uid}`: `{ nombre, telefono, email, fechaAlta }`
- `orders/{id}`: `{ customerId, customerNombre, customerEmail, items[], total, nota, estado, fecha }`
- `promos/{id}`: `{ imagen, texto, orden, activo, productId }` (`productId` es opcional — si está, la promo lleva a ese producto en la tienda)

## Cosas para charlar con el cliente / posibles mejoras después

- Hoy el precio es único para todos los clientes (así lo definimos). Si más adelante el cliente quiere precios diferenciados por comprador (típico en mayoristas), hay que sumar una colección de listas de precio — es un cambio de alcance, no de 5 minutos.
- El manejo de stock es intencionalmente simple (ver sección "Stock" más arriba): se descuenta al confirmar el pedido, no al confirmarse el pago. Si el negocio crece y hace falta algo más estricto (reservar stock, cancelaciones automáticas, etc.), es un desarrollo aparte.
- El carrito vive en memoria mientras el cliente navega (no se guarda si cierra la pestaña a mitad de compra). Se puede persistir si hace falta.
- El WhatsApp es un link `wa.me` con el mensaje pre-armado — no hay integración con WhatsApp Business API (eso es otro nivel de complejidad/costo, normalmente no hace falta para este tamaño de negocio).
- Fotos de producto y de promos: se suben directo como archivo desde `admin.html` (ver sección "Habilitar Storage" más arriba) — no hace falta pegar ningún link ni subirlas a otro lado antes.
