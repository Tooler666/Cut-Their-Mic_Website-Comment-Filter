import './i18n.js';
import './rules.js';

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage().catch(console.error);
});

const selectionRules = globalThis.commentFilterRules;
const selectionI18n = globalThis.commentFilterI18n;
const menu = chrome.contextMenus;
const menuRoot = 'cut-their-mic-add-selection';
const undoWindows = new Map();
let menuWrite = Promise.resolve();
let groupsWrite = Promise.resolve();

function transactGroups(change) {
  const pending = groupsWrite.then(change);
  groupsWrite = pending.catch(console.error);
  return pending;
}

function installSelectionMenu() {
  if (!menu) return;
  menuWrite = menuWrite.catch(console.error).then(async () => {
    const { locale } = await chrome.storage.local.get({ locale: 'zh-CN' });
    const t = key => selectionI18n.text(locale, key);
    await menu.removeAll();
    menu.create({
      id: menuRoot,
      title: t('selectionMenu'),
      contexts: ['selection'],
      documentUrlPatterns: chrome.runtime.getManifest().content_scripts[0].matches
    });
    for (const level of Object.keys(selectionRules.levels)) {
      menu.create({ id: menuRoot + '-' + level, parentId: menuRoot, title: t(level), contexts: ['selection'] });
    }
  });
  menuWrite.catch(console.error);
}

chrome.runtime.onInstalled.addListener(installSelectionMenu);
chrome.runtime.onStartup.addListener(installSelectionMenu);
chrome.storage.onChanged?.addListener((changes, area) => {
  if (area === 'local' && changes.locale) installSelectionMenu();
});

menu?.onClicked.addListener((info, tab) => {
  const level = String(info.menuItemId).slice(menuRoot.length + 1);
  if (!String(info.menuItemId).startsWith(menuRoot + '-') ||
      !Object.hasOwn(selectionRules.levels, level) || info.editable || tab?.id == null) return;
  const tabId = tab.id;
  const notify = data => chrome.tabs.sendMessage(tabId, { type: 'comment-filter-selection-result', ...data })
    .catch(() => undefined);
  const raw = (info.selectionText || '').trim();
  const [word] = selectionRules.terms(raw);
  if (!word || /[,，、،\r\n]/u.test(raw) || raw.length > 160) {
    notify({ status: 'selectionInvalid' });
    return;
  }
  transactGroups(async () => {
    const { keywordGroups } = selectionRules.read(await chrome.storage.local.get(selectionRules.defaults));
    const key = selectionRules.normalize(word);
    const previous = [];
    let alreadyHere = false;
    const updated = {};
    for (const [group, value] of Object.entries(keywordGroups)) {
      const terms = selectionRules.terms(value);
      const position = terms.findIndex(term => selectionRules.normalize(term) === key);
      if (position >= 0) {
        previous.push({ group, position, word: terms[position] });
        alreadyHere ||= group === level;
        if (group !== level) terms.splice(position, 1);
      } else if (group === level) terms.push(word);
      updated[group] = terms.join('\n');
    }
    if (alreadyHere && previous.length === 1) return { status: 'selectionExists', word, level };
    const token = crypto.randomUUID();
    await chrome.storage.local.set({ keywordGroups: updated });
    for (const [id, entry] of undoWindows) if (entry.expires <= Date.now()) undoWindows.delete(id);
    undoWindows.set(tabId, { token, key, level, previous, expires: Date.now() + 12000 });
    return { status: previous.length ? 'selectionMoved' : 'selectionAdded', word, level, token };
  }).then(notify, () => notify({ status: 'selectionError' }));
});

function undoSelection(tabId, token) {
  return transactGroups(async () => {
    const entry = undoWindows.get(tabId);
    if (!entry || entry.token !== token || entry.expires <= Date.now()) return false;
    undoWindows.delete(tabId);
    const { keywordGroups } = selectionRules.read(await chrome.storage.local.get(selectionRules.defaults));
    const terms = Object.fromEntries(Object.entries(keywordGroups).map(([level, words]) => [level, selectionRules.terms(words)]));
    const contains = level => terms[level].some(word => selectionRules.normalize(word) === entry.key);
    if (!contains(entry.level) || Object.keys(terms).some(level => level !== entry.level && contains(level))) return false;
    terms[entry.level] = terms[entry.level].filter(word => selectionRules.normalize(word) !== entry.key);
    for (const { group, position, word } of entry.previous) terms[group].splice(position, 0, word);
    await chrome.storage.local.set({
      keywordGroups: Object.fromEntries(Object.entries(terms).map(([level, words]) => [level, words.join('\n')]))
    });
    return true;
  });
}

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
  if (operation === 'comment-filter-selection-undo' && sender.tab?.id != null) {
    undoSelection(sender.tab.id, message.token).then(reply, () => reply(false));
    return true;
  }
  if (operation === 'comment-filter-save-settings' && sender.url === chrome.runtime.getURL('popup.html')) {
    transactGroups(async () => {
      const settings = selectionRules.read(message.settings);
      const base = selectionRules.read({ keywordGroups: message.base });
      const latest = selectionRules.read(await chrome.storage.local.get(selectionRules.defaults));
      settings.keywordGroups = selectionRules.mergeKeywordGroups(base.keywordGroups, settings.keywordGroups, latest.keywordGroups);
      await chrome.storage.local.set(settings);
      return settings.keywordGroups;
    }).then(reply, () => reply(false));
    return true;
  }
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
