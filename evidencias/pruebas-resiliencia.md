# Clase 05 — Pruebas de resiliencia

Fecha: 16/10/2026. Herramienta HTTP: Postman.

## Alcance y estado de las evidencias

Este informe reúne las capturas disponibles y las transcripciones aportadas por el estudiante. Las secciones de retry, DLQ y evento duplicado describen resultados esperados; las demás secciones reúnen resultados observados.

| Prueba | Estado |
| --- | --- |
| Primera confirmación | HTTP 200 y body documentados; falta captura del header de respuesta false |
| Replay | HTTP 200, mismo evento y header true documentados |
| Stock | Documentado: 10 → 8 → 8 |
| Conflictos MISMATCH y REUSED | HTTP 409 documentados |
| Retry con recuperación | Resultado esperado |
| Reintentos agotados y DLQ | Resultado esperado |
| Evento duplicado | Resultado esperado |

## 1. Datos de la prueba

- Producto: `6ad2931c1ad563d43ef0d17c` — Teclado laboratorio.
- Cantidad del pedido: 2 unidades.
- Pedido principal: `6ad29ca680f4e1c43108865e`.
- Clave realmente utilizada: `pedido-6ad29ca680f4e1c43108865e` (sin sufijo v1).
- Evento: `b3cf9e44-c2b7-4432-8857-a47e021231fd`.
- Endpoint: `POST http://localhost:3000/pedidos/6ad29ca680f4e1c43108865e/confirmar`.
- Autorización: Bearer Token con los scopes requeridos; se omite el token.

### Respuesta de creación del pedido

Transcripción aportada por el estudiante:

```json
{
  "cliente": {
    "nombre": "Estudiante Demo",
    "email": "demo@example.test"
  },
  "estado": "pendiente",
  "items": [
    {
      "productoId": "6ad2931c1ad563d43ef0d17c",
      "nombre": "Teclado laboratorio",
      "cantidad": 2,
      "precioUnitario": 25000
    }
  ],
  "total": 50000,
  "notificacionEstado": "pendiente",
  "_id": "6ad29ca680f4e1c43108865e",
  "createdAt": "2026-10-16T21:52:38.218Z",
  "updatedAt": "2026-10-16T21:52:38.218Z",
  "__v": 0
}
```

## 2. Primera confirmación

Se envió el POST de confirmación con el header `Idempotency-Key: pedido-6ad29ca680f4e1c43108865e`, sin body.

**Resultado observado:** HTTP 200 OK, pedido confirmado y `idempotencia.replayed: false`.

![Primera confirmación: HTTP 200 y pedido confirmado](primera-confirmacion.png)

![Header de solicitud con la clave utilizada](header-primera.png)

**Aclaración:** la segunda imagen muestra el header de la solicitud, no los headers de la respuesta. Se espera `Idempotency-Replayed: false`, pero falta su captura o transcripción observada. No se debe reenviar este pedido para obtenerla, porque la siguiente ejecución será un replay.

### Body completo de la primera confirmación

Transcripción aportada por el estudiante:

```json
{
  "pedido": {
    "cliente": {
      "nombre": "Estudiante Demo",
      "email": "demo@example.test"
    },
    "_id": "6ad29ca680f4e1c43108865e",
    "estado": "confirmado",
    "items": [
      {
        "productoId": "6ad2931c1ad563d43ef0d17c",
        "nombre": "Teclado laboratorio",
        "cantidad": 2,
        "precioUnitario": 25000
      }
    ],
    "total": 50000,
    "notificacionEstado": "pendiente",
    "createdAt": "2026-10-16T21:52:38.218Z",
    "updatedAt": "2026-10-16T22:02:11.184Z",
    "__v": 0,
    "confirmadoEn": "2026-10-16T22:02:11.179Z",
    "confirmacionIdempotencyKey": "pedido-6ad29ca680f4e1c43108865e",
    "confirmacionEvento": {
      "eventId": "b3cf9e44-c2b7-4432-8857-a47e021231fd",
      "type": "pedido.confirmado",
      "version": 1,
      "occurredAt": "2026-10-16T22:02:11.179Z",
      "data": {
        "pedidoId": "6ad29ca680f4e1c43108865e"
      }
    }
  },
  "evento": {
    "eventId": "b3cf9e44-c2b7-4432-8857-a47e021231fd",
    "type": "pedido.confirmado",
    "version": 1,
    "occurredAt": "2026-10-16T22:02:11.179Z",
    "data": {
      "pedidoId": "6ad29ca680f4e1c43108865e"
    }
  },
  "idempotencia": {
    "key": "pedido-6ad29ca680f4e1c43108865e",
    "replayed": false
  }
}
```

