#!/usr/bin/env node
/**
 * Wraps `next dev` to print a real Network URL on startup.
 *
 * Next 14 only echoes back whatever host you pass with -H, so
 * `next dev -H 0.0.0.0` prints "Network: http://0.0.0.0:PORT" - not an
 * address anyone else can actually type into a browser. Newer Next
 * versions (with Turbopack) resolve this to the real LAN IP; this does the
 * same thing for 14 by reading the machine's own interfaces.
 *
 * Runs next dev bound to 0.0.0.0 underneath either way, so the app was
 * already reachable on the LAN before this existed - this only fixes what
 * gets printed.
 */
import os from 'os';
import { spawn } from 'child_process';

const PORT = process.env.PORT || '3010';

function lanAddresses() {
  const nets = os.networkInterfaces();
  const out = [];
  for (const [name, addrs] of Object.entries(nets)) {
    for (const addr of addrs ?? []) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      // Hyper-V's "Default Switch" and similar virtual/host-only adapters
      // are never the address another machine on the real network would
      // use to reach this one. Two independent signals catch them: the
      // adapter name, and the address itself - a host-only or virtual
      // switch is conventionally the ".1" address on its subnet, which a
      // real client-assigned LAN address essentially never is (that is
      // the router, or the virtual switch's own host side).
      const looksVirtual = /^vEthernet|Virtual|Loopback|Hyper-V/i.test(name);
      const looksHostOnly = /\.1$/.test(addr.address);
      out.push({ name, address: addr.address, looksVirtual: looksVirtual || looksHostOnly });
    }
  }
  return out;
}

const addrs = lanAddresses();
const real = addrs.filter((a) => !a.looksVirtual);
const chosen = real[0] ?? addrs[0];

console.log('\n  ▲ Starting Next.js dev server\n');
console.log(`  - Local:    http://localhost:${PORT}`);
if (chosen) {
  console.log(`  - Network:  http://${chosen.address}:${PORT}  (${chosen.name})`);
}
for (const a of addrs) {
  if (a !== chosen) {
    console.log(`              http://${a.address}:${PORT}  (${a.name}${a.looksVirtual ? ', virtual adapter' : ''})`);
  }
}
console.log('');

const child = spawn('npx', ['next', 'dev', '-H', '0.0.0.0', '-p', PORT], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
child.on('exit', (code) => process.exit(code ?? 0));

