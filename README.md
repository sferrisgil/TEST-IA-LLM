# Taller de Apps IA municipal

Plataforma para que el **personal no técnico del Ayuntamiento** cree pequeñas aplicaciones (personales o para su equipo) describiéndolas en lenguaje natural ("vibe coding"), **sin comprometer la privacidad ni la seguridad** y sin saltarse las políticas municipales. Las apps se **publican en un servidor web interno**, accesible para la plantilla y, cuando la app lo permite, para las contratas a través de la VPN.

La idea central: **la IA construye, pero las reglas las pone el Ayuntamiento.** El nivel de riesgo lo calcula un motor de reglas determinista y auditable (no la IA), y esas reglas se convierten en restricciones técnicas que el navegador hace cumplir.

## Cómo funciona (para la persona usuaria)

| Paso | Qué ocurre |
|---|---|
| 1. Tu idea | Describe la app con tus palabras. La IA propone nombre, finalidad y preguntas para concretar la funcionalidad. Se identifica a la persona responsable. |
| 2. Los datos | Marca qué tipo de información usará (con ejemplos en lenguaje llano). Puedes **pegar un ejemplo de los datos**: se analiza **solo en el navegador** (DNI/NIE con letra de control, IBAN, tarjetas, NSS, teléfonos, correos, direcciones, matrículas, credenciales y palabras que indican salud, menores, servicios sociales, datos penales…). Lo detectado cuenta en la evaluación aunque no se marque. |
| 3. El uso | Quién la usará (solo yo, equipo, departamento, plantilla, empresas externas, ciudadanía), dónde se guardan los datos, si usa IA, si interviene en decisiones sobre personas, integraciones y conservación. |
| 4. Evaluación | Semáforo de riesgo con los motivos, las medidas que aplica la herramienta, las obligaciones del responsable y los compromisos de uso que hay que aceptar. |
| 5. Construir | Conversación con la IA para crear y ajustar la app, con vista previa aislada, revisión de seguridad automática, deshacer y descarga. |
| 6. Ficha y publicación | Publicación en la intranet (directa si el riesgo es bajo; si no, tras revisión de TI/DPD) y ficha de la aplicación (Markdown/JSON) para el inventario y el Registro de Actividades de Tratamiento. |

Además de **Crear app**, la plataforma tiene:

- **Catálogo**: apps a las que tiene acceso cada persona. Las contratas (por VPN) solo ven esta sección y solo las apps abiertas a contratas.
- **Mis apps**: estado de las publicaciones, nueva versión, renovación anual y retirada.
- **Revisión** (TI y DPD): aprobar o rechazar publicaciones, probar las apps e inventario completo.

Detalles de arquitectura, control de acceso, ciclo de publicación, configuración del proxy/SSO y propuesta de **fase 2 (acceso público)**: [docs/despliegue.md](docs/despliegue.md).

## Niveles de riesgo

| Nivel | Ejemplos | Qué permite |
|---|---|---|
| **Bajo** | Calculadora de plazos, guía con información pública, uso personal sin datos personales | Construir y usar |
| **Medio** | Datos de contacto o identificativos para el equipo; app para la ciudadanía sin datos personales; IA con datos enmascarados | Construir; comunicar al DPD y a TI antes de compartir |
| **Alto** | Salud, menores, colectivos vulnerables, datos penales, decisiones automáticas, gran escala, escritura en otros sistemas, datos personales hacia fuera | **Solo prototipo con datos ficticios** (franja visible, sin almacenamiento). Datos reales requieren EIPD y aprobación de TI/DPD |
| **No permitido** | Contraseñas en la app, perfilado o "puntuación" de personas, datos personales en nubes externas, datos especialmente protegidos expuestos fuera o enviados a la IA | No se construye (bloqueado también en el servidor). Se genera la ficha para tramitarlo con TI/DPD |

Las reglas están en [`shared/policy.ts`](shared/policy.ts) y se basan en el RGPD (arts. 5, 9, 10, 22, 30, 35), la LOPDGDD, el Esquema Nacional de Seguridad y el Reglamento europeo de IA. **Deben revisarlas y ajustarlas TI y el Delegado de Protección de Datos** del Ayuntamiento.

## Medidas de seguridad

**Protección de los datos frente a la IA**
- Los ejemplos de datos se analizan en el navegador y nunca se envían.
- Todo texto que va al proveedor de IA (descripción, peticiones, preguntas de las apps) se **enmascara** antes (`[DNI]`, `[EMAIL]`, `[IBAN]`…), en el navegador y otra vez en el servidor.
- Los datos especialmente protegidos no pueden enviarse a la IA (regla de bloqueo).
- El registro de auditoría guarda metadatos (app, departamento, nivel, nº de datos enmascarados), nunca contenido.

**Contención de las apps generadas**
- Instrucciones obligatorias al modelo derivadas de la evaluación (sin red, sin librerías externas, tipo de almacenamiento permitido, aviso de privacidad, botón de borrado, modo prototipo, accesibilidad…). El modelo no puede relajarlas aunque el usuario lo pida.
- **Revisión automática del código** ([`shared/codeScan.ts`](shared/codeScan.ts)): bloquea red (`fetch`, XHR, WebSocket…), scripts externos, `eval`, cookies, acceso a la plataforma, cámara/ubicación, almacenamiento no autorizado y datos reales incrustados. Si hay problemas graves, se pide una corrección automática; si persisten, la versión no se entrega.
- **CSP inyectada en cada app** (`connect-src 'none'`, etc.): aunque algo escapara al escáner, el navegador impide que la app envíe datos fuera. Se aplica también al fichero descargado.
- **Vista previa aislada**: se sirve desde el servidor con su propia CSP y `sandbox` (origen opaco), así que no puede leer la sesión ni los datos de la plataforma.
- Las apps que necesitan IA solo pueden usar `window.IAMunicipal.preguntar()`, un puente que pasa por la plataforma (que comprueba la autorización y enmascara).

