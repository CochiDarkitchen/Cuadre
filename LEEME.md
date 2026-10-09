# Cuadre en la web (instalable en el celular)

Estos archivos forman la app completa:

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La página principal (diseño y estructura). |
| `app.js` | Todo el funcionamiento. Arriba tiene 2 líneas para pegar los datos de Supabase. |
| `schema.sql` | Crea las tablas y las reglas de seguridad en Supabase. |
| `service-worker.js` | Hace que la app abra rápido y también sin internet. |
| `manifest.json` | Le dice al celular que es una app (nombre, colores, íconos). |
| `icons/` | Los íconos de la app. Son un diseño provisional: cámbialos por el tuyo (mismos nombres y tamaños). |

Si no pegas los datos de Supabase, la app funciona igual pero guarda todo solo en ese navegador. Sirve para probarla.

## Paso 1. Crear la base de datos en Supabase (gratis)

1. Entra a **supabase.com**, crea una cuenta y toca **New project**. Ponle nombre (por ejemplo, Cuadre), inventa una contraseña de base de datos (guárdala) y elige la región más cercana.
2. Cuando termine de crearse, abre **SQL Editor**, toca **New query**, pega TODO el contenido de `schema.sql` y toca **Run**. Debe decir que se ejecutó con éxito. Puedes volver a ejecutarlo sin problema.

## Paso 2. Conectar la app con tu Supabase

1. En Supabase abre **Project Settings > API** (o "API Keys").
2. Copia el **Project URL** y la clave **anon public** (en proyectos nuevos puede llamarse **publishable**).
3. Abre `app.js` con el Bloc de notas y pega los dos datos arriba, entre las comillas:

```js
var CONFIG = {
  SUPABASE_URL: 'https://TU-PROYECTO.supabase.co',
  SUPABASE_ANON_KEY: 'tu-clave-anon-public'
};
```

La clave anon es pública por diseño; la seguridad la dan las reglas de `schema.sql`. **Nunca pegues la clave `service_role`.**

## Paso 3. Publicarla en internet (gratis)

La app necesita una dirección segura (https) para poder instalarse en el celular.

1. Entra a **app.netlify.com/drop** (Netlify).
2. Arrastra la carpeta completa de Cuadre (con todos los archivos y la carpeta `icons`).
3. Netlify te da una dirección como `https://algo-raro.netlify.app`. Esa es tu app.

(También sirven GitHub Pages o Cloudflare Pages, si ya los conoces.)

## Paso 4. Ajustar el correo de confirmación

En Supabase, **Authentication > URL Configuration**: pon tu dirección de Netlify en **Site URL**.

Para uso personal puedes desactivar la confirmación por correo (**Authentication > Sign In / Providers > Email > Confirm email**) y así entrar apenas creas la cuenta. Los nombres de los menús pueden variar un poco.

## Paso 5. Instalarla en el celular

- **iPhone:** abre la dirección en **Safari**, toca el botón Compartir y luego **Agregar a pantalla de inicio**.
- **Android:** en Chrome, menú de tres puntos y **Instalar app**.

Crea tu cuenta con tu correo y una contraseña. En el iPhone, la app instalada y Safari no comparten sesión: la primera vez que la abras desde la pantalla de inicio tendrás que iniciar sesión otra vez. Tus datos son los mismos porque están en la nube.

## Si ya usabas el archivo único (cuadre.html)

Entra a **Más > Copia de seguridad**, copia el texto, y en la versión nueva ve a **Más > Exportar e importar** y pégalo en "Importar". Se suma a lo que ya tengas, sin borrar nada.

## Actualizar la app después

1. Cambia lo que quieras en los archivos.
2. Abre `service-worker.js` y sube el número de `VERSION` (por ejemplo, de `cuadre-v1` a `cuadre-v2`).
3. Vuelve a arrastrar la carpeta a Netlify (en el mismo sitio, con "Deploys").

## Cosas que debes saber

- **Sin internet:** la app abre y muestra tus últimos datos, pero no deja registrar cambios hasta que vuelva la conexión.
- **Tasa del dólar:** viene de dolarapi.com (no hay API oficial del BCV). Si el navegador no logra traerla, escríbela a mano en **Más > Tasa del dólar**.
- **Contraseña olvidada:** esta versión todavía no tiene "olvidé mi contraseña". Va en la siguiente.
- **Familia o pareja:** la base ya separa los datos por usuario. Compartir cuentas entre personas se agrega en una versión posterior.
