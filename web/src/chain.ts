import { decodeFunctionResult, encodeFunctionData, formatEther, parseEther, type Hex } from './evm';
import contract from './contract.json';

export { contract, formatEther };
export const address = contract.address as Hex;
export const voteData = encodeFunctionData({ functionName: 'vote' });
export const shortAddress = (value: string) => `${value.slice(0, 6)}...${value.slice(-4)}`;
export type Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};
export type Wallet = { id: string; name: string; provider: Provider };
declare global { interface Window { ethereum?: Provider } }
export type Snapshot = {
  payers: readonly string[]; amounts: readonly bigint[];
  totalVotes: bigint; totalReceived: bigint; paid: bigint | null; block: string;
};
let requestId = 0;
let preferredRpc = 0;

async function fetchRpc(url: string, method: string, params: unknown[] = []) {
  const response = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('RPC unavailable');
  const body = await response.json();
  if (body.error || body.result === undefined) throw new Error('RPC unavailable');
  return body.result;
}

async function withRpc<T>(work: (rpc: (method: string, params?: unknown[]) => Promise<any>) => Promise<T>): Promise<T> {
  for (let offset = 0; offset < contract.network.rpcUrls.length; offset++) {
    const index = (preferredRpc + offset) % contract.network.rpcUrls.length;
    const rpc = (method: string, params: unknown[] = []) => fetchRpc(contract.network.rpcUrls[index], method, params);
    try {
      if (Number(await rpc('eth_chainId')) !== contract.chainId) continue;
      const result = await work(rpc);
      preferredRpc = index;
      return result;
    } catch { /* A different pinned RPC may still be available. */ }
  }
  throw new Error('Unable to read Sepolia. Check your connection and retry.');
}

export async function readSnapshot(account?: string): Promise<Snapshot> {
  return withRpc(async rpc => {
    const block = await rpc('eth_blockNumber') as string;
    const code = await rpc('eth_getCode', [address, block]);
    if (code.toLowerCase() !== contract.runtimeBytecode.toLowerCase()) throw new Error('Unverified contract');
    const read = async (functionName: string, args: readonly unknown[] = []) => {
      const data = encodeFunctionData({ functionName, args });
      const result = await rpc('eth_call', [{ to: address, data }, block]);
      return decodeFunctionResult({ functionName, data: result });
    };
    const [leaders, totalVotes, totalReceived, paid] = await Promise.all([
      read('getTopPayers'), read('totalVotes'), read('totalReceived'),
      account ? read('totalPaid', [account]) : Promise.resolve(null),
    ]);
    const [payers, amounts] = leaders as [readonly string[], readonly bigint[]];
    return { payers, amounts, totalVotes: totalVotes as bigint, totalReceived: totalReceived as bigint, paid: paid as bigint | null, block };
  });
}

export function parseAmount(input: string): bigint {
  if (!/^(?:\d+(?:\.\d{0,18})?|\.\d{1,18})$/.test(input.trim())) {
    throw new Error('Enter an ETH amount with up to 18 decimals.');
  }
  const amount = parseEther(input.trim());
  if (amount <= 0n) throw new Error('Enter an amount greater than 0.');
  if (amount >= 2n ** 256n) throw new Error('Enter a smaller amount.');
  return amount;
}

export async function verifyWallet(provider: Provider, account: string) {
  if (Number(await provider.request({ method: 'eth_chainId' })) !== contract.chainId) {
    throw new Error('Switch to Sepolia to vote.');
  }
  const accounts = await provider.request({ method: 'eth_accounts' }) as string[];
  if (accounts[0]?.toLowerCase() !== account.toLowerCase()) throw new Error('Wallet changed. Review the amount and try again.');
  const code = await provider.request({ method: 'eth_getCode', params: [address, 'latest'] });
  if (typeof code !== 'string' || code.toLowerCase() !== contract.runtimeBytecode.toLowerCase()) {
    throw new Error('Contract verification failed. Reconnect to Sepolia and retry.');
  }
}

export async function sendVote(provider: Provider, account: string, value: bigint, isCurrent: () => boolean): Promise<Hex> {
  await verifyWallet(provider, account);
  const transaction = { chainId: contract.walletAddChain.chainId, from: account, to: address, data: voteData, value: `0x${value.toString(16)}` };
  await provider.request({ method: 'eth_call', params: [transaction, 'latest'] });
  const gas = BigInt(await provider.request({ method: 'eth_estimateGas', params: [transaction] }) as string);
  const gasPrice = BigInt(await provider.request({ method: 'eth_gasPrice' }) as string);
  const balance = BigInt(await provider.request({ method: 'eth_getBalance', params: [account, 'latest'] }) as string);
  if (balance < value + gas * gasPrice) throw new Error('Not enough Sepolia ETH for the vote and gas.');
  await verifyWallet(provider, account);
  if (!isCurrent()) throw new Error('Wallet changed. Review the amount and try again.');
  const hash = await provider.request({ method: 'eth_sendTransaction', params: [transaction] });
  if (typeof hash !== 'string' || !/^0x[\da-f]{64}$/i.test(hash)) throw new Error('Wallet returned no transaction hash. Check your wallet before retrying.');
  return hash as Hex;
}

export async function readReceipt(hash: string): Promise<'pending' | 'confirmed' | 'reverted'> {
  return withRpc(async rpc => {
    const receipt = await rpc('eth_getTransactionReceipt', [hash]);
    if (!receipt) return 'pending';
    return BigInt(receipt.status) === 1n ? 'confirmed' : 'reverted';
  });
}

export async function switchChain(provider: Provider) {
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: contract.walletAddChain.chainId }] });
  } catch (error) {
    if ((error as { code?: number }).code !== 4902) throw error;
    await provider.request({ method: 'wallet_addEthereumChain', params: [contract.walletAddChain] });
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: contract.walletAddChain.chainId }] });
  }
}

export function friendlyError(error: unknown): string {
  const e = error as { code?: number; message?: string };
  if (e.code === 4001) return 'Request cancelled. Try again when ready.';
  if (e.code === -32002) return 'A request is already open. Check your wallet.';
  if (/insufficient funds/i.test(e.message ?? '')) return 'Not enough Sepolia ETH for the vote and gas.';
  const known = ['Enter ', 'Switch to ', 'Wallet changed.', 'Contract verification failed.', 'Not enough ', 'Wallet returned ', 'Unable to read '];
  if (known.some(prefix => e.message?.startsWith(prefix))) return e.message!;
  return 'Unable to continue. Check your wallet and connection, then retry.';
}
