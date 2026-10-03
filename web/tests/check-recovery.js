async (page) => {
  const passed = [];
  const assert = (value, message) => { if (!value) throw Error(message); };
  const primary = page.locator('.primary');
  await primary.click();
  await page.getByRole('button', { name: 'Switch to Sepolia', exact: true }).waitFor();
  await primary.click();
  await page.waitForFunction(() => document.querySelector('.primary').textContent.trim() === 'Vote->' && !document.querySelector('.primary').disabled);
  await page.evaluate(() => { window.__mock.receipt = '0x0'; });
  await primary.click();
  await page.getByText('Vote reverted. No payment recorded; gas may still be charged.').waitFor();
  assert(await primary.isEnabled(), 'Reverted vote not retryable');
  passed.push('reverted receipt re-enables voting');
  await page.evaluate(() => { window.__mock.receipt = null; });
  await primary.click();
  await page.getByText('Waiting for confirmation.').waitFor();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Stop tracking' }).click();
  await page.getByText('Tracking stopped. Check the transaction before voting again.', { exact: false }).waitFor();
  assert(await page.evaluate(() => sessionStorage.getItem('paid.vote.pending')) === null, 'Pending hash not cleared');
  assert(await primary.isEnabled(), 'Stop tracking did not recover');
  passed.push('pending recovery confirms risk and clears tracking');
  const before = await page.evaluate(() => window.__mock.sent.length);
  await page.evaluate(() => { window.__mock.changeDuringPreflight = true; });
  await primary.click();
  await page.getByText('Wallet changed. Review the amount and try again.').waitFor();
  assert(await page.evaluate(() => window.__mock.sent.length) === before, 'Account-change transaction sent');
  passed.push('account change during preflight prevents sending');
  await page.evaluate(() => { window.__mock.offline = true; });
  await page.getByRole('button', { name: 'Refresh leaderboard' }).click();
  await page.getByText(/Board may be outdated/).waitFor();
  assert(await primary.isDisabled(), 'Offline state allows send');
  passed.push('RPC outage marks stale board and blocks sending');
  await page.evaluate(() => { window.__mock.offline = false; });
  await page.getByRole('button', { name: 'Refresh leaderboard' }).click();
  await page.waitForFunction(() => document.querySelector('.sync-status').textContent.includes('Onchain'));
  assert(await primary.isEnabled(), 'RPC retry failed');
  passed.push('RPC retry restores voting');
  // A newly announced provider deliberately resolves its initial account read late.
  await page.evaluate(() => {
    const events = {};
    const provider = {
      on: (name, listener) => { events[name] = listener; },
      removeListener: () => {},
      request: ({ method }) => method === 'eth_accounts'
        ? new Promise(resolve => { window.__initialResolve = resolve; })
        : Promise.resolve('0xaa36a7'),
    };
    window.__initialEvents = events;
    window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: { info: { uuid: 'race-test', name: 'Race test wallet' }, provider } }));
  });
  await page.getByLabel('Wallet', { exact: true }).selectOption('race-test');
  await page.waitForFunction(() => Boolean(window.__initialResolve));
  await page.evaluate(() => {
    window.__initialEvents.accountsChanged(['0x5555555555555555555555555555555555555555']);
    window.__initialResolve(['0x6666666666666666666666666666666666666666']);
  });
  await page.waitForFunction(() => document.querySelector('.wallet-summary').textContent.includes('0x5555'));
  assert(!(await page.locator('.wallet-summary').innerText()).includes('0x6666'), 'Stale initial wallet read won');
  passed.push('new account event wins over delayed initialization');
  return { passed };
}
