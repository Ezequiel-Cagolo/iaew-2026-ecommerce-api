# Clase 06 — Documentación de contratos HTTP y eventos

Fecha: 17/10/2026. Proyecto: iaew-2026-ecommerce-api. Rama de trabajo: clase-06.

## 1. Objetivo y alcance

Se documentó la confirmación idempotente implementada en Clase 05, sin ampliar la lógica de negocio. Se publicó OpenAPI 3.1 mediante Swagger UI, se validó el contrato del evento con JSON Schema y se representó el flujo productor → evento → consumidor en EventCatalog.

Las evidencias de este informe son las capturas adjuntas en `clase-06/`. Los comandos de la API se ejecutan desde la raíz del proyecto; los de EventCatalog, desde `eventcatalog-clase-06/`.

| Resultado obligatorio | Archivo o ubicación | Comprobación |
| --- | --- | --- |
| OpenAPI 3.1 | [docs/openapi.json](../docs/openapi.json) | Redocly informa contrato válido |
| Swagger UI | http://localhost:3000/api-docs/ | Operación de confirmación visible |
| JSON Schema | [pedido-confirmado.schema.json](../docs/eventos/pedido-confirmado.schema.json) | AJV valida el ejemplo real |
| EventCatalog | http://localhost:3001/ | Build completo y flujo conectado |
| Pruebas y sintaxis | API raíz | 4 pruebas aprobadas; check sin errores |

## 2. Preparación y pruebas de base

Se continuó con la solución propia de Clase 05. Se utilizó Node.js 22.23.2, compatible con el requisito de EventCatalog (22.19.0 o posterior).

Se configuraron los scripts `test` y `check`. Las cuatro pruebas cubren obligatoriedad y formato de Idempotency-Key, límites de configuración y formato de respuestas de error. Son pruebas unitarias; no equivalen a pruebas de integración del worker con MongoDB y RabbitMQ.

![Pruebas de base y comprobación de sintaxis](clase-06/captura-test-pass.png)

## 3. Contrato HTTP y validación OpenAPI

El contrato usa OpenAPI 3.1.0 y documenta:

- `POST /pedidos/{id}/confirmar`.
- Parámetro de ruta `id` y header obligatorio `Idempotency-Key`.
- OAuth 2.0, flujo `client_credentials`, audience `https://iaew-pedidos-api` y scope `confirm:pedidos`.
- Respuestas 200, 400, 401, 403, 404, 409 y 503; además, 500 porque existe en la implementación.
- Header de respuesta `Idempotency-Replayed`.
- Ejemplos de primera confirmación, replay y errores.
- La limitación del replay: no vuelve a publicar un evento cuya publicación falló.

Comando ejecutado:

```bash
npx --yes @redocly/cli lint docs/openapi.json --extends minimal
```

Resultado observado:

```text
docs\openapi.json: validated in 78ms
Woohoo! Your API description is valid.
You have 1 warning.
```

La advertencia corresponde a `no-server-example.com`, porque el servidor es `http://localhost:3000`. Se conserva esa URL por tratarse del entorno local de la actividad.

![OpenAPI validado con una advertencia por localhost](clase-06/open-api-validado.png)

## 4. Publicación en Swagger UI

Se incorporó `swagger-ui-express` a la API. Swagger UI carga el contrato desde la ruta JSON, evitando mantener una segunda copia:

- Interfaz: [http://localhost:3000/api-docs/](http://localhost:3000/api-docs/).
- Contrato: [http://localhost:3000/api-docs/openapi.json](http://localhost:3000/api-docs/openapi.json).

La captura muestra el título IAEW Pedidos API, la versión OpenAPI 3.1, la operación POST y los parámetros obligatorios. No se necesita ejecutar una confirmación desde Swagger para demostrar la publicación del contrato.

![Swagger UI con la operación de confirmación desplegada](clase-06/swagger-ui-ok.png)

## 5. Contrato del evento y validación con AJV

Esquema: [docs/eventos/pedido-confirmado.schema.json](../docs/eventos/pedido-confirmado.schema.json).

Se utilizó JSON Schema draft 2020-12. El evento exige `eventId`, `type`, `version`, `occurredAt` y `data.pedidoId`. Se restringen el tipo a `pedido.confirmado`, la versión a 1, el identificador de evento al formato UUID y la fecha al formato date-time. No se permiten propiedades adicionales.

Ejemplo real conservado de Clase 05: [pedido-confirmado.ejemplo.json](pedido-confirmado.ejemplo.json).

```json
{
  "eventId": "b3cf9e44-c2b7-4432-8857-a47e021231fd",
  "type": "pedido.confirmado",
  "version": 1,
  "occurredAt": "2026-10-16T22:02:11.179Z",
  "data": {
    "pedidoId": "6ad29ca680f4e1c43108865e"
  }
}
```

Comando ejecutado desde la raíz:

```bash
npx --yes -p ajv-cli@5 -p ajv-formats ajv validate \
  --spec=draft2020 -c ajv-formats \
  -s docs/eventos/pedido-confirmado.schema.json \
  -d evidencias/pedido-confirmado.ejemplo.json
```

Resultado observado:

```text
evidencias/pedido-confirmado.ejemplo.json valid
```

La prueba comprueba el ejemplo contra el esquema, no solamente su sintaxis JSON.

![Validación del ejemplo del evento con AJV](clase-06/pedido-confirmado.ejemplo.json.png)

## 6. EventCatalog: productor, evento y consumidor

Se utilizó la base pública de la [rama clase-06-inicio del docente](https://github.com/utn-frc-iaew/iaew-2026-ecommerce-api/tree/clase-06-inicio/recursos/eventcatalog-base), sin modificar el repositorio de origen. La copia de trabajo incluida en esta entrega es `eventcatalog-clase-06/`.

Archivos que representan el flujo:

1. [services/PedidosAPI/index.mdx](../eventcatalog-clase-06/services/PedidosAPI/index.mdx): publica PedidoConfirmado mediante `sends`.
2. [events/PedidoConfirmado/index.mdx](../eventcatalog-clase-06/events/PedidoConfirmado/index.mdx): identifica el evento y vincula `schema.json`.
3. [events/PedidoConfirmado/schema.json](../eventcatalog-clase-06/events/PedidoConfirmado/schema.json): copia del esquema validado en A3.
4. [services/WorkerNotificaciones/index.mdx](../eventcatalog-clase-06/services/WorkerNotificaciones/index.mdx): consume PedidoConfirmado mediante `receives`.

Los tres recursos utilizan la versión `1.0.0` en el catálogo. Esta versión documental corresponde al valor numérico `version: 1` del mensaje.

### Compilación

Comando ejecutado desde `eventcatalog-clase-06/`:

```bash
npm run build
```

Resumen observado en la captura final, posterior a incorporar los recursos:

```text
[eventcatalog:link-validation] Checked links in 44 HTML page(s) in 0.48s.
[build] 44 page(s) built in 1m 26s
[build] Complete!
```

El build terminó correctamente. Informó advertencias por enlaces de navegación o documentación de la herramienta, como `/docs/sdk`, `/integrations/backstage` y `/pricing`; no se presenta como una compilación libre de advertencias.

![Compilación final de EventCatalog con 44 páginas](clase-06/event-catalog-build.png)

### Navegación del flujo

Se configuró el puerto 3001 para separar el catálogo de la API, que utiliza el 3000.

```bash
npm run dev
```

URL del diagrama: [http://localhost:3001/visualiser/services/PedidosAPI/1.0.0](http://localhost:3001/visualiser/services/PedidosAPI/1.0.0).

La interfaz muestra:

```text
API de Pedidos (1.0.0)
    → publica → Pedido confirmado (1.0.0)
    → consumido por → Worker de notificaciones (1.0.0)
```

![Flujo completo de productor, evento y consumidor](clase-06/event-catalog-flujo.png)

## 7. Revisión asistida por IA: contradicción y corrección

**Contradicción detectada:** el contrato de referencia exigía `error`, `code`, `retryable` y `action` en todas las respuestas de error. Sin embargo, en esta implementación los handlers de 401 y 403 en `app.js`, y algunas respuestas de `routes/pedidos.js`, como 404, solamente devuelven `error`.

**Comprobación:** se revisaron las rutas, el middleware de autenticación y el helper `sendError`. Los errores de idempotencia y publicación usan el helper y sí incluyen los campos adicionales.

**Corrección aceptada:** el esquema común Error exige únicamente `error` y conserva las demás propiedades como opcionales, con una descripción de los casos que las incluyen. También se documentó el 500 existente y se aclaró que un 503 puede ocurrir después de persistir la confirmación; un replay no repara la publicación.

Se corrigió el contrato para describir el código real, sin cambiar el comportamiento del endpoint ni prometer garantías de entrega no demostradas.

## 8. Validaciones finales

Comandos ejecutados desde la raíz de la API:

```bash
npm test
npm run check
```

Salida de `npm test` transcrita de la captura final:

```text
> iaew-2026-ecommerce-api@1.0.0 test
> node --test test/*.test.js

✔ Idempotency-Key es obligatoria (0.8477ms)
✔ Idempotency-Key respeta longitud y caracteres permitidos (0.2664ms)
✔ La configuración usa el valor por defecto y valida sus límites (0.7595ms)
✔ Los errores incluyen estado, código y orientación para el cliente (0.7782ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 109.4733
```

Salida de `npm run check` (sin errores de sintaxis):

```text
> iaew-2026-ecommerce-api@1.0.0 check
> node --check app.js && node --check worker.js && node --check routes/pedidos.js && node --check lib/rabbit.js && node --check lib/config.js && node --check lib/idempotency.js && node --check lib/errors.js && node --check models/Pedido.js && node --check models/EventoProcesado.js
```

![Pruebas y comprobación de sintaxis finales](clase-06/validaciones-finales.png)

Ambos comandos se volvieron a ejecutar al preparar esta entrega: cuatro pruebas aprobadas y comprobación de sintaxis correcta. Los tiempos varían entre ejecuciones.

## 9. Contenido y reproducción de la entrega

El ZIP incluye el código de la API, las pruebas, OpenAPI, JSON Schema, el ejemplo, este informe y sus siete capturas, además del proyecto EventCatalog con su configuración, recursos fuente, package.json y package-lock.json.

No incluye `.env`, tokens, claves privadas, directorios `node_modules`, `.git`, compilaciones `dist`, cachés `.astro` ni ZIP anteriores. Las credenciales de RabbitMQ en la configuración de ejemplo son las públicas del laboratorio local; Auth0 y la API key requieren configuración local.

Preparación de la API, desde la raíz:

```bash
npm ci
cp .env.example .env
# Completar la configuración local de Auth0 y la API key.
# Iniciar MongoDB antes de arrancar la API.
npm test
npm run check
npm run dev
```

Preparación del catálogo, en otra terminal:

```bash
cd eventcatalog-clase-06
npm ci
npm run build
npm run dev
```

Las capturas se enlazan mediante rutas relativas y deben conservarse dentro de `evidencias/clase-06/` junto al informe. No se requiere instalar Backstage para reproducir esta entrega.

