#!/usr/bin/env node
/**
 * Тестовый скрипт подключения к PocketOption WebSocket.
 *
 * Реализация повторяет PocketOptionAPI Python клиент:
 * - handshake: 0{..} → 40 → 40{..} → 42["auth",{..}]
 * - keepalive: 42["ps"] каждые 20 сек
 * - server ping 2 → pong 3
 *
 * Запуск:
 *   node scripts/test-ws.mjs
 *
 * С кастомными параметрами:
 *   SESSION="..." UID="115873679" IS_DEMO=0 REGION=EUROPA node scripts/test-ws.mjs
 *
 * Попробовать все регионы:
 *   TRY_ALL=1 node scripts/test-ws.mjs
 */

import WebSocket from 'ws';

/* ─── Регионы (из Python API constants.py) ─── */
const REGIONS = {
  EUROPA:    'wss://api-eu.po.market/socket.io/?EIO=4&transport=websocket',
  FRANCE:    'wss://api-fr.po.market/socket.io/?EIO=4&transport=websocket',
  FRANCE2:   'wss://api-fr2.po.market/socket.io/?EIO=4&transport=websocket',
  FINLAND:   'wss://api-fin.po.market/socket.io/?EIO=4&transport=websocket',
  SEYCHELLES:'wss://api-sc.po.market/socket.io/?EIO=4&transport=websocket',
  HONGKONG:  'wss://api-hk.po.market/socket.io/?EIO=4&transport=websocket',
  ASIA:      'wss://api-asia.po.market/socket.io/?EIO=4&transport=websocket',
  INDIA:     'wss://api-in.po.market/socket.io/?EIO=4&transport=websocket',
  RUSSIA:    'wss://api-msk.po.market/socket.io/?EIO=4&transport=websocket',
  SERVER1:   'wss://api-spb.po.market/socket.io/?EIO=4&transport=websocket',
  SERVER2:   'wss://api-l.po.market/socket.io/?EIO=4&transport=websocket',
  SERVER3:   'wss://api-c.po.market/socket.io/?EIO=4&transport=websocket',
  US_NORTH:  'wss://api-us-north.po.market/socket.io/?EIO=4&transport=websocket',
  US2:       'wss://api-us2.po.market/socket.io/?EIO=4&transport=websocket',
  US3:       'wss://api-us3.po.market/socket.io/?EIO=4&transport=websocket',
  US4:       'wss://api-us4.po.market/socket.io/?EIO=4&transport=websocket',
  US_SOUTH:  'wss://api-us-south.po.market/socket.io/?EIO=4&transport=websocket',
  DEMO:      'wss://demo-api-eu.po.market/socket.io/?EIO=4&transport=websocket',
  DEMO_2:    'wss://try-demo-eu.po.market/socket.io/?EIO=4&transport=websocket',
};

/* ─── Настройки ─── */
const SESSION = process.env.SESSION  || 'a:4:{s:10:"session_id";s:32:"28b7e38a6a6a3bef2890c61c8f0ca51f";s:10:"ip_address";s:13:"146.70.129.22";s:10:"user_agent";s:117:"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";s:13:"last_activity";i:1772033219;}8dd99d1ad3c0ba202491d0060c0a68df';
const UID      = parseInt(process.env.UID || '115873679', 10);
const IS_DEMO  = parseInt(process.env.IS_DEMO || '0', 10);
const REGION   = process.env.REGION || 'EUROPA';
const TRY_ALL  = process.env.TRY_ALL === '1';