### Log del worker

Transcripción aportada por el estudiante:

```text
Notificación procesada para pedido 6ad29ca680f4e1c43108865e; evento b3cf9e44-c2b7-4432-8857-a47e021231fd
```

## 3. Replay con la misma clave

Se repitió el POST sobre el mismo pedido con exactamente la misma clave.

**Resultado observado:** HTTP 200 OK, `Idempotency-Replayed: true` y `idempotencia.replayed: true`. El evento conserva el identificador `b3cf9e44-c2b7-4432-8857-a47e021231fd`.

![Respuesta del replay](05-06-replay.png)

![Header de respuesta Idempotency-Replayed true](headers-replay.png)

### Body completo del replay

Transcripción aportada por el estudiante; se conserva el contenido, con formato y orden de propiedades normalizados:

```json
{
  "pedido": {
    "cliente": {
      "nombre": "Estudiante Demo",
      "email": "demo@example.test"
    },
    "_id": "6ad29ca680f4e1c43108865e",
    "estado": "confirmado",
    "items": [
      {
        "productoId": "6ad2931c1ad563d43ef0d17c",
        "nombre": "Teclado laboratorio",
        "cantidad": 2,
        "precioUnitario": 25000
      }
    ],
    "total": 50000,
    "notificacionEstado": "procesada",
    "createdAt": "2026-10-16T21:52:38.218Z",
    "updatedAt": "2026-10-16T22:02:11.461Z",
    "__v": 0,
    "confirmadoEn": "2026-10-16T22:02:11.179Z",
    "confirmacionIdempotencyKey": "pedido-6ad29ca680f4e1c43108865e",
    "confirmacionEvento": {
      "eventId": "b3cf9e44-c2b7-4432-8857-a47e021231fd",
      "type": "pedido.confirmado",
      "version": 1,
      "occurredAt": "2026-10-16T22:02:11.179Z",
      "data": {
        "pedidoId": "6ad29ca680f4e1c43108865e"
      }
    },
    "notificadoEn": "2026-10-16T22:02:11.458Z"
  },
  "evento": {
    "eventId": "b3cf9e44-c2b7-4432-8857-a47e021231fd",
    "type": "pedido.confirmado",
    "version": 1,
    "occurredAt": "2026-10-16T22:02:11.179Z",
    "data": {
      "pedidoId": "6ad29ca680f4e1c43108865e"
    }
  },
  "idempotencia": {
    "key": "pedido-6ad29ca680f4e1c43108865e",
    "replayed": true
  }
}
```

El cambio de `notificacionEstado` de pendiente a procesada y la aparición de `notificadoEn` reflejan el trabajo asíncrono del worker. El evento de confirmación sigue siendo el mismo. El handler de replay retorna antes de descontar stock o publicar; no se adjuntó una observación de la cola o del log durante ese intervalo para demostrar por separado la ausencia de una nueva publicación.

## 4. Stock: una sola disminución

Consulta utilizada: `GET http://localhost:3000/productos`.

