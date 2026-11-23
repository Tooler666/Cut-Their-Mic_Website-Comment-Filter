chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage().catch(console.error);
});

const statsSites = new Set([
  'bilibili', 'tiktok', 'douyin', 'youtube', 'x',
  'xiaohongshu', 'instagram', 'reddit', 'tieba', 'facebook'
]);
let statsWrite = Promise.resolve();

function addCounts(target, source) {
  for (const [site, count] of Object.entries(source)) {
    const previous = target[site] || { scanned: 0, folded: 0 };
    target[site] = { scanned: previous.scanned + count.scanned, folded: previous.folded + count.folded };
  }
}

function localDay(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')].join('-');
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  const operation = message?.type;
  if (operation === 'comment-filter-stats') {
    if (!sender.tab || !statsSites.has(message.site) ||
        ![message.scanned, message.folded].every(count => Number.isSafeInteger(count) && count >= 0) ||
        ![message.scanned, message.folded].some(Boolean)) return;
  } else if (!['comment-filter-stats-reset', 'comment-filter-stats-undo'].includes(operation) ||
      sender.url !== chrome.runtime.getURL('popup.html')) return;
  const day = localDay(new Date());
  const write = statsWrite.then(async () => {
    const { commentStats = {}, commentStatsDaily = {}, commentStatsUndo = null } =
      await chrome.storage.local.get(['commentStats', 'commentStatsDaily', 'commentStatsUndo']);
    if (operation === 'comment-filter-stats-reset') {
      if (!Object.keys(commentStats).length) return;
      await chrome.storage.local.set({
        commentStats: {}, commentStatsDaily: {},
        commentStatsUndo: { totals: commentStats, days: commentStatsDaily }
      });
      return;
    }
    if (operation === 'comment-filter-stats-undo') {
      if (!commentStatsUndo) return;
      addCounts(commentStats, commentStatsUndo.totals);
      for (const [key, totals] of Object.entries(commentStatsUndo.days)) {
        commentStatsDaily[key] ||= {};
        addCounts(commentStatsDaily[key], totals);
      }
      await chrome.storage.local.set({ commentStats, commentStatsDaily, commentStatsUndo: null });
      return;
    }
    const delta = { [message.site]: { scanned: message.scanned, folded: message.folded } };
    commentStatsDaily[day] ||= {};
    addCounts(commentStats, delta);
    addCounts(commentStatsDaily[day], delta);
    await chrome.storage.local.set({ commentStats, commentStatsDaily });
  });
  statsWrite = write.catch(console.error);
  write.then(() => reply(true), () => reply(false));
  return true;
});
