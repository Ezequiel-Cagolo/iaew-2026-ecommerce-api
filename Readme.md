# iaew-2026-ecommerce-api

API REST hecha con **Express**, **MongoDB** y **Mongoose** para una mini plataforma de e-commerce. La confirmación de un pedido publica `pedido.confirmado` en RabbitMQ; un worker separado procesa la notificación. Un pedido no puede confirmarse dos veces (responde `409 Conflict`).

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
- Docker Desktop (para MongoDB y RabbitMQ locales)
- Un tenant Auth0 con la API `https://iaew-pedidos-api` y los scopes `read:pedidos`, `write:pedidos` y `confirm:pedidos`

## Cómo correrlo

```bash
npm ci
cp .env.example .env
# Completar .env con el tenant Auth0 y una API key local
docker run --name iaew-mongo -p 27017:27017 -d mongo:7
docker compose up -d rabbitmq
npm run dev
```

Si `iaew-mongo` ya existe, usar `docker start iaew-mongo` en lugar de `docker run`. La API queda disponible en http://localhost:3000 y la consola de RabbitMQ en http://localhost:15672. En otra terminal, `npm run worker` inicia el consumidor. Para comprobar el desacople, confirmar un pedido con el worker detenido, verificar un mensaje **Ready** y luego iniciarlo. En Windows, ejecutar el preflight con Git Bash: `& 'C:\Program Files\Git\bin\bash.exe' preflight.sh services`.

## Estructura del repositorio

```
├── app.js          — configuración de la API
├── db.js           — conexión a MongoDB
├── compose.yaml    — RabbitMQ local
├── lib/rabbit.js   — publicación con confirmación del broker
├── worker.js       — consumidor de notificaciones
├── routes/
│   ├── productos.js  — endpoints de productos
│   └── pedidos.js    — endpoints de pedidos
├── models/
│   ├── Producto.js   — esquema Mongoose de Producto
│   └── Pedido.js     — esquema Mongoose de Pedido
├── respuestas.md   — respuestas a las preguntas de reflexión
├── evidencias/pruebas-http.md — evidencia de Clase 04
└── capturas/       — evidencia en .png (health check, CRUD, pedidos, error 409, MongoDB for VS Code)
```
