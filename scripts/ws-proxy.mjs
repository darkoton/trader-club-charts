#!/usr/bin/env node
/**
 * WebSocket прокси для PocketOption.
 *
 * Браузер не может подменить Origin в WebSocket.
 * Этот прокси принимает соединения от браузера и форвардит их
 * на PocketOption с нужными заголовками (Origin, User-Agent).
 *
 * Запуск:
 *   node scripts/ws-proxy.mjs
 *
 * Параметры (env):
 *   PROXY_PORT=3399   — порт прокси (по умолчанию 3399)
 *
 * Браузер подключается к:
 *   ws://localhost:3399?target=wss://api-eu.po.market/socket.io/?EIO=4&transport=websocket
 *
 * Прокси форвардит на target с заголовками:
 *   Origin: https://pocketoption.com
 *   User-Agent: Chrome/124
 */

import { WebSocketServer, WebSocket } from 'ws';
import { URL } from 'url';

const PORT = parseInt(process.env.PROXY_PORT || '3399', 10);

const HEADERS = {
  'Origin': 'https://pocketoption.com',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

const wss = new WebSocketServer({ port: PORT });

function ts() {
  return new Date().toLocaleTimeString('ru-RU', { hour12: false, fractionalSecondDigits: 3 });
}

console.log(`\n🔀 WS Proxy listening on ws://localhost:${PORT}`);
console.log(`   Browser connects → proxy → PocketOption (with Origin: pocketoption.com)\n`);

wss.on('connection', (clientWs, req) => {
  // Parse target URL from query string
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
  const target = reqUrl.searchParams.get('target');

  if (!target) {
    console.log(`[${ts()}] ❌ No ?target= parameter, closing`);
    clientWs.close(4000, 'Missing ?target= parameter');
    return;
  }

  console.log(`[${ts()}] 🔌 New client → ${target}`);

  // Connect to upstream (PocketOption) with spoofed headers
  const upstream = new WebSocket(target, {
    headers: HEADERS,
    rejectUnauthorized: false,
  });

  let clientAlive = true;
  let upstreamAlive = false;

  upstream.on('open', () => {
    upstreamAlive = true;
    console.log(`[${ts()}] ✅ Upstream connected`);
  });

  // Forward: upstream → client
  upstream.on('message', (data, isBinary) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data, { binary: isBinary });
    }
  });

  // Forward: client → upstream
  clientWs.on('message', (data, isBinary) => {
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(data, { binary: isBinary });
    }
  });

  // Close handling
  upstream.on('close', (code, reason) => {
    upstreamAlive = false;
    console.log(`[${ts()}] 🔴 Upstream closed: ${code} ${reason.toString()}`);
    if (clientAlive) clientWs.close(code, reason.toString());
  });

  clientWs.on('close', (code, reason) => {
    clientAlive = false;
    console.log(`[${ts()}] 🔴 Client closed: ${code}`);
    if (upstreamAlive) upstream.close();
  });

  upstream.on('error', (err) => {
    console.error(`[${ts()}] ❌ Upstream error: ${err.message}`);
    if (clientAlive) clientWs.close(4001, 'Upstream error');
  });

  clientWs.on('error', (err) => {
    console.error(`[${ts()}] ❌ Client error: ${err.message}`);
    if (upstreamAlive) upstream.close();
  });
});

process.on('SIGINT', () => {
  console.log('\n👋 Shutting down proxy...');
  wss.close();
  setTimeout(() => process.exit(0), 300);
});
