# Escalabilidad y dimensionamiento del hardware

Este documento estima el hardware necesario para el Taller de Apps IA en cuatro escenarios: **1 persona, 10, 50 y todo el Ayuntamiento (7.000 personas)**. Se basa en **mediciones reales** de la plataforma (no en suposiciones genéricas), más un modelo de uso que conviene validar con un piloto.

## 1. Qué consume recursos

| Componente | Recurso principal | Dónde se ejecuta |
|---|---|---|
| Plataforma (asistente, catálogo, visor, API) | CPU y memoria del servidor de aplicaciones | Servidor interno (Node.js) |
| Datos de las apps y de la plataforma | Disco SSD y CPU (SQLite) | Mismo servidor |
| Automatizaciones programadas | CPU poca; sobre todo esperan a la IA | Mismo servidor (un único proceso programa) |
| IA para **construir** apps | Tokens del modelo en la nube (texto ya enmascarado) | Proveedor externo |
| IA **dentro** de las apps y automatizaciones | Tokens en la nube o GPU propia (modelo local) | Nube o servidor GPU municipal |
| Inicio de sesión (SSO), TLS, VPN | Infraestructura existente | Proxy corporativo / VPN |

Conclusión adelantada: **el servidor de aplicaciones no es el cuello de botella**, ni siquiera para 7.000 personas. Lo que más pesa a gran escala es la **alta disponibilidad**, las **copias de seguridad** y, sobre todo, la **capacidad de IA** (coste en la nube o GPUs si se quiere un modelo local).

## 2. Mediciones

**Entorno de medición:** máquina virtual de 4 vCPU y 16 GB de RAM, Node.js 22, compilación de producción, SQLite en disco local.
**Datos de prueba:** 3.001 apps publicadas y una app con unos 29.000 registros (con índices de búsqueda de texto y de campos).
**Herramienta:** `scripts/carga/` (autocannon), 50 conexiones simultáneas, 10 s por prueba.

| Operación | 1 proceso (≈1 vCPU) | 4 procesos (4 vCPU) | p99 con 4 procesos |
|---|---|---|---|
| Abrir una app publicada | ~3.000 pet/s | ~9.500 pet/s | 18 ms |
| Catálogo con búsqueda (3.001 apps) | ~220 pet/s | ~890 pet/s | 117 ms |
| Base de datos: listar 50 registros | ~410 pet/s | ~1.230 pet/s | 85 ms |
| Base de datos: búsqueda de texto amplia* | ~85 pet/s | ~280 pet/s | 458 ms |
| Base de datos: filtro por campo | ~150 pet/s | ~520 pet/s | 225 ms |
| Base de datos: guardar (escritura) | ~340 pet/s | ~690 pet/s | 172 ms |

\* Caso desfavorable a propósito: una búsqueda que coincide con casi todos los registros. Las búsquedas normales, más selectivas, son bastante más rápidas.

**Memoria:** ~220 MB por proceso. **Disco:** ~1,2 KB por registro pequeño, índices incluidos; con registros de ~1 KB de contenido, unos 3 KB.

Mejoras hechas a raíz de estas mediciones: índice de texto completo (FTS5, trigramas) e índice de campos, que multiplican por 4 los filtros; modo multiproceso (`WORKERS`); datos de la plataforma en la base de datos en lugar de ficheros JSON; catálogo paginado en el servidor; y límite de peticiones **por usuario** (antes era por IP, y detrás del proxy toda la organización habría compartido un único límite).

## 3. Modelo de uso

Para pasar de mediciones a personas:

- Una persona **trabajando activamente** con una app hace de media **una petición cada 15 segundos**.
- Mezcla típica: 30 % listados, 25 % guardados, 10 % búsquedas, 10 % filtros, 10 % abrir app o catálogo y 15 % peticiones ligeras. Coste medio medido: **~3,7 ms de CPU por petición**.
- Trabajando al 50 % de CPU para tener margen, **un núcleo atiende ~135 pet/s**, es decir **unas 2.000 personas activas a la vez**.
- **Simultaneidad prevista:** en el escenario de 7.000 personas, hasta un 10 % (700) activas a la vez en las horas punta. Supone **~50 pet/s, menos de medio núcleo**.

