// Run as a Playwright browser-tool function after loading the production export.
// PREPARE injects contract fixtures; this file itself contains no production mock path.
async (page) => {
  const cfg = FIXTURE;
  await page.addInitScript(({ runtimeBytecode, address, selectors }) => {
    const first = '0x1111111111111111111111111111111111111111';
    window.__mock = {
      accounts: [], first, chain: '0x1', runtimeBytecode, address, selectors,
      receipt: null, votes: '12', amounts: ['30000000000000000', '20000000000000000', '10000000000000000'],
      payers: [first, '0x2222222222222222222222222222222222222222', '0x3333333333333333333333333333333333333333'],
      paid: '30000000000000000', received: '60000000000000000', balance: '0x8ac7230489e80000',
      sent: [], calls: [], reject: false, unknownChain: true, offline: false, badCode: false, delayAccounts: false,
    };
    const events = {};
    window.ethereum = {
      on: (name, listener) => { (events[name] ||= []).push(listener); },
      removeListener: (name, listener) => { events[name] = (events[name] || []).filter(item => item !== listener); },
      request: async ({ method, params }) => {
        const state = window.__mock;
        state.calls.push(method);
        if (state.reject && ['eth_requestAccounts', 'eth_sendTransaction', 'wallet_switchEthereumChain'].includes(method)) throw { code: 4001 };
        switch (method) {
          case 'eth_accounts':
            if (state.delayAccounts) { const old = [...state.accounts]; await new Promise(resolve => window.__resolveAccounts = resolve); return old; }
            return state.accounts;
          case 'eth_chainId': return state.chain;
          case 'eth_requestAccounts': state.accounts = [first]; return state.accounts;
          case 'wallet_addEthereumChain': state.unknownChain = false; return null;
          case 'wallet_switchEthereumChain':
            if (state.unknownChain) throw { code: 4902 };
            state.chain = params[0].chainId; (events.chainChanged || []).forEach(fn => fn(state.chain)); return null;
          case 'eth_getCode': return state.badCode ? '0x00' : state.runtimeBytecode;
          case 'eth_call':
            if (state.changeDuringPreflight) {
              state.accounts = ['0x4444444444444444444444444444444444444444'];
              (events.accountsChanged || []).forEach(fn => fn(state.accounts));
              state.changeDuringPreflight = false;
            }
            return '0x';
          case 'eth_estimateGas': return '0x186a0';
          case 'eth_gasPrice': return '0x3b9aca00';
          case 'eth_getBalance': return state.balance;
          case 'eth_sendTransaction': state.sent.push(params[0]); return '0x' + 'a'.repeat(64);
          default: throw new Error('Unexpected wallet method: ' + method);
        }
      },
    };
    window.__emitWallet = (name, value) => (events[name] || []).forEach(fn => fn(value));
  }, cfg);
  await page.route(/https:\/\/(ethereum-sepolia-rpc\.publicnode\.com|rpc\.sepolia\.ethpandaops\.io|sepolia\.rpc\.sentio\.xyz)\/?$/, async route => {
    const state = await page.evaluate(() => window.__mock);
    if (state.offline) return route.fulfill({ status: 503, body: 'Mock RPC outage' });
    const { id, method, params } = route.request().postDataJSON();
    const word = value => BigInt(value).toString(16).padStart(64, '0');
    let result;
    if (method === 'eth_chainId') result = '0xaa36a7';
    else if (method === 'eth_blockNumber') result = '0xb49100';
    else if (method === 'eth_getCode') result = state.runtimeBytecode;
    else if (method === 'eth_getTransactionReceipt') result = state.receipt ? { status: state.receipt } : null;
    else if (method === 'eth_call') {
      const selector = params[0].data.slice(0, 10);
      if (selector === state.selectors.getTopPayers) result = '0x' + state.payers.map(a => a.slice(2).padStart(64, '0')).join('') + state.amounts.map(word).join('');
      else if (selector === state.selectors.totalVotes) result = '0x' + word(state.votes);
      else if (selector === state.selectors.totalReceived) result = '0x' + word(state.received);
      else if (selector === state.selectors.totalPaid) result = '0x' + word(state.paid);
      else throw new Error('Unexpected read selector ' + selector);
    } else throw new Error('Unexpected RPC method ' + method);
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id, result }) });
  });
  await page.reload();
  await page.waitForFunction(() => document.querySelector('.sync-status').textContent.includes('Onchain'));
  return 'Mock wallet and public RPC initialized; no live signing or broadcast.';
}
