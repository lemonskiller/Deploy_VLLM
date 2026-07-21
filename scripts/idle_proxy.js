#!/usr/bin/env node
'use strict';

const http = require('http');
const { execFile } = require('child_process');

const LISTEN_HOST = process.env.VLLM_IDLE_PROXY_HOST || '172.18.0.1';
const LISTEN_PORT = Number(process.env.VLLM_IDLE_PROXY_PORT || 18002);
const UPSTREAM_HOST = process.env.VLLM_UPSTREAM_HOST || '127.0.0.1';
const UPSTREAM_PORT = Number(process.env.VLLM_UPSTREAM_PORT || 18000);
const IDLE_MS = Number(process.env.VLLM_IDLE_MS || 10 * 60 * 1000);
const READY_TIMEOUT_MS = Number(process.env.VLLM_READY_TIMEOUT_MS || 4 * 60 * 1000);
const CHECK_INTERVAL_MS = Number(process.env.VLLM_IDLE_CHECK_INTERVAL_MS || 30 * 1000);
const VLLM_API_KEY = process.env.VLLM_API_KEY || 'admin';
const DEPLOY_DIR = process.env.VLLM_DEPLOY_DIR || '/nfs/wxz/others/Deploy_VLLM';
const SERVICE = process.env.VLLM_SERVICE || 'vllm-deepseek-r1-8b';

let lastAccess = Date.now();
let inFlight = 0;
let startPromise = null;
let stopPromise = null;

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function runCompose(args) {
  return new Promise((resolve, reject) => {
    execFile(
      'sg',
      ['docker', '-c', `docker compose ${args.join(' ')}`],
      { cwd: DEPLOY_DIR, timeout: 10 * 60 * 1000 },
      (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestModels(timeoutMs) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: UPSTREAM_HOST,
        port: UPSTREAM_PORT,
        path: '/v1/models',
        method: 'GET',
        timeout: timeoutMs,
        headers: {
          Authorization: `Bearer ${VLLM_API_KEY}`,
        },
      },
      (response) => {
        response.resume();
        response.on('end', () => {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`models returned HTTP ${response.statusCode}`));
          }
        });
      },
    );
    request.on('timeout', () => request.destroy(new Error('models request timed out')));
    request.on('error', reject);
    request.end();
  });
}

async function waitUntilReady() {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      await requestModels(3000);
      return;
    } catch (error) {
      lastError = error;
      await sleep(2000);
    }
  }
  throw new Error(`vLLM did not become ready in ${READY_TIMEOUT_MS}ms: ${lastError && lastError.message}`);
}

async function ensureRunning() {
  if (stopPromise) {
    await stopPromise.catch(() => undefined);
  }
  if (!startPromise) {
    startPromise = (async () => {
      log(`starting ${SERVICE}`);
      await runCompose(['up', '-d', SERVICE]);
      await waitUntilReady();
      log(`${SERVICE} ready`);
    })().finally(() => {
      startPromise = null;
    });
  }
  return startPromise;
}

async function stopIfIdle() {
  if (startPromise || stopPromise || inFlight > 0) return;
  const idleFor = Date.now() - lastAccess;
  if (idleFor < IDLE_MS) return;

  stopPromise = (async () => {
    log(`idle for ${Math.round(idleFor / 1000)}s, stopping ${SERVICE}`);
    await runCompose(['stop', SERVICE]);
    log(`${SERVICE} stopped`);
  })().catch((error) => {
    console.error(`[${new Date().toISOString()}] failed to stop ${SERVICE}:`, error.stderr || error.message);
  }).finally(() => {
    stopPromise = null;
    lastAccess = Date.now();
  });
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json',
    Connection: 'close',
  });
  response.end(JSON.stringify(body));
}

function upstreamHeaders(headers) {
  const next = { ...headers };
  delete next.host;
  delete next.connection;
  delete next['content-length'];
  return next;
}

const server = http.createServer(async (clientRequest, clientResponse) => {
  lastAccess = Date.now();
  inFlight += 1;

  try {
    await ensureRunning();
  } catch (error) {
    console.error(`[${new Date().toISOString()}] failed to start ${SERVICE}:`, error.stderr || error.message);
    sendJson(clientResponse, 503, { error: 'vLLM starting failed', message: error.message });
    inFlight -= 1;
    return;
  }

  const upstreamRequest = http.request(
    {
      host: UPSTREAM_HOST,
      port: UPSTREAM_PORT,
      method: clientRequest.method,
      path: clientRequest.url,
      headers: upstreamHeaders(clientRequest.headers),
    },
    (upstreamResponse) => {
      clientResponse.writeHead(upstreamResponse.statusCode, upstreamResponse.headers);
      upstreamResponse.pipe(clientResponse);
      upstreamResponse.on('end', () => {
        inFlight -= 1;
        lastAccess = Date.now();
      });
    },
  );

  upstreamRequest.on('error', (error) => {
    console.error(`[${new Date().toISOString()}] upstream error:`, error.message);
    if (!clientResponse.headersSent) {
      sendJson(clientResponse, 502, { error: 'vLLM upstream unavailable' });
    } else {
      clientResponse.destroy();
    }
    inFlight -= 1;
  });

  clientRequest.on('error', () => {
    upstreamRequest.destroy();
  });
  clientRequest.pipe(upstreamRequest);
});

process.on('uncaughtException', (error) => {
  console.error(`[${new Date().toISOString()}] uncaught exception:`, error);
});

process.on('unhandledRejection', (error) => {
  console.error(`[${new Date().toISOString()}] unhandled rejection:`, error);
});

process.on('exit', (code) => {
  console.log(`[${new Date().toISOString()}] idle proxy exiting with code ${code}`);
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  log(`vLLM idle proxy listening on http://${LISTEN_HOST}:${LISTEN_PORT}, idle=${IDLE_MS}ms`);
});

setInterval(stopIfIdle, CHECK_INTERVAL_MS).unref();