| Escenario | Activas a la vez (pico) | Peticiones/s | CPU necesaria (al 50 %) |
|---|---|---|---|
| 1 persona | 1 | < 1 | despreciable |
| 10 personas | 5 | < 1 | despreciable |
| 50 personas | 20 | ~1,5 | < 0,1 núcleos |
| 7.000 personas | ~700 | ~50 | ~0,4 núcleos |

Hay margen de sobra: el hardware de cada escenario se dimensiona por **disponibilidad, aislamiento y crecimiento**, no por potencia.

## 4. Inteligencia artificial

### 4.1 Construir apps (modelo en la nube)

Cada iteración del asistente («añade un campo», «cambia los colores»…) envía la petición, las reglas y el código actual, y recibe la app completa: **10.000–25.000 tokens** por iteración.

| Escenario | Personas creando apps | Iteraciones/día | Tokens/día (aprox.) |
|---|---|---|---|
| 1 persona | 1 | 20 | ~0,4 M |
| 10 personas | 5 | 100 | ~2 M |
| 50 personas | 15 | 300 | ~6 M |
| 7.000 personas | ~60 al día (≈3 % crea apps alguna vez) | 1.200 | ~25 M (~500 M/mes) |

Recomendación: mantener la **construcción en un modelo avanzado en la nube**. Solo recibe descripciones enmascaradas y código, nunca datos de las apps; los modelos locales generan peor código.

### 4.2 IA dentro de las apps y automatizaciones

Consulta típica: ~1.500 tokens de entrada y ~400 de salida.

| Escenario | Consultas/día (apps + automatizaciones) | Tokens/día | Pico (consultas/s) |
|---|---|---|---|
| 1 persona | ~20 | ~40 k | — |
| 10 personas | ~200 | ~0,4 M | < 0,1 |
| 50 personas | ~1.000 | ~2 M | < 0,1 |
| 7.000 personas | ~30.000 (14.000 de personas + 15.000 de ~300 automatizaciones) | ~60 M | ~1,2 |

### 4.3 Modelo local (para datos personales sin salir del Ayuntamiento)

Cifras **orientativas**: dependen del modelo, la cuantización y el servidor de inferencia (vLLM, Ollama…). Hay que validarlas con un piloto.

| Uso | Modelo orientativo | GPU por servidor | Para 7.000 personas |
|---|---|---|---|
| Tareas básicas (clasificar, extraer, lenguaje claro) | 8–14 mil millones de parámetros | 1 GPU de 48 GB (o 24 GB cuantizado) | 2 servidores (redundancia); cada uno da 1.000–2.500 tokens/s con lotes, y el pico previsto es ~500 tokens/s |
| Tareas intermedias o avanzadas | 70 mil millones de parámetros | 2 GPU de 80 GB (o 4 de 48 GB) | 2 servidores; 300–800 tokens/s cada uno |

Para 1, 10 o 50 personas **no compensa** una GPU propia: basta un modelo en la nube con contrato de encargo y proceso en la UE, o un modelo pequeño en un equipo con GPU de 24 GB si se quiere probar.

## 5. Hardware recomendado por escenario

### Escenario 1 — Una persona (prototipo o piloto)
- **1 máquina virtual (o un PC):** 2 vCPU, 4 GB de RAM, 20 GB de SSD.
- `WORKERS=1`. Sin proxy de SSO: modo desarrollo con perfiles de prueba, o un proxy sencillo.
- IA en la nube.

### Escenario 2 — 10 personas (un equipo)
- **1 VM:** 2 vCPU, 4 GB de RAM, 40 GB de SSD.
- `WORKERS=1`. Detrás del proxy corporativo con SSO (`AUTH_MODE=proxy`).
- Copia de seguridad diaria de `DATA_DIR`. Correo SMTP para los avisos.

