# Taller de Apps IA municipal

Plataforma para que el **personal no técnico del Ayuntamiento** cree pequeñas aplicaciones (personales o para su equipo) describiéndolas en lenguaje natural ("vibe coding"), **sin comprometer la privacidad ni la seguridad** y sin saltarse las políticas municipales.

La idea central: **la IA construye, pero las reglas las pone el Ayuntamiento.** El nivel de riesgo lo calcula un motor de reglas determinista y auditable (no la IA), y esas reglas se convierten en restricciones técnicas que el navegador hace cumplir.

## Cómo funciona (para la persona usuaria)

| Paso | Qué ocurre |
|---|---|
| 1. Tu idea | Describe la app con tus palabras. La IA propone nombre, finalidad y preguntas para concretar la funcionalidad. Se identifica a la persona responsable. |
| 2. Los datos | Marca qué tipo de información usará (con ejemplos en lenguaje llano). Puedes **pegar un ejemplo de los datos**: se analiza **solo en el navegador** (DNI/NIE con letra de control, IBAN, tarjetas, NSS, teléfonos, correos, direcciones, matrículas, credenciales y palabras que indican salud, menores, servicios sociales, datos penales…). Lo detectado cuenta en la evaluación aunque no se marque. |
| 3. El uso | Quién la usará (solo yo, equipo, departamento, plantilla, empresas externas, ciudadanía), dónde se guardan los datos, si usa IA, si interviene en decisiones sobre personas, integraciones y conservación. |
| 4. Evaluación | Semáforo de riesgo con los motivos, las medidas que aplica la herramienta, las obligaciones del responsable y los compromisos de uso que hay que aceptar. |
| 5. Construir | Conversación con la IA para crear y ajustar la app, con vista previa aislada, revisión de seguridad automática, deshacer y descarga. |
| 6. Ficha | Ficha de la aplicación (Markdown/JSON) para el inventario y el Registro de Actividades de Tratamiento; opción de escribir al DPD. |

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

**Plataforma**
- El servidor **recalcula siempre la evaluación** a partir de las respuestas saneadas; no confía en el navegador.
- Cabeceras de seguridad (CSP estricta en producción, `X-Frame-Options`, `nosniff`, `Referrer-Policy`), límite de tamaño de peticiones y de frecuencia.

## Puesta en marcha

Requisitos: Node.js 20+.

```bash
npm install
cp .env.example .env.local   # y rellena GEMINI_API_KEY
npm run dev                  # http://localhost:3000
```

Sin `GEMINI_API_KEY` la plataforma arranca en **modo demostración**: todo el flujo funciona (cuestionario, evaluación, revisión, vista previa) con una app de ejemplo en lugar de la generada por la IA.

| Variable | Uso |
|---|---|
| `GEMINI_API_KEY` | Clave del proveedor de IA |
| `GEMINI_MODEL` | Modelo para construir apps (por defecto `gemini-3.1-pro-preview`) |
| `GEMINI_FAST_MODEL` | Modelo para preguntas y para el asistente de las apps (por defecto, el mismo) |
| `DPD_EMAIL` | Correo del Delegado de Protección de Datos (botón "Escribir al DPD") |
| `PORT` | Puerto (por defecto 3000) |

Otros comandos: `npm test` (pruebas de reglas, detector y escáner), `npm run lint` (tipos), `npm run build` y `npm start` (producción).

## Estructura

```
shared/policy.ts    Cuestionario, reglas de riesgo, restricciones y compromisos
shared/pii.ts       Detector y enmascarado de datos personales (sin red)
shared/codeScan.ts  Revisión del código generado, CSP y puente de IA
server.ts           API: evaluar, aclarar, construir, vista previa, IA para apps
server/demo.ts      Respuestas del modo demostración
src/App.tsx         Asistente paso a paso
src/steps/          Pantallas de cada paso
lib/ficha.ts        Generación de la ficha de la aplicación
tests/              Pruebas automáticas
```

## Antes de usarlo en producción

Esta versión es una base funcional. Para desplegarla en el Ayuntamiento conviene:

1. **Validar las reglas** de `shared/policy.ts` con TI y el DPD, y adaptar textos a las políticas internas.
2. **Proveedor de IA**: firmar el contrato de encargo de tratamiento, garantizar tratamiento en la UE y que los datos no se usan para entrenar; o sustituir el cliente por un modelo alojado por el Ayuntamiento (el código está aislado en `server.ts`).
3. **Autenticación corporativa** (SSO/Directorio Activo) para identificar al responsable automáticamente, en lugar de un campo de texto.
4. **Guardar las fichas** en un inventario central (y enviar automáticamente al DPD las de riesgo medio/alto) en vez de solo descargarlas.
5. **Publicación** de las apps de equipo/departamento en un espacio interno gestionado por TI, con la misma CSP.
6. Llevar el registro de auditoría al sistema de logs corporativo y sustituir el límite de peticiones en memoria por el del proxy.
7. Recordar que el detector de datos es una ayuda, no una garantía: no detecta nombres propios sueltos, por eso el cuestionario sigue siendo obligatorio.
