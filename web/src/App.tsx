import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { contract, formatEther, shortAddress, readSnapshot, parseAmount, sendVote, readReceipt, switchChain, friendlyError, type Provider, type Snapshot, type Wallet } from './chain';

const wordmark = String.raw` __     __  ___   _____  _____
 \ \   / / / _ \ |_   _|| ____|
  \ \ / / | | | |  | |  |  _|
   \ V /  | |_| |  | |  | |___
    \_/    \___/   |_|  |_____|`;
const emptyAddress = /^0x0{40}$/i;
const explorer = contract.network.explorer;
function rememberedHash() {
  try { const hash = sessionStorage.getItem('paid.vote.pending'); return hash && /^0x[\da-f]{64}$/i.test(hash) ? hash : ''; }
  catch { return ''; }
}
function remember(hash: string) {
  try { if (hash) sessionStorage.setItem('paid.vote.pending', hash); else sessionStorage.removeItem('paid.vote.pending'); } catch { /* Storage may be disabled. */ }
}

export function App() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [selected, setSelected] = useState('');
  const provider = wallets.find(wallet => wallet.id === selected)?.provider ?? wallets[0]?.provider;
  const [account, setAccount] = useState('');
  const [chain, setChain] = useState<number>();
  const [amount, setAmount] = useState('0.001');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [hash, setHash] = useState(rememberedHash);
  const [pending, setPending] = useState(() => Boolean(rememberedHash()));
  const [receiptWarning, setReceiptWarning] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const walletVersion = useRef(0);
  const requestVersion = useRef(0);
  const actionLock = useRef(false);
  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      const data = await readSnapshot(account || undefined);
      if (version !== requestVersion.current) return;
      setSnapshot(data); setLoadError('');
    } catch (err) {
      if (version === requestVersion.current) setLoadError(friendlyError(err));
    } finally { if (version === requestVersion.current) setLoading(false); }
  }, [account]);

  useEffect(() => {
    const addWallet = (event: Event) => {
      const detail = (event as CustomEvent<{ info: { uuid: string; name: string }; provider: Provider }>).detail;
      if (!detail?.provider?.request || !detail.info?.uuid) return;
      setWallets(current => current.some(w => w.provider === detail.provider) ? current : [...current, { id: detail.info.uuid, name: detail.info.name, provider: detail.provider }]);
    };
    window.addEventListener('eip6963:announceProvider', addWallet);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    if (window.ethereum) setWallets(current => current.some(w => w.provider === window.ethereum) ? current : [...current, { id: 'injected', name: 'Browser wallet', provider: window.ethereum! }]);
    return () => window.removeEventListener('eip6963:announceProvider', addWallet);
  }, []);

  useEffect(() => {
    walletVersion.current++;
    setAccount(''); setChain(undefined);
    if (!provider) return;
    let alive = true;
    let accountEvents = 0;
    let chainEvents = 0;
    const changeAccounts = (...args: unknown[]) => {
      walletVersion.current++; accountEvents++;
      const accounts = args[0] as string[];
      setAccount(/^0x[\da-f]{40}$/i.test(accounts?.[0] ?? '') ? accounts[0] : '');
      setSnapshot(data => data ? { ...data, paid: null } : null);
    };
    const changeChain = (...args: unknown[]) => { walletVersion.current++; chainEvents++; setChain(Number(args[0])); };
    const disconnect = () => { walletVersion.current++; accountEvents++; chainEvents++; setAccount(''); setChain(undefined); };
    provider.on?.('accountsChanged', changeAccounts);
    provider.on?.('chainChanged', changeChain);
    provider.on?.('disconnect', disconnect);
    void Promise.all([provider.request({ method: 'eth_accounts' }), provider.request({ method: 'eth_chainId' })]).then(([accounts, chainId]) => {
      if (alive) { if (!accountEvents) changeAccounts(accounts); if (!chainEvents) changeChain(chainId); }
    }).catch(() => { /* Connection stays an explicit, recoverable action. */ });
    return () => {
      alive = false;
      provider.removeListener?.('accountsChanged', changeAccounts);
      provider.removeListener?.('chainChanged', changeChain);
      provider.removeListener?.('disconnect', disconnect);
    };
  }, [provider]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 30000);
    return () => { clearInterval(timer); requestVersion.current++; };
  }, [refresh]);

  useEffect(() => {
    if (!pending || !hash) return;
    let stopped = false;
    let timer: number;
    const poll = async () => {
      try {
        const result = await readReceipt(hash);
        if (stopped) return;
        if (result !== 'pending') {
          remember(''); setPending(false); setReceiptWarning('');
          if (result === 'confirmed') { setNotice('Vote confirmed.'); void refresh(); }
          else setError('Vote reverted. No payment recorded; gas may still be charged.');
          return;
        }
        setReceiptWarning('');
      } catch { if (!stopped) setReceiptWarning('Confirmation unavailable. Check the transaction before voting again.'); }
      if (!stopped) timer = window.setTimeout(poll, 5000);
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [pending, hash, refresh]);

  async function connect() {
    if (actionLock.current) return;
    setError(''); setNotice('');
    if (!provider) { setError('No wallet found. Open this site in a wallet browser or enable a browser wallet, then reload.'); return; }
    actionLock.current = true; setBusy(true);
    try {
      const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[];
      if (!/^0x[\da-f]{40}$/i.test(accounts[0] ?? '')) throw new Error('No account');
      setAccount(accounts[0]);
      setChain(Number(await provider.request({ method: 'eth_chainId' })));
    } catch (err) { setError(friendlyError(err)); }
    finally { actionLock.current = false; setBusy(false); }
  }
  async function changeNetwork() {
    if (!provider || actionLock.current) return;
    actionLock.current = true; setBusy(true); setError('');
    try { await switchChain(provider); setChain(Number(await provider.request({ method: 'eth_chainId' }))); }
    catch (err) { setError(friendlyError(err)); }
    finally { actionLock.current = false; setBusy(false); }
  }
  async function vote(event: FormEvent) {
    event.preventDefault();
    if (actionLock.current || pending) return;
    setFieldError(''); setError(''); setNotice('');
    let value: bigint;
    try { value = parseAmount(amount); }
    catch (err) { setFieldError(friendlyError(err)); inputRef.current?.focus(); return; }
    if (!account) { await connect(); return; }
    if (chain !== contract.chainId) { await changeNetwork(); return; }
    if (!provider || !snapshot || loadError) { setError('Refresh the board before voting.'); return; }
    actionLock.current = true; setBusy(true); setNotice('Confirm the vote in your wallet.'); setHash('');
    const version = walletVersion.current;
    try {
      const result = await sendVote(provider, account, value, () => version === walletVersion.current);
      remember(result); setHash(result); setPending(true); setNotice('');
    } catch (err) { setNotice(''); setError(friendlyError(err)); }
    finally { actionLock.current = false; setBusy(false); }
  }
  const wrongChain = Boolean(account) && chain !== contract.chainId;
  const actionLabel = busy ? 'Check wallet...' : pending ? 'Vote pending...' : !account ? 'Connect wallet' : wrongChain ? 'Switch to Sepolia' : 'Vote';
  const disabled = busy || pending || Boolean(account && !wrongChain && (!snapshot || loadError));

  return (
    <div className="shell">
      <a className="skip" href="#main">Skip to content</a>
      <header className="header">
        <a href="#" className="brand" aria-label="paid.vote home"><span aria-hidden="true">[v_]</span> paid.vote</a>
        <div className="header-actions">
          <span className="network"><span aria-hidden="true">*</span> Sepolia <span className="testnet">testnet</span></span>
          <button className="connect" onClick={account ? () => { walletVersion.current++; setAccount(''); setNotice(''); setError(''); } : connect} disabled={busy || pending}>
            {account ? '[ disconnect ]' : '[ connect wallet ]'}
          </button>
        </div>
      </header>
      {wallets.length > 1 && <div className="wallet-select"><label htmlFor="wallet">Wallet</label><select id="wallet" value={selected || wallets[0].id} disabled={busy || pending} onChange={event => setSelected(event.target.value)}>{wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>}
      <main id="main">
        <section className="hero" aria-labelledby="title">
          <div><p className="eyebrow">A public record, onchain.</p><h1 id="title"><span className="sr-only">Paid voting</span><span className="ascii" aria-hidden="true">{wordmark}</span></h1></div>
          <p className="hero-note">Pay to vote.<br />Make the top 3.<span className="ascii-arrow" aria-hidden="true">[ ↓ ]</span></p>
        </section>
        <div className="workspace">
          <section className="vote-panel" aria-labelledby="vote-title">
            <div className="section-heading"><span className="section-index" aria-hidden="true">01 /</span><h2 id="vote-title">Cast a vote</h2></div>
            <form onSubmit={vote} noValidate>
              <label htmlFor="amount" className="amount-label">Amount <span>Sepolia ETH</span></label>
              <div className={`amount-field ${fieldError ? 'invalid' : ''}`}><input ref={inputRef} id="amount" name="amount" inputMode="decimal" autoComplete="off" spellCheck={false} value={amount} onChange={e => { setAmount(e.target.value); setFieldError(''); }} aria-invalid={Boolean(fieldError)} aria-describedby={fieldError ? 'amount-error payment-note' : 'payment-note'} disabled={busy || pending} /><span aria-hidden="true">ETH</span></div>
              {fieldError && <p id="amount-error" className="error" role="alert">{fieldError}</p>}
              <div className="presets" aria-label="Suggested amounts">{['0.001', '0.005', '0.01'].map(value => <button key={value} type="button" aria-pressed={amount === value} onClick={() => { setAmount(value); setFieldError(''); }} disabled={busy || pending}>{value}</button>)}</div>
              <div className="wallet-summary"><span>{account ? <a href={`${explorer}/address/${account}`} target="_blank" rel="noreferrer" aria-label={`Wallet ${account} on Etherscan`} title={account}>{shortAddress(account)}</a> : 'Wallet not connected'}</span><span>{account && snapshot?.paid !== null && snapshot?.paid !== undefined ? `${formatEther(snapshot.paid)} ETH paid` : '[ — ]'}</span></div>
              <button className="primary" type="submit" disabled={disabled}><span>{actionLabel}</span><span aria-hidden="true">{busy || pending ? '[...]' : '->'}</span></button>
              <p id="payment-note" className="payment-note">ETH stays in the contract. Forever.<br />No refunds or rewards. Gas is extra.</p>
            </form>
            <div className="feedback" role="status" aria-live="polite">{pending ? 'Waiting for confirmation.' : notice}{hash && <a href={`${explorer}/tx/${hash}`} target="_blank" rel="noreferrer">View transaction ↗</a>}</div>
            {pending && <button className="stop-tracking" onClick={() => { if (window.confirm('The transaction may still confirm. Check your wallet before voting again. Stop tracking this transaction?')) { remember(''); setPending(false); setReceiptWarning(''); setNotice('Tracking stopped. Check the transaction before voting again.'); } }}>Stop tracking</button>}
            {(error || receiptWarning) && <p className="error" role="alert">{error || receiptWarning}</p>}
            {(wrongChain || error.includes('Not enough')) && <a className="faucet" href={contract.network.faucets[0]} target="_blank" rel="noreferrer">Get Sepolia test ETH ↗</a>}
          </section>
          <section className="leaders-panel" aria-labelledby="leaders-title" aria-busy={loading}>
            <div className="section-heading"><span className="section-index" aria-hidden="true">02 /</span><h2 id="leaders-title">Top 3 voters</h2><button className="refresh" onClick={() => void refresh()} disabled={loading} aria-label="Refresh leaderboard">{loading ? '[ ... ]' : '[ refresh ]'}</button></div>
            <div className="board-labels" aria-hidden="true"><span>Rank / wallet</span><span>Total ETH</span></div>
            <ol className="leaderboard">{[0, 1, 2].map(index => {
              const payer = snapshot?.payers[index];
              const vacant = payer && emptyAddress.test(payer);
              return <li key={index} className={index === 0 ? 'first-place' : ''}>
                <span className="rank" aria-label={`Rank ${index + 1}`}>{`0${index + 1}`}</span>
                <div className="voter">{payer && !vacant ? <><a href={`${explorer}/address/${payer}`} target="_blank" rel="noreferrer" title={payer} aria-label={`Voter ${payer} on Etherscan`}>{shortAddress(payer)} <span aria-hidden="true">↗</span></a>{payer.toLowerCase() === account.toLowerCase() && <span className="you">[ you ]</span>}</> : <span className="empty">{vacant ? 'Open spot' : loading ? 'Loading...' : 'Unavailable'}</span>}</div>
                <span className="score">{snapshot && !vacant ? formatEther(snapshot.amounts[index]) : '—'}{snapshot && !vacant && <span className="sr-only"> ETH paid</span>}</span>
              </li>;
            })}</ol>
            <p className="ranking-note">Ranked by total ETH paid. Ties keep their place.</p>
            {loadError && <p className="error" role="alert">{snapshot ? 'Board may be outdated. ' : ''}{loadError}</p>}
            <div className="board-foot"><span aria-hidden="true">+ — — — +</span><span>{loadError ? 'Connection interrupted' : !snapshot ? 'Reading chain...' : snapshot.totalVotes === 0n ? 'Be the first to vote.' : 'Every payment counts.'}</span></div>
          </section>
        </div>
        <div className="totals"><dl><div><dt>Total votes</dt><dd>{snapshot?.totalVotes.toString() ?? '—'}</dd></div><div><dt>Total paid</dt><dd>{snapshot ? `${formatEther(snapshot.totalReceived)} ETH` : '—'}</dd></div></dl><span className="sync-status" role="status"><span aria-hidden="true">{loadError ? '!' : snapshot ? '*' : '~'}</span> {loadError ? 'Offline' : loading ? 'Syncing' : 'Onchain'}</span></div>
      </main>
      <footer><span>Sepolia testnet</span><a href={`${explorer}/address/${contract.address}#code`} target="_blank" rel="noreferrer">View contract <span aria-hidden="true">↗</span></a></footer>
    </div>
  );
}
