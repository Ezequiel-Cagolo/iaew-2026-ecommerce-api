const express = require('express');
const { connectDb } = require('./db');
const productosRouter = require('./routes/productos');
const pedidosRouter = require('./routes/pedidos');
const { validateAccessToken } = require('./middleware/auth0');

require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/token-info', validateAccessToken, (req, res) => {
  res.json({
    issuer: req.auth.payload.iss,
    audience: req.auth.payload.aud,
    subject: req.auth.payload.sub,
    scopes: req.auth.payload.scope
  });
});

app.use('/productos', productosRouter);
app.use('/pedidos', pedidosRouter);

app.use((err, req, res, next) => {
  if (err.status === 401) {
    return res.status(401).json({
      error: 'Token ausente, inválido o expirado'
    });
  }

  if (err.status === 403) {
    return res.status(403).json({
      error: 'Permisos insuficientes para ejecutar la acción'
    });
  }

  next(err);
});

connectDb()
  .then(() => {
    app.listen(port, () => {
      console.log(`API escuchando en http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error('No se pudo conectar a MongoDB');
    console.error(error.message);
    process.exit(1);
  });