/* ─── Headers (like Python DEFAULT_HEADERS) ─── */
const HEADERS = {
  'Origin': 'https://pocketoption.com',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

/* ─── Helpers ─── */
function ts() {
  return new Date().toLocaleTimeString('ru-RU', { hour12: false, fractionalSecondDigits: 3 });
}

function formatAuthMessage() {
  const authData = {
    session: SESSION,
    isDemo: IS_DEMO,
    uid: UID,
    platform: 1,
    isFastHistory: true,
    isOptimized: true,
  };
  return '42' + JSON.stringify(['auth', authData]);
}

/* ─── Connect to a single region ─── */
function connectToRegion(regionName, url) {
  return new Promise((resolve) => {
    console.log(`\n🔌 [${ts()}] Connecting to ${regionName}: ${url}\n`);

    const ws = new WebSocket(url, { headers: HEADERS, rejectUnauthorized: false });
    let pingTimer = null;
    let resolved = false;
    let msgCount = 0;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.log(`  ⏰ [${ts()}] Timeout (8s) for ${regionName}`);
        ws.close();
        resolve({ region: regionName, status: 'timeout' });
      }
    }, 8000);

    function done(status) {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      if (status !== 'success' && pingTimer) clearInterval(pingTimer);
      resolve({ region: regionName, status, ws: status === 'success' ? ws : null, pingTimer });
    }

    ws.on('open', () => {
      console.log(`  ✅ [${ts()}] WebSocket OPEN`);
    });

    ws.on('message', (raw) => {
      const data = raw.toString();
      msgCount++;

      // Server ping → respond pong (like Python)
      if (data === '2') {
        ws.send('3');
        return;
      }
      if (data === '3') return;

      // Disconnect
      if (data === '41') {
        console.log(`  🚫 [${ts()}] 41 DISCONNECT — SSID rejected`);
        done('rejected');
        ws.close();
        return;
      }

      const display = data.length > 300
        ? data.substring(0, 300) + `... [${data.length}B]`
        : data;
      console.log(`  ⬇ [${ts()}] #${msgCount} [${data.length}B]: ${display}`);

      // Engine.IO OPEN
      if (data.startsWith('0{')) {
        try {
          const h = JSON.parse(data.substring(1));
          console.log(`  📋 Handshake: sid=${h.sid}`);
          ws.send('40');
          console.log(`  ⬆ Sent: 40`);
        } catch (e) {
          console.error('  Parse error:', e);
        }
        return;
      }

      // Socket.IO CONNECT ACK
      if (data.startsWith('40')) {
        console.log(`  🔗 Socket.IO connected`);

        // Send auth (like Python _send_handshake)
        const authMsg = formatAuthMessage();
        ws.send(authMsg);
        console.log(`  ⬆ Sent auth [${authMsg.length}B]`);

        // Start keepalive: 42["ps"] every 20s (like Python _ping_loop)
        pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('42["ps"]');
          }
        }, 20000);
        return;
      }

      // Socket.IO EVENT
      if (data.startsWith('42')) {
        try {
          const payload = JSON.parse(data.substring(2));
          const evName = payload[0];
          console.log(`  📨 Event: "${evName}"`);

          if (evName === 'successauth' || evName === 'authenticated') {
            console.log(`  🔐 AUTHENTICATED!`);
            done('success');
            return;
          }
          if (evName === 'NotAuthorized') {
            console.log(`  🚫 NotAuthorized — SSID invalid`);
            done('rejected');
            ws.close();
            return;
          }
        } catch {}
        return;
      }

      // Binary / Payout
      if (data.startsWith('[[5,')) {
        console.log(`  📊 Payout data received`);
      }
    });

    ws.on('error', (err) => {
      console.error(`  ❌ [${ts()}] Error: ${err.message}`);
      done('error');
    });

    ws.on('close', (code) => {
      console.log(`  🔴 [${ts()}] Closed: code=${code}`);
      done('closed');
    });
  });
}

/* ─── Main ─── */
async function main() {
  if (TRY_ALL) {
    console.log(`\n🌍 Trying all regions (isDemo=${IS_DEMO})...\n`);
    const regionList = IS_DEMO
      ? ['DEMO', 'DEMO_2', ...Object.keys(REGIONS).filter(r => !r.startsWith('DEMO'))]
      : Object.keys(REGIONS).filter(r => !r.startsWith('DEMO'));

    for (const name of regionList) {
      const result = await connectToRegion(name, REGIONS[name]);
      if (result.status === 'success') {
        console.log(`\n✅ Connected to ${name}! Listening for messages...\n`);
        console.log('Press Ctrl+C to stop.\n');

        // Keep listening
        result.ws.on('message', (raw) => {
          const data = raw.toString();
          if (data === '2') { result.ws.send('3'); return; }
          if (data === '3') return;
          if (data.startsWith('42')) {
            try {
              const payload = JSON.parse(data.substring(2));
              console.log(`  📨 [${ts()}] ${payload[0]}`);
            } catch {}
            return;
          }
          console.log(`  ⬇ [${ts()}] [${data.length}B] ${data.substring(0, 200)}`);
        });

        result.ws.on('close', () => {
          console.log('\n🔴 Connection closed');
          process.exit(0);
        });
        return;
      }
    }
    console.log('\n❌ All regions failed. SSID is likely expired.\n');
    process.exit(1);
  } else {
    const url = REGIONS[REGION] || REGIONS.EUROPA;
    const result = await connectToRegion(REGION, url);

    if (result.status === 'success') {
      console.log(`\n✅ Connected! Listening...\nPress Ctrl+C to stop.\n`);
      result.ws.on('message', (raw) => {
        const data = raw.toString();
        if (data === '2') { result.ws.send('3'); return; }
        if (data === '3') return;
        if (data.startsWith('42')) {
          try {
            const p = JSON.parse(data.substring(2));
            console.log(`  📨 [${ts()}] ${p[0]} ${JSON.stringify(p[1] || '').substring(0, 200)}`);
          } catch {}
          return;
        }
        console.log(`  ⬇ [${ts()}] [${data.length}B] ${data.substring(0, 200)}`);
      });
      result.ws.on('close', () => { console.log('\n🔴 Closed'); process.exit(0); });
    } else {
      console.log(`\n❌ Failed: ${result.status}`);
      process.exit(1);
    }
  }
}

process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down...');
  setTimeout(() => process.exit(0), 300);
});

main();
