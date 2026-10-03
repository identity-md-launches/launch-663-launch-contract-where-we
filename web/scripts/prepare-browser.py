#!/usr/bin/env python3
"""Prepare production-byte routes and mock RPC for the assigned Playwright tool.
Requires `cast` only to independently derive selectors for the mock fixture.
No test fixture is included in dist or imported by production source.
"""
import base64
import json
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
out = root / 'test/scratch/browser'
out.mkdir(parents=True, exist_ok=True)
mimes = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.txt': 'text/plain'}
assets = {'/preview/' + path.relative_to(root / 'dist').as_posix(): {
    'data': base64.b64encode(path.read_bytes()).decode(),
    'mime': mimes[path.suffix],
} for path in (root / 'dist').rglob('*') if path.is_file()}
source = '''async (page) => {
const assets = ASSETS;
await page.unroute('http://localhost:4173/**');
await page.route('http://localhost:4173/**', route => {
  const url = new URL(route.request().url());
  const asset = assets[url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname];
  return route.fulfill(asset ? { status: 200, contentType: asset.mime, body: Buffer.from(asset.data, 'base64') } : { status: 404, body: 'Missing export asset' });
});
await page.setViewportSize({ width: 1280, height: 950 });
await page.goto('http://localhost:4173/preview/');
return { title: await page.title(), files: Object.keys(assets) };
}'''
(out / 'serve-export.js').write_text(source.replace('ASSETS', json.dumps(assets)))
contract = json.loads((root / 'web/src/contract.json').read_text())
contract['selectors'] = {name: subprocess.check_output([
    'cast', 'sig', name + ('(address)' if name == 'totalPaid' else '()'),
], text=True).strip() for name in ['getTopPayers', 'totalVotes', 'totalReceived', 'totalPaid', 'vote']}
(out / 'mock-setup.js').write_text((root / 'web/tests/browser-interactions.js').read_text().replace('FIXTURE', json.dumps(contract)))
print('Prepared test/scratch/browser/serve-export.js and mock-setup.js')
