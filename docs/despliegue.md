# Despliegue en el servidor interno del Ayuntamiento

## Fase 1 (esta versión): publicación en la intranet

```
 Personal municipal ──(red interna)──┐
                                      ├──► Proxy inverso corporativo ──► Taller de Apps IA ──► Proveedor de IA
 Contratas ──(VPN, rango propio)─────┘      (TLS + SSO + grupos)          (Node.js, red interna)   (solo texto enmascarado)
```

- El **Taller** (crear apps), el **catálogo** y las **apps publicadas** se sirven desde el mismo servidor interno, por ejemplo `https://apps.intranet.ayto.local`.
- **La autenticación la hace el proxy corporativo** (Kerberos/Directorio Activo, SAML u OIDC mediante Keycloak, ADFS, Apache `mod_auth_mellon`, nginx + `oauth2-proxy`…). La aplicación solo lee las cabeceras que el proxy le pasa y **solo las acepta si la petición viene del proxy** (`TRUSTED_PROXIES`).
- **La red** se limita a la red municipal y al rango de direcciones de la VPN de las contratas (`INTERNAL_NETWORKS`).
- Las contratas acceden con usuarios de un grupo propio (`GROUP_CONTRACTOR`): **solo ven el catálogo** y únicamente las apps marcadas como «Plantilla y empresas contratistas» (y, si la app tiene lista de accesos, solo si figuran en ella). No pueden crear aplicaciones.

### Quién ve cada aplicación

| Usuarios previstos | Acceso |
|---|---|
| Solo yo | La persona responsable |
| Mi equipo | Responsable + usuarios indicados al publicar |
| Mi departamento | Personal con el mismo departamento (cabecera del SSO) + usuarios indicados |
| Toda la plantilla | Todo el personal |
| Plantilla y contratas | Todo el personal + contratas por VPN (todas o solo las indicadas) |
| Ciudadanía | En fase 1 se publica como «Toda la plantilla» tras revisión; queda marcada como «acceso externo solicitado» |

### Ciclo de publicación

1. La persona responsable publica desde el último paso del asistente. El servidor **vuelve a evaluar el riesgo y a revisar el código**; si hay problemas graves, no se publica.
2. **Riesgo bajo** y uso interno: se publica al momento. **Riesgo medio o alto**, apps para contratas o para la ciudadanía: quedan **pendientes de revisión**.
3. El grupo revisor (`GROUP_REVIEWER`, TI y DPD) ve la ficha, prueba la app y aprueba o rechaza con comentario. Nadie puede aprobar sus propias apps. Para riesgo alto debe confirmar que se usará con datos ficticios o que existe una EIPD aprobada.
4. Cada nueva versión repite el proceso.
5. **Revisión anual**: a los 12 meses, la app deja de estar disponible para los usuarios hasta que su responsable confirme que sigue siendo necesaria («Sigue siendo necesaria» en «Mis apps»).
6. La persona responsable o los revisores pueden **retirar** una app en cualquier momento.

### Aislamiento de las apps publicadas

- Cada app se abre en un **visor** de la plataforma (cabecera con nombre, versión, nivel de riesgo y responsable) que la carga en un **iframe aislado** (`sandbox` sin `allow-same-origin` + CSP `connect-src 'none'`): la app no puede llamar a la API, leer la sesión del usuario, ni enviar datos a ningún sitio.
- Si la app guarda datos **en el navegador**, el visor los guarda en el navegador de cada persona, **separados por app y por usuario**; no llegan al servidor.
- Si la app usa la **base de datos municipal**, las peticiones pasan por el visor al servidor, que comprueba que la persona tiene acceso a la app y aplica el modo **compartido** o **por persona** de la evaluación guardada. Las apps pendientes de revisión usan un espacio de pruebas aparte, nunca los datos reales.
- Si la app usa IA, el visor hace de puente con el servidor, que comprueba la autorización con la **evaluación guardada** (no la del navegador) y enmascara los datos personales.

### Ejemplo de proxy (nginx + oauth2-proxy)

```nginx
server {
  listen 443 ssl;
  server_name apps.intranet.ayto.local;
  # ssl_certificate ... (certificado de la CA interna)

  # Solo red municipal y VPN de contratas
  allow 10.0.0.0/8;        # red municipal (ajustar)
  allow 10.200.0.0/16;     # pool VPN contratas (ajustar)
  deny all;

  location /oauth2/ { proxy_pass http://127.0.0.1:4180; }
  location / {
    auth_request /oauth2/auth;
    auth_request_set $user   $upstream_http_x_auth_request_user;
    auth_request_set $groups $upstream_http_x_auth_request_groups;
    auth_request_set $name   $upstream_http_x_auth_request_preferred_username;
    error_page 401 = /oauth2/sign_in;

    # Nunca dejar pasar cabeceras de identidad enviadas por el cliente
    proxy_set_header X-Remote-User       $user;
    proxy_set_header X-Remote-Groups     $groups;
    proxy_set_header X-Remote-Name       $name;
    proxy_set_header X-Remote-Department "";   # rellenar desde el directorio si está disponible
    proxy_pass http://127.0.0.1:3000;
  }
}
```

