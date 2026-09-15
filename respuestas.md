# Respuestas Clase 02

## 1. ¿Qué endpoint fue CRUD?

Respuesta:
Los endpoints de /productos (GET para listar y POST para crear) son operaciones CRUD: gestionan directamente la creación y consulta de un recurso (Producto) sin aplicar ninguna regla de negocio adicional más allá de validar los datos requeri

## 2. ¿Qué endpoint fue una operación de negocio?

Respuesta:
POST /pedidos/:id/confirmar es una operación de negocio. No crea, lee, actualiza ni borra un recurso de forma genérica: representa una acción del dominio ("confirmar la compra") que dispara validaciones de stock, cambia el estado del pedido y descuenta inventario.

## 3. ¿Qué regla de negocio protegimos?

Respuesta:
Protegimos que un mismo pedido no pueda confirmarse más de una vez (evitando descontar stock dos veces por el mismo pedido). Si el pedido ya estaba confirmado, la API responde 409 Conflict en lugar de permitir la operación.

## 4. ¿Por qué 409 Conflict es más claro que 500?

Respuesta:
Porque 409 Conflict indica que la solicitud es válida y el servidor funciona correctamente, pero la operación no puede completarse debido al estado actual del recurso (el pedido ya fue confirmado). Un 500 comunicaría un error interno inesperado del servidor, lo cual sería engañoso: el cliente pensaría que hay un bug, cuando en realidad se trata de una regla de negocio funcionando como se espera. Usar el código correcto permite que el cliente de la API distinga entre "algo se rompió" y "tu operación no es válida en este momento".