| Momento | Stock del producto 6ad2931c1ad563d43ef0d17c |
| --- | ---: |
| Antes de confirmar | 10 |
| Después de confirmar | 8 |
| Después del replay | 8 |

### Antes de confirmar

![Stock inicial 10](stock-inicial.png)

### Después de confirmar

![Stock después de confirmar 8](stock-confirmado.png)

### Después del replay

![Stock después del replay 8](05-08-stock-replay.png)

La disminución fue de dos unidades, correspondientes a la cantidad solicitada. El replay no produjo un segundo descuento.

Objeto del producto transcrito por el estudiante:

```json
{
  "_id": "6ad2931c1ad563d43ef0d17c",
  "nombre": "Teclado laboratorio",
  "precio": 25000,
  "categoria": "perifericos",
  "stock": 8,
  "activo": true,
  "createdAt": "2026-10-16T21:11:56.111Z",
  "updatedAt": "2026-10-16T22:02:11.162Z",
  "__v": 0
}
```

## 5. Conflictos de idempotencia

### 5.1. Otra clave en el pedido confirmado: MISMATCH

Se utilizó el pedido principal con la clave `pedido-6ad29ca680f4e1c43108865e-v2`.

**Resultado observado:** HTTP 409 Conflict.

```json
{
  "error": "El pedido ya fue confirmado con otra clave",
  "code": "IDEMPOTENCY_KEY_MISMATCH",
  "retryable": false,
  "action": "Consultar el pedido y no generar una nueva confirmación"
}
```

![Conflicto por otra clave en el mismo pedido](05-09-conflicto-mismatch.png)

### 5.2. Misma clave en otro pedido: REUSED

La captura muestra el POST sobre otro pedido, `6ad2a50980f4e1c43108865f`, reutilizando la clave original `pedido-6ad29ca680f4e1c43108865e`.

**Resultado observado:** HTTP 409 Conflict.

```json
{
  "error": "La clave de idempotencia ya fue usada en otro pedido",
  "code": "IDEMPOTENCY_KEY_REUSED",
  "retryable": false,
  "action": "Usar una clave distinta por operación"
}
```

![Conflicto por clave reutilizada en otro pedido](05-10-conflicto-reused.png)

No se adjuntó una captura adicional del stock después de ambos conflictos. La evidencia 10 → 8 → 8 corresponde a primera confirmación y replay.

## 6. Retry con recuperación — Resultados esperados

Configuración de la prueba:

```dotenv
RETRY_DELAY_MS=3000
MAX_RETRIES=3
SIMULATE_TRANSIENT_FAILURES=2
```

Procedimiento: reiniciar el worker con esa configuración y confirmar un pedido pendiente con una clave nueva. La respuesta HTTP esperada es 200 con `replayed: false`; el retry ocurre en el worker.

**Salida esperada:**

```text
Reintento 1/3: Falla transitoria simulada 1/2
Reintento 2/3: Falla transitoria simulada 2/2
Notificación procesada para pedido <pedidoId>; evento <eventId>
```

El procesamiento debería completarse en la tercera entrega, después de aproximadamente 6 segundos de espera acumulada. El pedido debería quedar con `notificacionEstado: "procesada"`.


## 7. Reintentos agotados y DLQ — Resultados esperados

Configuración: `MAX_RETRIES=3`, `RETRY_DELAY_MS=3000` y `SIMULATE_TRANSIENT_FAILURES=4`. Reiniciar el worker y confirmar otro pedido pendiente con una clave nueva.

**Salida esperada:**

```text
Reintento 1/3: Falla transitoria simulada 1/4
Reintento 2/3: Falla transitoria simulada 2/4
Reintento 3/3: Falla transitoria simulada 3/4
Enviando a DLQ — reintentos agotados (3/3): Falla transitoria simulada 4/4
```

Son cuatro entregas totales: el intento inicial más tres reintentos. Se esperan aproximadamente 9 segundos de espera acumulada.