Y en el servidor de la aplicación:

```bash
NODE_ENV=production
AUTH_MODE=proxy
TRUSTED_PROXIES=127.0.0.1/32
INTERNAL_NETWORKS=127.0.0.1/32          # solo escucha al proxy local
GROUP_STAFF=plantilla
GROUP_CONTRACTOR=contratas
GROUP_REVIEWER=revisores-apps
DATA_DIR=/var/lib/taller-apps
DPD_EMAIL=dpd@ayuntamiento.es
GEMINI_API_KEY=...
```

```bash
npm ci && npm run build
NODE_ENV=production node dist/server.cjs   # como servicio systemd, usuario sin privilegios
```

### Base de datos

- Fichero SQLite `DATA_DIR/datos.sqlite` (modo WAL, permisos 0600). Para usarla con datos personales, **cifra el disco o volumen** donde esté `DATA_DIR`.
- Cada registro guarda la app, la colección, el usuario que lo creó y las fechas; el contenido va en JSON y no se puede consultar con SQL libre.
- **Conservación**: cada hora se borran los registros que superan el plazo de la app y los datos de prueba con más de un día.
- **Derechos de las personas** (acceso, supresión): la persona responsable y los revisores pueden exportar y borrar los datos de una app desde la plataforma. Las escrituras, exportaciones y borrados quedan en el registro de auditoría (sin contenido).
- Escala orientativa: miles de apps pequeñas y cientos de miles de registros. Si se necesita más, o acceso concurrente intensivo, se puede pasar a PostgreSQL cambiando solo `server/db.ts`.

Copias de seguridad: basta con `DATA_DIR` (`publicaciones.json`, `apps/*.html` y `datos.sqlite`). Para copiar la base de datos en caliente usa `sqlite3 datos.sqlite ".backup copia.sqlite"`. Los registros de auditoría salen por la salida estándar en JSON (enviar a journald/SIEM).

### Avisos de propuestas derivadas

- **Correo**: configurar `SMTP_HOST` (servidor de correo corporativo), `MAIL_FROM`, `TI_EMAIL` y `DPD_EMAIL`. Cada propuesta llega con la ficha en Markdown y en JSON adjuntas y un enlace a la bandeja de revisión. Se recomienda usar buzones de grupo.
- **Tickets**: con `DERIVATION_WEBHOOK_URL` la plataforma envía un `POST` JSON (`evento`, `solicitud` con motivos, destinatarios y estado, y `ficha`) en cada propuesta nueva, actualización o comentario, para crear o actualizar la incidencia en GLPI, Redmine, Jira, OTRS, etc. (directamente o mediante un pequeño adaptador). `DERIVATION_WEBHOOK_TOKEN` se envía como `Authorization: Bearer`.
- El resultado de cada aviso (enviado, error, sin configurar) queda registrado en la solicitud y se ve en la bandeja.
- En producción, si no hay SMTP, los avisos por correo constan como «SMTP no configurado» y las propuestas siguen llegando a la bandeja.

## Fase 2 (futura): acceso público a apps concretas

No está activada. La base ya existe: las apps pensadas para la ciudadanía quedan marcadas como «acceso externo solicitado» (`externalAccess`). Propuesta:

1. **Instancia pública separada, de solo lectura**, en la DMZ, que solo sirve las apps con acceso externo **aprobado** (exportadas desde la instancia interna). Sin Taller, sin catálogo interno, sin revisión y sin acceso a la red interna.
2. **Requisitos adicionales para aprobar**: sin datos personales o con cláusula informativa y base legal; declaración de accesibilidad (RD 1112/2018); visto bueno de Comunicación (imagen institucional); análisis de seguridad (ENS) y, si procede, EIPD.
3. **Protección perimetral**: WAF, límites de peticiones, certificados públicos, dominio/subdominio institucional (p. ej. `apps.ayuntamiento.es`).
4. **IA en apps públicas**: solo si se aprueba expresamente, con cuotas por app y sin datos personales.
5. Registro público de las apps publicadas y canal para comunicar incidencias.
