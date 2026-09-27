# Clase 04 — pruebas HTTP y desacople

Datos usados en las pruebas: producto y cliente sintéticos. No incluir JWT, API key ni credenciales en este archivo.

## Preflight final

Ejecutado con Git Bash: `C:\Program Files\Git\bin\bash.exe preflight.sh services`.

```text
OK   git disponible
OK   node disponible
OK   npm disponible
OK   docker disponible
OK   Docker está iniciado
OK   .env existe
OK   MONGODB_URI está definida
OK   AUTH0_DOMAIN está definida
OK   AUTH0_AUDIENCE está definida
OK   INTERNAL_API_KEY está definida
OK   AUTH0_AUDIENCE coincide con el contrato de la clase
OK   AUTH0_DOMAIN tiene formato de tenant y no conserva el placeholder
OK   INTERNAL_API_KEY no conserva el placeholder
OK   iaew-mongo está ejecutándose
OK   compose.yaml es válido
OK   iaew-rabbitmq está ejecutándose
OK   RABBIT_URL está definida para el broker local

Preflight correcto para modo services.
```

`GET /health` respondió **200** con `{"status":"ok"}`. `GET /token-info` con un JWT válido respondió **200** e informó los scopes `read:pedidos write:pedidos confirm:pedidos`.

## Flujo principal (A5)

- Producto sintético creado por `POST /productos` (201): `6ab99b3029742ecbbcca575a`, stock inicial 10.
- `POST /pedidos` con `write:pedidos`: **201**, pedido `6ab9a0be29742ecbbcca575b`.
- `POST /pedidos/6ab9a0be29742ecbbcca575b/confirmar` con `confirm:pedidos` y worker detenido: **200**. La respuesta incluyó `pedido.estado=confirmado`, `pedido.notificacionEstado=pendiente` y el evento siguiente:

```json
{"eventId":"42effea1-6ad3-43a1-b24f-1cc28df575a7","type":"pedido.confirmado","version":1,"occurredAt":"2026-09-27T23:03:43.003Z","data":{"pedidoId":"6ab9a0be29742ecbbcca575b"}}
```

- `GET /pedidos` con `read:pedidos` y worker detenido: `estado=confirmado`, `notificacionEstado=pendiente`.
- Consulta a la API de administración local de RabbitMQ para `notificaciones.pedido-confirmado`: **1 Ready**, **0 consumidores**. Se verificó después de la confirmación 200 y antes de iniciar el worker.
- `waitForConfirms()` confirmó la publicación ante el broker; el procesamiento se comprobó recién con el estado persistido y el `ack` del worker.
- `npm run worker` registró `Notificación procesada` para `eventId=42effea1-6ad3-43a1-b24f-1cc28df575a7` y `pedidoId=6ab9a0be29742ecbbcca575b`.
- `GET /pedidos` después de iniciar el worker: `estado=confirmado`, `notificacionEstado=procesada`, `notificadoEn=2026-09-27T23:05:09.573Z`. RabbitMQ terminó con **0 Ready** y **0 Unacknowledged**.

## Regresiones posteriores

Cada caso se probó con el worker detenido y un pedido nuevo. Se comparó la cantidad de mensajes Ready antes y después de la solicitud rechazada.

| Caso | HTTP esperado | Ready antes/después | Resultado |
| --- | ---: | --- | --- |
| Sin JWT al confirmar (pedido `6ab9a0f129742ecbbcca575c`) | 401 | 1 → 1 | Verificado |
| JWT válido sin `confirm:pedidos` (pedido `6ab9a19929742ecbbcca5760`) | 403 | 0 → 0 | Verificado; `/token-info` informó `read:pedidos write:pedidos` |
| Confirmación repetida (pedido `6ab9a0fc29742ecbbcca575d`) | 409 | 2 → 2 | Verificado; primera confirmación 200 creó el segundo mensaje |
| Stock insuficiente (pedido `6ab9a11529742ecbbcca575f`) | 409 | 2 → 2 | Verificado |

## A6 — límite entre MongoDB y RabbitMQ

MongoDB puede guardar el pedido confirmado y el descuento de stock aunque falle la publicación en RabbitMQ.
La API responde 503 y la notificación puede quedar pendiente sin mensaje para el worker.
Reconfirmar a ciegas puede confundir el resultado y no repara la publicación faltante; primero hay que consultar el pedido.
Una evolución sería el patrón **outbox**, que guarda el evento junto al cambio de negocio para publicarlo después.

## A7 — elección de integración

Para avisar al servicio de notificaciones cuando se confirma un pedido, elijo mensajería con RabbitMQ. La API inicia la publicación y el worker recibe el evento; la respuesta HTTP al cliente no necesita esperar el procesamiento de la notificación. Si el worker está detenido, el mensaje persistente permanece en la cola durable hasta que vuelva a consumirlo (mientras el broker y sus datos sigan disponibles).

Un agente de IA necesitaría `confirm:pedidos` para confirmar. Ante un 503 debería consultar el pedido con `read:pedidos` antes de intentar otra acción, porque la confirmación puede haberse guardado.