En RabbitMQ Management, abrir **Queues and Streams → notificaciones.pedido-confirmado.dlq**. Si estaba vacía, el resultado esperado es **Ready = 1**; si ya tenía mensajes, debe aumentar en uno. El mensaje debería conservar el evento y llevar `x-retry-count: 3` y `x-dlq-reason` con el motivo.


Restaurar `SIMULATE_TRANSIENT_FAILURES=0` y reiniciar el worker.

## 8. Evento duplicado — Resultados esperados

Con las fallas simuladas en 0, utilizar un evento que ya tenga un registro en EventoProcesado. Antes de republicarlo, guardar el estado del pedido, su `notificadoEn` y la cantidad de registros para ese eventId.

En RabbitMQ Management: **Exchanges → pedidos.exchange → Publish message**. Routing key: `pedido.confirmado`. Payload: el objeto evento completo, sin el envoltorio `pedido` ni `idempotencia`.

Puede utilizarse este evento real de la primera confirmación, siempre que se conserve su registro procesado:

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

**Salida esperada al republicarlo:**

```text
Duplicado reconocido: evento b3cf9e44-c2b7-4432-8857-a47e021231fd
```

Se espera que el pedido y `notificadoEn` permanezcan iguales y que siga existiendo un solo registro de ese eventId en EventoProcesado.


## 9. ¿Qué debe consultar un agente de IA antes de reintentar un 503?

Debe consultar el estado del pedido y su notificación, y leer los campos `code`, `retryable` y `action` de la respuesta. En esta implementación puede existir un pedido confirmado aunque la publicación del evento haya fallado. Por eso no debe generar otra clave ni asumir que un 503 significa que la operación no ocurrió.

La API actual permite consultar `GET /pedidos` con autorización y localizar el pedido por su ID. Si ya está confirmado, no corresponde intentar una nueva confirmación de negocio. Reutilizar la misma clave devuelve el evento guardado, pero **no vuelve a publicarlo**: una publicación fallida necesita un mecanismo de recuperación adicional, como un outbox. El 503 de este caso indica `retryable: false`.

## 10. Decisión propuesta para el TPI

Propuesta basada en esta operación de ecommerce; adaptar si el TPI utiliza otro dominio.

| Aspecto | Decisión |
| --- | --- |
| Operación | Confirmar un pedido y notificar su confirmación de forma asíncrona |
| Clave | Una clave estable por intención de confirmación, por ejemplo pedido-<id>-v1; reutilizarla en los reintentos de esa misma intención |
| Identidad del evento | UUID eventId persistido junto a la confirmación |
| Fallas transitorias | Indisponibilidad temporal de MongoDB durante el procesamiento; simulación controlada para probar el circuito |
| Límite | Tres reintentos después del intento inicial, cuatro entregas totales |
| Demora | Cola retry con TTL de 3000 ms |
| DLQ | notificaciones.pedido-confirmado.dlq para errores permanentes o reintentos agotados |
| Deduplicación | Consultar y reservar eventId en EventoProcesado con índice único antes de aplicar el efecto |
| Recuperación operativa | Inspeccionar la causa y el estado persistido antes de decidir una republicación |
| Inconsistencia aceptada | Puede quedar un pedido confirmado sin evento publicado; también puede quedar una reserva de evento sin efecto persistido si falla la compensación |
| Evolución | Outbox e inbox transaccional para reducir esas ventanas; no afirmar exactly once |

La consulta previa de clave reutilizada evita descontar stock en el caso secuencial probado. No hace atómica la confirmación: solicitudes concurrentes y fallas entre descuento de stock y guardado del pedido siguen siendo limitaciones. Las evidencias actuales no prueban comportamiento bajo concurrencia.

## 11. Evidencias adjuntas

Las nueve capturas se incluyen mediante rutas relativas. Deben conservarse junto al Markdown dentro de la carpeta evidencias al preparar el ZIP, para que puedan visualizarse.