**Plataforma y publicación**
- El servidor **recalcula siempre la evaluación** y **vuelve a revisar el código** al publicar; no confía en el navegador.
- Identidad por **SSO corporativo** (cabeceras del proxy, aceptadas solo desde el proxy) y acceso limitado a la **red interna y la VPN**.
- Control de acceso por app (personal, equipo, departamento, plantilla, contratas), revisión por TI/DPD para riesgo medio/alto, nadie aprueba sus propias apps, y revisión anual obligatoria.
- Las apps publicadas se ejecutan **aisladas** en un visor: no pueden llamar a la API ni leer la sesión; sus datos quedan en el navegador de cada persona, separados por app.
- Cabeceras de seguridad (CSP estricta en producción, `X-Frame-Options`, `nosniff`, `Referrer-Policy`), límite de tamaño de peticiones y de frecuencia.

## Puesta en marcha

Requisitos: Node.js 20+.

```bash
npm install
cp .env.example .env.local   # y rellena GEMINI_API_KEY
npm run dev                  # http://localhost:3000
```

Sin `GEMINI_API_KEY` la plataforma arranca en **modo demostración**: todo el flujo funciona (cuestionario, evaluación, revisión, vista previa, publicación) con una app de ejemplo en lugar de la generada por la IA.

En desarrollo no hay SSO: en la cabecera se puede cambiar de **perfil de prueba** (empleada, compañero del mismo departamento, otro departamento, revisor TI/DPD, contrata) para ensayar permisos y el ciclo de revisión. En producción (`NODE_ENV=production`) los perfiles de prueba se desactivan y la identidad viene del proxy.

| Variable | Uso |
|---|---|
| `GEMINI_API_KEY` | Clave del proveedor de IA |
| `GEMINI_MODEL` | Modelo para construir apps (por defecto `gemini-3.1-pro-preview`) |
| `GEMINI_FAST_MODEL` | Modelo para preguntas y para el asistente de las apps (por defecto, el mismo) |
| `DPD_EMAIL` | Correo del Delegado de Protección de Datos (botón "Escribir al DPD") |
| `PORT` | Puerto (por defecto 3000) |
| `DATA_DIR` | Carpeta de las apps publicadas (por defecto `data/`) |
| `AUTH_MODE` | `proxy` (por defecto en producción) o `desarrollo` |
| `AUTH_HEADER_USER`, `AUTH_HEADER_NAME`, `AUTH_HEADER_GROUPS`, `AUTH_HEADER_DEPARTMENT` | Cabeceras del SSO (por defecto `x-remote-user`, `x-remote-name`, `x-remote-groups`, `x-remote-department`) |
| `TRUSTED_PROXIES` | Direcciones del proxy autorizado a enviar esas cabeceras (por defecto localhost) |
| `INTERNAL_NETWORKS` | Redes desde las que se atiende (red municipal + VPN). En producción, por defecto, redes privadas |
| `GROUP_STAFF`, `GROUP_CONTRACTOR`, `GROUP_REVIEWER` | Grupos de plantilla, contratas y revisores (por defecto `plantilla`, `contratas`, `revisores-apps`) |

Otros comandos: `npm test` (pruebas de reglas, detector y escáner), `npm run lint` (tipos), `npm run build` y `npm start` (producción).

## Estructura

```
shared/policy.ts    Cuestionario, reglas de riesgo, restricciones y compromisos
shared/pii.ts       Detector y enmascarado de datos personales (sin red)
shared/codeScan.ts  Revisión del código generado, CSP, puentes de IA y de datos
shared/publishing.ts Reglas de publicación y control de acceso
server.ts           API: evaluar, aclarar, construir, vista previa, IA para apps
server/portal.ts    Publicación, revisión, catálogo y visor de apps publicadas
server/identity.ts  Identidad (SSO por proxy / perfiles de prueba)
server/network.ts   Filtro de red interna y VPN
server/store.ts     Almacén de publicaciones en disco
server/demo.ts      Respuestas del modo demostración
src/App.tsx         Navegación: crear, catálogo, mis apps, revisión
src/views/          Asistente y vistas del portal
src/steps/          Pantallas de cada paso del asistente
lib/ficha.ts        Generación de la ficha de la aplicación
tests/              Pruebas automáticas
```

## Antes de usarlo en producción

Esta versión es una base funcional. Para desplegarla en el Ayuntamiento conviene:

1. **Validar las reglas** de `shared/policy.ts` con TI y el DPD, y adaptar textos a las políticas internas.
2. **Proveedor de IA**: firmar el contrato de encargo de tratamiento, garantizar tratamiento en la UE y que los datos no se usan para entrenar; o sustituir el cliente por un modelo alojado por el Ayuntamiento (el código está aislado en `server.ts`).
3. Configurar el **proxy con SSO** y las redes (ver [docs/despliegue.md](docs/despliegue.md)) y crear los grupos de plantilla, contratas y revisores en el directorio.
4. Avisar por correo a los revisores de las publicaciones pendientes y a los responsables de las revisiones anuales próximas (hoy se consultan en la plataforma).
5. Si el volumen crece, sustituir el almacén en disco por una base de datos (la interfaz está aislada en `server/store.ts`).
6. Llevar el registro de auditoría al sistema de logs corporativo y sustituir el límite de peticiones en memoria por el del proxy.
7. Recordar que el detector de datos es una ayuda, no una garantía: no detecta nombres propios sueltos, por eso el cuestionario sigue siendo obligatorio.
