// The highest-value test in the WebMCP rollout: it catches the in-page tool surface
// (public/webmcp.js) drifting from the HTTP MCP server (src/mcp.js). Both must expose the
// same tool names and input schemas, or an agent gets different answers depending on
// whether it reached sidewise via a browser or via `POST /mcp`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TOOLS as SERVER_TOOLS } from '../src/mcp.js';

const webmcpSrc = readFileSync(
  fileURLToPath(new URL('../public/webmcp.js', import.meta.url)), 'utf8',
);

// public/webmcp.js is a browser IIFE with no exports, so extract its TOOLS array literal
// the same way a browser would build it: run the whole file body and grab the local
// binding right before it's consumed by the registration loop.
function loadWebmcpTools() {
  const stub = {
    document: {
      modelContext: {
        registerTool(tool) {
          captured.push(tool);
        },
      },
    },
    fetch: async () => ({ json: async () => ({}) }),
    console,
    URLSearchParams,
  };
  const captured = [];
  const fn = new Function(
    'document', 'fetch', 'console', 'URLSearchParams',
    webmcpSrc,
  );
  fn(stub.document, stub.fetch, stub.console, stub.URLSearchParams);
  return captured;
}

test('webmcp.js registers a tool for every src/mcp.js tool, and nothing extra', () => {
  const webTools = loadWebmcpTools();
  assert.deepEqual(
    webTools.map(t => t.name).sort(),
    SERVER_TOOLS.map(t => t.name).sort(),
  );
});

test('webmcp.js input schemas match src/mcp.js exactly', () => {
  const webTools = loadWebmcpTools();
  const byName = Object.fromEntries(webTools.map(t => [t.name, t]));
  for (const serverTool of SERVER_TOOLS) {
    const webTool = byName[serverTool.name];
    assert.ok(webTool, `webmcp.js is missing tool ${serverTool.name}`);
    assert.deepEqual(webTool.inputSchema, serverTool.inputSchema, serverTool.name);
  }
});

test('every webmcp.js tool has an execute function and no requiresConfirmation', () => {
  const webTools = loadWebmcpTools();
  for (const t of webTools) {
    assert.equal(typeof t.execute, 'function', t.name);
    assert.equal(t.requiresConfirmation, undefined, `${t.name} is read-only, should not require confirmation`);
  }
});
