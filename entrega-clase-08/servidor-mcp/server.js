import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { verifyApproval } from '../compartido/security.js';

const ORDER_ID = /^[a-f0-9]{24}$/;
const API_TIMEOUT_MS = 5_000;
const TOOL_INPUT_MAX_BYTES = 8_192;
const OUTPUT_MAX_BYTES = 8_192;
const OUTPUT_SCHEMA = {
  status: z.enum(['ok', 'error']),
  pedidoId: z.string().optional(),
  estado: z.string().optional(),
  repetido: z.boolean().optional(),
  code: z.string().optional(),
  resultado: z.literal('VERIFICAR_ESTADO').optional(),
  total: z.number().int().optional(),
  pedidos: z.array(z.object({ pedidoId: z.string(), estado: z.string() })).optional(),
  truncado: z.boolean().optional()
};
const MAX_PENDIENTES = 10;
const SAFE_CONFLICT_CODES = new Set([
  'INSUFFICIENT_STOCK', 'IDEMPOTENCY_KEY_MISMATCH', 'IDEMPOTENCY_KEY_REUSED', 'ORDER_NOT_PENDING'
]);

function result(data, isError = false) {
  const encoded = JSON.stringify(data);
  if (Buffer.byteLength(encoded, 'utf8') > OUTPUT_MAX_BYTES) {
    return {
      content: [{ type: 'text', text: '{"status":"error","code":"OUTPUT_LIMIT"}' }],
      structuredContent: { status: 'error', code: 'OUTPUT_LIMIT' },
      isError: true
    };
  }
  return {
    content: [{ type: 'text', text: encoded }],
    structuredContent: data,
    isError
  };
}

function withPedidoId(data, pedidoId) {
  return { ...data, pedidoId };
}

function safeApiCode(body) {
  return typeof body?.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(body.code) ? body.code : undefined;
}

export function mapApiError(status, body, operation) {
  if (status === 401) return { status: 'error', code: 'AUTHENTICATION_FAILED' };
  if (status === 403) return { status: 'error', code: 'SCOPE_INSUFFICIENT' };
  if (status === 404) {
    return { status: 'error', code: operation === 'confirmar_pedido' ? 'ORDER_NOT_FOUND' : 'API_HTTP_404' };
  }
  if (status === 409) {
    const code = safeApiCode(body);
    return { status: 'error', code: code && SAFE_CONFLICT_CODES.has(code) ? code : 'CONFLICT' };
  }
  if (status === 503 || status >= 500) {
    return operation === 'confirmar_pedido'
      ? { status: 'error', code: 'PARTIAL', resultado: 'VERIFICAR_ESTADO' }
      : { status: 'error', code: `BACKEND_HTTP_${status}` };
  }
  const code = safeApiCode(body);
  return { status: 'error', code: code && ['ORDER_ID_INVALID', 'ORDER_NOT_FOUND'].includes(code) ? code : `API_HTTP_${status}` };
}

function configuredApiBase(env) {
  const raw = env.API_BASE_URL || 'http://127.0.0.1:3008';
  const base = new URL(raw);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password ||
      base.search || base.hash || base.pathname !== '/') throw new Error('API_BASE_URL_INVALID');
  return base.origin;
}