### Escenario 3 — 50 personas (un departamento)
- **1 VM:** 4 vCPU, 8 GB de RAM, 100 GB de SSD.
- `WORKERS=2` y `SCHEDULER_CONCURRENCY=4`.
- Proxy con SSO y TLS (el corporativo o uno dedicado de 2 vCPU y 2 GB).
- Copias diarias y monitorización básica (disponibilidad, disco, errores).

### Escenario 4 — 7.000 personas (todo el Ayuntamiento + contratas por VPN)

| Pieza | Cantidad | Especificación | Función |
|---|---|---|---|
| Servidor de aplicaciones | 2 VM (activa + reserva) | 8 vCPU, 16 GB RAM, 250 GB SSD | `WORKERS=4–6`, `SCHEDULER_CONCURRENCY=10–20`. La reserva arranca si cae la activa |
| Replicación de datos | — | Litestream (u otra replicación continua de SQLite) hacia NAS u objeto S3 compatible | Pérdida máxima de segundos; recuperación en minutos |
| Proxy / SSO / TLS | 2 VM tras balanceador | 2 vCPU, 4 GB RAM | nginx + oauth2-proxy/Keycloak, o el corporativo |
| Copias de seguridad | — | ~500 GB en el sistema de copias | Diarias, con retención según la política municipal |
| Monitorización y registros | Existente | — | Métricas, alertas y registro de auditoría al SIEM |
| IA local (opcional) | 2 servidores GPU | Ver apartado 4.3 | Solo si se quieren tratar datos personales con IA sin salir del Ayuntamiento |

**Disco:** con ~1.500 apps de media 5.000 registros, unos 7,5 M de registros, la base de datos ocupa ~20–25 GB. A eso se suman las versiones de las apps (~1 GB) y el margen de crecimiento. 250 GB dan holgura para varios años.

**Automatizaciones:** se ejecutan en un solo proceso, pero sobre todo esperan a la IA. Con 300 automatizaciones diarias, conviene repartir las horas de ejecución en lugar de concentrarlas todas a las 8:00, y subir `SCHEDULER_CONCURRENCY`.

## 6. Límites de la arquitectura actual y cuándo cambiarla

La versión actual (un servidor, SQLite, varios procesos) cubre los cuatro escenarios con margen. Habrá que pasar a **PostgreSQL con varias instancias activas** si:

- se exige **alta disponibilidad sin interrupción**, porque con SQLite la reserva tarda minutos en tomar el relevo;
- se superan de forma sostenida **~500 escrituras por segundo** (el pico previsto para 7.000 personas es ~12/s);
- la base de datos supera **~200 GB**, o se necesitan más de **~8 núcleos** en una sola máquina.

El cambio está acotado: las consultas están aisladas en `server/db.ts` (datos de las apps, historial y documentos de la plataforma). En ese caso, además:
- el límite de peticiones pasaría al balanceador, porque ahora cada proceso lleva el suyo en memoria;
- solo una instancia tendría el programador activo (`SCHEDULER_ENABLED=false` en el resto).

## 7. Plan de despliegue por fases

1. **Piloto (1–10 personas):** escenario 1–2, IA en la nube. Medir el uso real: peticiones por persona, consultas de IA y tokens por iteración.
2. **Departamento (50):** escenario 3, con SSO, correo y copias. Revisar las cifras de este documento con los datos del piloto.
3. **Extensión (cientos):** el mismo servidor con más procesos; activar la replicación.
4. **Toda la organización (7.000):** escenario 4. Decidir si hace falta IA local según los casos de uso con datos personales.

## 8. Cómo repetir las mediciones en el hardware municipal

```bash
npm run build
NODE_ENV=production AUTH_MODE=proxy WORKERS=4 RATE_LIMIT_FACTOR=100000 DATA_DIR=/tmp/carga node dist/server.cjs &
npm run carga:preparar -- http://localhost:3000 20000     # devuelve el id de la app
npm run carga:medir -- http://localhost:3000 <id-app> 50 10
```

Con `RATE_LIMIT_FACTOR` alto se evita que el límite de peticiones frene la prueba. No lo uses en producción.
