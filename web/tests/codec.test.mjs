// From web/ after npm ci: node --test tests/codec.test.mjs
// esbuild is supplied by the locked Vite dependency. Bundles are temporary.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { delimiter, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test, { after } from 'node:test';

const { build } = createRequire(import.meta.url)('esbuild');
const output = mkdtempSync(resolve(tmpdir(), 'paid-vote-codec-'));
after(() => rmSync(output, { recursive: true, force: true }));
await build({
  entryPoints: ['evm.ts', 'chain.ts'].map(name => fileURLToPath(new URL(`../src/${name}`, import.meta.url))),
  bundle: true, platform: 'node', format: 'esm', outdir: output,
  outExtension: { '.js': '.mjs' },
  nodePaths: process.env.NODE_PATH?.split(delimiter),
});
const { encodeFunctionData, decodeFunctionResult, formatEther } = await import(pathToFileURL(resolve(output, 'evm.mjs')));
const { parseAmount, voteData } = await import(pathToFileURL(resolve(output, 'chain.mjs')));
const contract = JSON.parse(readFileSync(new URL('../src/contract.json', import.meta.url), 'utf8'));
const maximum = (1n << 256n) - 1n;
const maximumEther = '115792089237316195423570985008687907853269984665640564039457.584007913129639935';
const account = `0x${'aB'.repeat(20)}`;
const word = value => value.toString(16).padStart(64, '0');

test('all five used function selectors match independent Foundry cast sig results', () => {
  // Generated with `cast sig` using signatures derived from this exact JSON ABI.
  const selectors = {
    'getTopPayers()': '0x6b0e442e',
    'totalPaid(address)': '0x3dd6d533',
    'totalReceived()': '0xa3c2c462',
    'totalVotes()': '0x0d15fd77',
    'vote()': '0x632a9a52',
  };
  for (const [signature, selector] of Object.entries(selectors)) {
    const name = signature.split('(')[0];
    const item = contract.abi.find(item => item.type === 'function' && item.name === name);
    assert.ok(item, `${name} must exist in the deployed ABI`);
    assert.equal(`${name}(${item.inputs.map(input => input.type).join(',')})`, signature);
    const encoded = encodeFunctionData({ functionName: name, args: name === 'totalPaid' ? [account] : [] });
    assert.equal(encoded.slice(0, 10), selector);
  }
  assert.equal(voteData, selectors['vote()']);
});

test('totalPaid encodes one left-padded, normalized 20-byte address', () => {
  assert.equal(encodeFunctionData({ functionName: 'totalPaid', args: [account] }),
    `0x3dd6d533000000000000000000000000${account.slice(2).toLowerCase()}`);
  assert.equal(encodeFunctionData({ functionName: 'totalPaid', args: [contract.address] }).length, 74);
});

test('unsupported functions and invalid argument counts/types are rejected', () => {
  for (const input of [
    { functionName: 'missing' },
    { functionName: 'totalPaid' },
    { functionName: 'vote', args: [account] },
    { functionName: 'totalPaid', args: ['0x1234'] },
    { functionName: 'totalPaid', args: [123] },
    { functionName: 'topPayers', args: [0n] },
  ]) assert.throws(() => encodeFunctionData(input));
});

test('all used uint256 outputs retain zero, one wei, and the full uint256 maximum', () => {
  for (const functionName of ['totalPaid', 'totalReceived', 'totalVotes']) {
    for (const value of [0n, 1n, 9007199254740993n, maximum]) {
      assert.equal(decodeFunctionResult({ functionName, data: `0x${word(value)}` }), value);
    }
  }
});

test('top three fixed arrays decode in ABI order without losing integer precision', () => {
  const payers = [contract.address, account.toLowerCase(), `0x${'0'.repeat(40)}`];
  const amounts = [maximum, 9007199254740993n, 1n];
  const data = `0x${payers.map(value => value.slice(2).padStart(64, '0')).join('')}${amounts.map(word).join('')}`;
  assert.equal(data.length, 386);
  assert.deepEqual(decodeFunctionResult({ functionName: 'getTopPayers', data }), [payers, amounts]);
});

test('malformed responses and nonzero address padding are rejected', () => {
  const valid = `0x${'0'.repeat(384)}`;
  for (const data of [undefined, '0x', '0xzz', valid.slice(0, -1), `${valid}00`, `0x1${valid.slice(3)}`]) {
    assert.throws(() => decodeFunctionResult({ functionName: 'getTopPayers', data }));
  }
  assert.throws(() => decodeFunctionResult({ functionName: 'totalVotes', data: '0x01' }));
  assert.throws(() => decodeFunctionResult({ functionName: 'totalVotes', data: `0x${'0'.repeat(65)}` }));
  assert.throws(() => decodeFunctionResult({ functionName: 'vote', data: `0x${word(0n)}` }));
});

test('ether formatting keeps exact decimal strings across the unsigned range', () => {
  for (const [value, expected] of [
    [0n, '0'], [1n, '0.000000000000000001'], [10n ** 18n, '1'],
    [1234500000000000000n, '1.2345'], [maximum, maximumEther],
  ]) assert.equal(formatEther(value), expected);
});

test('amount parsing accepts one wei and exact decimal amounts up to uint256 maximum', () => {
  for (const [input, expected] of [
    ['0.000000000000000001', 1n], ['1', 10n ** 18n], ['1.', 10n ** 18n],
    ['.5', 500000000000000000n], [' 0.001 ', 1000000000000000n],
    ['0001.005', 1005000000000000000n], [maximumEther, maximum],
  ]) assert.equal(parseAmount(input), expected);
});

test('zero, negative, exponent, malformed, and overprecision amounts are rejected', () => {
  for (const input of ['', ' ', '.', '0', '0.0', '-1', '+1', '1e-3', '0x10', 'NaN',
    'Infinity', '1_000', '1,5', '1.2.3', '0.0000000000000000001', '1.0000000000000000000']) {
    assert.throws(() => parseAmount(input), undefined, input);
  }
});

test('uint256 overflow is rejected without Number rounding', () => {
  assert.throws(() => parseAmount('115792089237316195423570985008687907853269984665640564039457.584007913129639936'), /smaller/);
  assert.throws(() => parseAmount('9'.repeat(100)), /smaller/);
});
