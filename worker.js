require('dotenv').config();

const mongoose = require('mongoose');
const { connectDb } = require('./db');
const Pedido = require('./models/Pedido');
const EventoProcesado = require('./models/EventoProcesado');
const { retryConfig } = require('./lib/config');
const {
  crearCanal,
  QUEUE,
  publishRetry,
  publishDlq
} = require('./lib/rabbit');

class PermanentMessageError extends Error {}
class TransientMessageError extends Error {}

function retryCountOf(message) {
  const value = Number(
    message.properties.headers?.['x-retry-count'] ?? 0
  );
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function validarEvento(evento) {
  if (!evento || typeof evento !== 'object') return false;
  if (evento.type !== 'pedido.confirmado') return false;
  if (evento.version !== 1) return false;
  if (typeof evento.eventId !== 'string' || !evento.eventId) {
    return false;
  }
  if (typeof evento.occurredAt !== 'string') return false;
  if (
    !evento.data ||
    !mongoose.Types.ObjectId.isValid(evento.data.pedidoId)
  ) {
    return false;
  }
  return !Number.isNaN(Date.parse(evento.occurredAt));
}

function parsePedidoConfirmado(content) {
  let evento;

  try {
    evento = JSON.parse(content.toString());
  } catch {
    throw new PermanentMessageError('JSON inválido');
  }

  if (!validarEvento(evento)) {
    throw new PermanentMessageError('Evento inválido');
  }

  return evento;
}

async function procesarMensaje(message, channel) {
  const count = retryCountOf(message);
  const config = retryConfig();

  try {
    if (count < config.simulatedFailures) {
      throw new TransientMessageError(
        `Falla transitoria simulada ${count + 1}/${config.simulatedFailures}`
      );
    }

    const evento = parsePedidoConfirmado(message.content);

    // 1. Reconocer eventos que ya fueron procesados.
    if (await EventoProcesado.exists({ eventId: evento.eventId })) {
      console.log(`Duplicado reconocido: evento ${evento.eventId}`);
      channel.ack(message);
      return;
    }

    // 2. Buscar el pedido.
    const pedido = await Pedido.findById(evento.data.pedidoId);
    if (!pedido) {
      throw new PermanentMessageError('Pedido inexistente');
    }

    // 3. Reservar el identificador antes de aplicar el efecto.
    try {
      await EventoProcesado.create({
        eventId: evento.eventId,
        type: evento.type,
        pedidoId: pedido._id
      });
    } catch (error) {
      if (error?.code === 11000) {
        console.log(
          `Duplicado reconocido (race): evento ${evento.eventId}`
        );
        channel.ack(message);
        return;
      }
      throw error;
    }

    // 4. Aplicar el efecto; revertir la reserva si falla.
    try {
      pedido.notificacionEstado = 'procesada';
      pedido.notificadoEn = new Date();
      await pedido.save();
    } catch (error) {
      await EventoProcesado.deleteOne({ eventId: evento.eventId });
      throw new TransientMessageError(
        `MongoDB no pudo persistir el efecto: ${error.message}`
      );
    }

    console.log(
      `Notificación procesada para pedido ${pedido.id}; evento ${evento.eventId}`
    );

    channel.ack(message);
  } catch (error) {
    if (
      !(error instanceof PermanentMessageError) &&
      count < config.maxRetries
    ) {
      console.warn(
        `Reintento ${count + 1}/${config.maxRetries}: ${error.message}`
      );

      await publishRetry(channel, message, count + 1, error.message);
      channel.ack(message);
      return;
    }

    const reason = error instanceof PermanentMessageError
      ? `permanente: ${error.message}`
      : `reintentos agotados (${count}/${config.maxRetries}): ${error.message}`;

    console.error(`Enviando a DLQ — ${reason}`);
    await publishDlq(channel, message, reason, count);
    channel.ack(message);
  }
}

async function main() {
  await connectDb();

  // Esperar a que esté creado el índice único antes de consumir.
  await EventoProcesado.init();

  const { channel } = await crearCanal();
  await channel.prefetch(1);

  await channel.consume(
    QUEUE,
    (message) => {
      if (!message) return;

      procesarMensaje(message, channel).catch((error) => {
        console.error(
          'Fallo al gestionar el mensaje; se detiene el worker sin ack:',
          error.message
        );
        process.exit(1);
      });
    },
    { noAck: false }
  );

  console.log('Worker escuchando cola ' + QUEUE);
}

main().catch((error) => {
  console.error('No se pudo iniciar el worker');
  console.error(error.message);
  process.exit(1);
});