# iaew-2026-ecommerce-api

API REST hecha con **Express**, **MongoDB** y **Mongoose** para una mini plataforma de e-commerce. Permite consultar el estado del servicio, crear y listar productos, crear pedidos y confirmarlos, protegiendo la regla de negocio de que un pedido no puede confirmarse dos veces (responde `409 Conflict` en ese caso).

## Endpoints principales

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/health` | Estado del servicio |
| `GET` | `/productos` | Lista productos |
| `POST` | `/productos` | Crea un producto |
| `POST` | `/pedidos` | Crea un pedido (calcula el total según el stock disponible) |
| `POST` | `/pedidos/:id/confirmar` | Confirma un pedido pendiente y descuenta stock |

## Requisitos

- Node.js LTS y npm
- Docker Desktop (para levantar MongoDB local)

## Cómo correrlo

```bash
npm install
docker run --name iaew-mongo -p 27017:27017 -d mongo:7
npm run dev
```

La API queda disponible en http://localhost:3000.

## Estructura del repositorio

```
├── app.js          — configuración de la API
├── db.js           — conexión a MongoDB
├── routes/
│   ├── productos.js  — endpoints de productos
│   └── pedidos.js    — endpoints de pedidos
├── models/
│   ├── Producto.js   — esquema Mongoose de Producto
│   └── Pedido.js     — esquema Mongoose de Pedido
├── respuestas.md   — respuestas a las preguntas de reflexión
└── capturas/       — evidencia en .png (health check, CRUD, pedidos, error 409, MongoDB for VS Code)
```