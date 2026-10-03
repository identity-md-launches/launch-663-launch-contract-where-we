// Small codec for this contract's static ABI; no transaction signing happens here.
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import contract from './contract.json';
export type Hex = `0x${string}`;

export function encodeFunctionData({ functionName, args = [] }: { functionName: string; args?: readonly unknown[] }): Hex {
  const entry = contract.abi.find(item => item.type === 'function' && item.name === functionName);
  if (!entry || !('inputs' in entry) || !entry.inputs || entry.inputs.length !== args.length) throw new Error('Invalid ABI function');
  const signature = `${functionName}(${entry.inputs.map(input => input.type).join(',')})`;
  const selector = bytesToHex(keccak_256(utf8ToBytes(signature))).slice(0, 8);
  const argumentsHex = entry.inputs.map((input, i) => {
    if (input.type !== 'address' || typeof args[i] !== 'string' || !/^0x[\da-f]{40}$/i.test(args[i] as string)) throw new Error('Unsupported ABI argument');
    return (args[i] as string).slice(2).toLowerCase().padStart(64, '0');
  }).join('');
  return `0x${selector}${argumentsHex}`;
}

export function decodeFunctionResult({ functionName, data }: { functionName: string; data: string }): bigint | [string[], bigint[]] {
  if (typeof data !== 'string' || !/^0x[\da-f]+$/i.test(data)) throw new Error('Invalid contract response');
  const entry = contract.abi.find(item => item.type === 'function' && item.name === functionName);
  const types = entry && 'outputs' in entry ? entry.outputs?.map(output => output.type) : [];
  if (types?.join(',') === 'address[3],uint256[3]' && data.length === 386) {
    const words = Array.from({ length: 6 }, (_, i) => data.slice(2 + i * 64, 66 + i * 64));
    if (words.slice(0, 3).some(word => !/^0{24}/.test(word))) throw new Error('Invalid address response');
    return [words.slice(0, 3).map(word => `0x${word.slice(24)}`), words.slice(3).map(word => BigInt(`0x${word}`))];
  }
  if (types?.join(',') === 'uint256' && data.length === 66) return BigInt(data);
  throw new Error('Unsupported contract response');
}

export function parseEther(input: string): bigint {
  const [whole, fraction = ''] = input.split('.');
  return BigInt(whole || '0') * 10n ** 18n + BigInt(fraction.padEnd(18, '0'));
}

export function formatEther(value: bigint): string {
  const whole = value / 10n ** 18n;
  const fraction = (value % 10n ** 18n).toString().padStart(18, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