export function createApiClient({ env = process.env, fetchImpl = fetch, now = Date.now } = {}) {
  const base = configuredApiBase(env);
  const apiToken = env.API_TOKEN;
  const domain = env.AUTH0_DOMAIN?.replace(/^https:\/\//, '').replace(/\/$/, '');
  const clientId = env.AUTH0_CLIENT_ID;
  const clientSecret = env.AUTH0_CLIENT_SECRET;
  const audience = env.AUTH0_AUDIENCE;
  if ((!apiToken || apiToken.length > 8192) && (!domain || !clientId || !clientSecret || !audience)) {
    throw new Error('AUTH_CONFIGURATION_REQUIRED');
  }
  let cachedToken;
  let tokenExpiresAt = 0;

  async function getToken(signal) {
    if (apiToken) return apiToken;
    if (cachedToken && tokenExpiresAt > now() + 30_000) return cachedToken;
    if (!/^[a-zA-Z0-9.-]+$/.test(domain)) throw new Error('AUTH_CONFIGURATION_INVALID');
    const response = await fetchImpl(`https://${domain}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        audience,
        scope: 'read:pedidos confirm:pedidos'
      }),
      signal
    });
    if (!response.ok) throw new Error(`TOKEN_HTTP_${response.status}`);
    const body = await response.json();
    if (typeof body.access_token !== 'string' || body.access_token.length > 8192) throw new Error('TOKEN_RESPONSE_INVALID');
    cachedToken = body.access_token;
    tokenExpiresAt = now() + Math.min(Number(body.expires_in) || 60, 3600) * 1000;
    return cachedToken;
  }

  async function request(path, { method = 'GET', body, correlationId, operation, pedidoId, idempotencyKey } = {}) {
    const startedAt = performance.now();
    const controller = AbortSignal.timeout(API_TIMEOUT_MS);
    let apiRequestStarted = false;
    try {
      const token = await getToken(controller);
      apiRequestStarted = true;
      const response = await fetchImpl(new URL(path, `${base}/`), {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'x-correlation-id': correlationId,
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller
      });
      const text = await response.text();
      let payload = {};
      try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
      console.error(JSON.stringify({
        event: 'mcp.api',
        correlationId,
        tool: operation,
        operation,
        httpMethod: method,
        pedidoId,
        status: response.status,
        durationMs: Math.round(performance.now() - startedAt)
      }));
      return { response, payload };
    } catch (error) {
      const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      const tokenResponse = /^TOKEN_HTTP_(401|403|5\d\d)$/.exec(error?.message || '');
      const failure = !apiRequestStarted && tokenResponse?.[1] === '401'
        ? 'AUTHENTICATION_FAILED'
        : !apiRequestStarted && tokenResponse?.[1] === '403'
          ? 'SCOPE_INSUFFICIENT'
          : timeout ? 'TIMEOUT' : 'BACKEND_UNAVAILABLE';
      console.error(JSON.stringify({
        event: 'mcp.api',
        correlationId,
        tool: operation,
        operation,
        httpMethod: method,
        pedidoId,
        result: failure,
        durationMs: Math.round(performance.now() - startedAt)
      }));
      return { failure, ambiguous: apiRequestStarted };
    }
  }

  return { request };
}

function errorResultForFailure(failure, operation, ambiguous = false) {
  if (operation === 'confirmar_pedido' && ambiguous) {
    return { status: 'error', code: failure, resultado: 'VERIFICAR_ESTADO' };
  }
  return { status: 'error', code: failure };
}

export function createMcpServer({ env = process.env, api = createApiClient({ env }) } = {}) {
  const approvalSecret = env.APPROVAL_SECRET;
  if (typeof approvalSecret !== 'string' || Buffer.byteLength(approvalSecret) < 32) throw new Error('APPROVAL_SECRET_REQUIRED');
  const server = new McpServer({ name: 'iaew-pedidos', version: '1.0.0' });
  const seenNonces = new Map();

  server.registerTool('consultar_estado_pedido', {
    description: 'Consulta únicamente el ID y estado actual de un pedido indicado por el operador.',
    inputSchema: { pedidoId: z.string() },
    outputSchema: OUTPUT_SCHEMA
  }, async ({ pedidoId }, extra) => {
    const correlationId = typeof extra?._meta?.correlationId === 'string' && extra._meta.correlationId.length <= 64
      ? extra._meta.correlationId : randomUUID();
    if (Buffer.byteLength(pedidoId, 'utf8') > TOOL_INPUT_MAX_BYTES) {
      return result({ status: 'error', code: 'TOOL_INPUT_LIMIT' }, true);
    }
    if (!ORDER_ID.test(pedidoId)) return result({ status: 'error', code: 'ORDER_ID_INVALID' }, true);
    const { response, payload, failure, ambiguous } = await api.request('/pedidos', {
      correlationId, operation: 'consultar_estado_pedido', pedidoId
    });
    if (failure) return result(withPedidoId(errorResultForFailure(failure, 'consultar_estado_pedido', ambiguous), pedidoId), true);
    if (!response.ok) return result(withPedidoId(mapApiError(response.status, payload, 'consultar_estado_pedido'), pedidoId), true);
    if (!Array.isArray(payload)) return result({ status: 'error', code: 'API_RESPONSE_INVALID', pedidoId }, true);

    const pedido = mapPedidoFromListado(payload, pedidoId);
    if (!pedido) return result({ status: 'error', code: 'ORDER_NOT_FOUND', pedidoId }, true);
    return result({ status: 'ok', pedidoId: pedido.pedidoId, estado: pedido.estado });
  });

  server.registerTool('listar_pedidos_pendientes', {
    description: 'Lista como máximo 10 pedidos en estado pendiente, solo con ID y estado. No recibe argumentos.',
    inputSchema: {},
    outputSchema: OUTPUT_SCHEMA
  }, async (_args, extra) => {
    const correlationId = typeof extra?._meta?.correlationId === 'string' && extra._meta.correlationId.length <= 64
      ? extra._meta.correlationId : randomUUID();

    const { response, payload, failure, ambiguous } = await api.request('/pedidos', {
      correlationId, operation: 'listar_pedidos_pendientes'
    });

    if (failure) return result(errorResultForFailure(failure, 'listar_pedidos_pendientes', ambiguous), true);
    if (!response.ok) return result(mapApiError(response.status, payload, 'listar_pedidos_pendientes'), true);
    if (!Array.isArray(payload)) return result({ status: 'error', code: 'API_RESPONSE_INVALID' }, true);

    return result({ status: 'ok', ...mapPendientesFromListado(payload) });
  });

  server.registerTool('confirmar_pedido', {
    description: 'Confirma un pedido indicado por el operador; exige aprobación firmada del host y autorización de la API.',
    inputSchema: { pedidoId: z.string() },
    outputSchema: OUTPUT_SCHEMA
  }, async ({ pedidoId }, extra) => {
    const correlationId = typeof extra?._meta?.correlationId === 'string' && extra._meta.correlationId.length <= 64
      ? extra._meta.correlationId : randomUUID();
    if (Buffer.byteLength(pedidoId, 'utf8') > TOOL_INPUT_MAX_BYTES) {
      return result({ status: 'error', code: 'TOOL_INPUT_LIMIT' }, true);
    }
    if (!ORDER_ID.test(pedidoId)) return result({ status: 'error', code: 'ORDER_ID_INVALID' }, true);
    let grant;
    try {
      grant = verifyApproval(extra?._meta?.approval, {
        pedidoId, secret: approvalSecret, seen: seenNonces
      });
    } catch (error) {
      const code = error.message === 'APPROVAL_REQUIRED' ? 'APPROVAL_REQUIRED' : 'APPROVAL_INVALID';
      return result({ status: 'error', code, pedidoId }, true);
    }

    const { response, payload, failure, ambiguous } = await api.request(`/pedidos/${pedidoId}/confirmar`, {
      method: 'POST',
      body: {},
      correlationId,
      operation: 'confirmar_pedido',
      pedidoId,
      idempotencyKey: grant.key
    });
    if (failure) return result(withPedidoId(errorResultForFailure(failure, 'confirmar_pedido', ambiguous), pedidoId), true);
    if (!response.ok) return result(withPedidoId(mapApiError(response.status, payload, 'confirmar_pedido'), pedidoId), true);
    const order = payload?.pedido;
    const replayed = payload?.idempotencia?.replayed;
    if (order?._id !== pedidoId || typeof order.estado !== 'string' || typeof replayed !== 'boolean') {
      return result({ status: 'error', code: 'API_RESPONSE_INVALID', resultado: 'VERIFICAR_ESTADO', pedidoId }, true);
    }
    return result({ status: 'ok', pedidoId, estado: order.estado, repetido: replayed });
  });

  server.registerResource('docs-pedidos', 'iaew://docs/pedidos', {
    mimeType: 'text/plain',
    description: 'Descripción estática y segura del flujo de pedidos.'
  }, async uri => ({
    contents: [{
      uri: uri.href,
      mimeType: 'text/plain',
      text: 'El operador consulta el estado con consultar_estado_pedido y los pendientes con listar_pedidos_pendientes (máximo 10, solo ID y estado). La confirmación usa confirmar_pedido, requiere aprobación explícita del host y autorización de la API. Una respuesta parcial exige consultar el estado; no repetir automáticamente el POST.'
    }]
  }));

  return server;
}

export function mapPendientesFromListado(pedidos) {
  const pendientes = pedidos
    .filter(item => item?.estado === 'pendiente' && typeof item._id === 'string' && ORDER_ID.test(item._id))
    .map(item => ({ pedidoId: item._id, estado: item.estado }));

  return {
    total: pendientes.length,
    pedidos: pendientes.slice(0, MAX_PENDIENTES),
    truncado: pendientes.length > MAX_PENDIENTES
  };
}

export function mapPedidoFromListado(pedidos, pedidoId) {
  const pedido = pedidos.find(item => item?._id === pedidoId);
  if (!pedido || typeof pedido.estado !== 'string') return undefined;
  return { pedidoId, estado: pedido.estado };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const server = createMcpServer();
  await server.connect(new StdioServerTransport());
}
