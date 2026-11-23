(() => {
  'use strict';

  const byId = id => document.getElementById(id);
  const form = byId('settings');
  const controls = byId('controls');
  const enabled = byId('enabled');
  const exemptSelf = byId('exempt-self');
  const filterPostAuthor = byId('filter-post-author');
  const showFoldedReason = byId('show-folded-reason');
  const language = byId('locale');
  const profanityEnabled = byId('profanity-enabled');
  const profanityLevel = byId('profanity-level');
  const search = byId('term-search');
  const pageSize = 12;
  const preview = byId('preview');
  const status = byId('status');
  const rules = globalThis.commentFilterRules;
  const i18n = globalThis.commentFilterI18n;
  const statsMetric = byId('stats-metric');
  const statsPeriod = byId('stats-period');
  const statsReset = byId('stats-reset');
  const statsUndo = byId('stats-undo');
  const colors = ['#6946bd','#06786f','#ce602f','#3b70bf','#a13a74',
    '#a67712','#60783d','#8376a7','#176a7b','#bf4f4f'];
  let savedStats = {};
  let dailyStats = {};
  let undoAvailable = false;
  let statsBusy = false;
  let statsRevision = 0;
  let locale = rules.defaults.locale;
  let keywordBase;
  const t = (key, values) => i18n.text(locale, key, values);

  function translate() {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    document.title = t('title');
    for (const node of document.querySelectorAll('[data-text]')) node.textContent = t(node.dataset.text);
    for (const node of document.querySelectorAll('[data-placeholder]')) node.placeholder = t(node.dataset.placeholder);
    for (const node of document.querySelectorAll('[data-label]')) node.setAttribute('aria-label', t(node.dataset.label));
    for (const node of document.querySelectorAll('[data-example]')) node.textContent = t(node.dataset.example, { word: node.dataset.word });
    for (const node of document.querySelectorAll('[data-remove]')) node.setAttribute('aria-label', t('remove', { word: node.dataset.remove }));
    for (const node of document.querySelectorAll('[data-site]')) node.textContent = siteName(node.dataset.site);
    const languageLabel = document.querySelector('[data-text="language"]');
    if (locale !== 'en') languageLabel.textContent += ' / Language';
    byId('profanity-level-detail').textContent = t(profanityLevel.value + 'Detail');
    renderStats();
  }

  function siteName(site) {
    if (locale === 'zh-CN' || locale === 'zh-TW') return rules.sites[site];
    return ({bilibili: 'Bilibili', douyin: 'Douyin', tieba: 'Baidu Tieba', x: 'X / Twitter', xiaohongshu: 'Xiaohongshu'})[site] || rules.sites[site];
  }

  function renderStats() {
    const number = new Intl.NumberFormat(locale);
    const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 });
    const metric = statsMetric.value;
    const selectedStats = statsForPeriod(statsPeriod.value);
    const totals = { scanned: 0, folded: 0 };
    const entries = Object.keys(rules.sites).map((site, index) => {
      const { scanned = 0, folded = 0 } = selectedStats[site] || {};
      totals.scanned += scanned;
      totals.folded += folded;
      return { site, scanned, folded, color: colors[index] };
    });
    byId('stats-scanned').textContent = number.format(totals.scanned);
    byId('stats-folded').textContent = number.format(totals.folded);
    const rows = document.createDocumentFragment();
    const slices = [];
    const summary = [];
    let cumulative = 0;
    const total = totals[metric];
    for (const entry of entries) {
      const name = siteName(entry.site);
      const amount = entry[metric];
      const share = total ? amount / total : 0;
      if (amount > 0 && total) {
        const start = cumulative / total;
        cumulative += amount;
        slices.push(`${entry.color} ${start * 100}% ${(cumulative / total) * 100}%`);
        summary.push(name + ' ' + percent.format(share));
      }
      const row = document.createElement('tr');
      const label = document.createElement('th');
      label.scope = 'row';
      const swatch = document.createElement('span');
      swatch.className = 'stats-swatch';
      swatch.setAttribute('aria-hidden', 'true');
      swatch.style.backgroundColor = entry.color;
      label.append(swatch, name);
      row.append(label);
      for (const value of [number.format(entry.scanned), number.format(entry.folded), total ? percent.format(share) : '—']) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      }
      rows.append(row);
    }
    byId('stats-platforms').replaceChildren(rows);
    const chart = byId('stats-chart');
    chart.hidden = !total;
    chart.style.background = slices.length ? `conic-gradient(${slices.join(', ')})` : '';
    chart.setAttribute('aria-label', summary.join(', '));
    byId('stats-empty').hidden = Boolean(total);
    statsReset.disabled = statsBusy || !Object.values(savedStats).some(count => count.scanned || count.folded);
    statsUndo.disabled = statsBusy || !undoAvailable;
  }

  function statsForPeriod(period) {
    if (period === 'all') return savedStats;
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (period === 'week') start.setDate(start.getDate() - (start.getDay() + 6) % 7);
    if (period === 'month') start.setDate(1);
    if (period === 'year') start.setMonth(0, 1);
    const dateKey = date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')].join('-');
    const first = dateKey(start), last = dateKey(today);
    const totals = {};
    for (const [day, counts] of Object.entries(dailyStats)) {
      if (day < first || day > last) continue;
      for (const [site, count] of Object.entries(counts)) {
        const sum = totals[site] ||= { scanned: 0, folded: 0 };
        sum.scanned += count.scanned;
        sum.folded += count.folded;
      }
    }
    return totals;
  }

  if (!globalThis.chrome?.storage?.local) {
    translate();
    form.hidden = true;
    byId('install').hidden = false;
    return;
  }

  byId('statistics').hidden = false;
  statsMetric.addEventListener('change', renderStats);
  statsPeriod.addEventListener('change', renderStats);
  statsReset.addEventListener('click', () => {
    if (window.confirm(t('statsConfirm'))) performStatsAction('reset');
  });
  statsUndo.addEventListener('click', () => performStatsAction('undo'));
  async function performStatsAction(action) {
    statsBusy = true;
    renderStats();
    try {
      if (!await chrome.runtime.sendMessage({ type: 'comment-filter-stats-' + action })) throw new Error('Stats action failed');
      byId('stats-action-status').textContent = t(action === 'reset' ? 'statsResetDone' : 'statsUndoDone');
    } catch {
      byId('stats-action-status').textContent = t('saveError');
    } finally {
      statsBusy = false;
      renderStats();
    }
  }
  chrome.storage.onChanged?.addListener((changes, area) => {
    if (area !== 'local' || !(changes.commentStats || changes.commentStatsDaily || changes.commentStatsUndo)) return;
    refreshStats().catch(console.error);
  });
  async function refreshStats() {
    const requested = ++statsRevision;
    const { commentStats, commentStatsDaily, commentStatsUndo } =
      await chrome.storage.local.get(['commentStats', 'commentStatsDaily', 'commentStatsUndo']);
    if (statsRevision !== requested) return;
    savedStats = commentStats || {};
    dailyStats = commentStatsDaily || {};
    undoAvailable = Boolean(commentStatsUndo);
    renderStats();
  }
  refreshStats().catch(console.error);

  const siteInputs = Object.entries(rules.sites).map(([site, title]) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = site;
    const name = document.createElement('span');
    name.dataset.site = site;
    label.append(input, ' ', name);
    byId('sites').append(label);
    return input;
  });

  for (const [code, name] of Object.entries(i18n.names)) language.add(new Option(name, code));
  language.addEventListener('change', () => {
    locale = language.value;
    translate();
    for (const [, list] of tierLists) list.refresh();
    status.textContent = t('dirty');
    updatePageStatus();
  });

  function wordList(inputId, listId, emptyId, pager) {
    const input = byId(inputId);
    const list = byId(listId);
    const empty = byId(emptyId);
    let words = [];
    let page = 0;
    let query = '';
    const [prev, indicator, next] = pager?.children || [];

    function render() {
      list.replaceChildren();
      const results = Array.from(words.entries()).filter(([, word]) => rules.normalize(word).includes(query));
      const pages = pager ? Math.max(1, Math.ceil(results.length / pageSize)) : 1;
      page = Math.min(page, pages - 1);
      const items = pager ? results.slice(page * pageSize, (page + 1) * pageSize) : results;
      if (pager) {
        pager.hidden = pages === 1;
        prev.disabled = page === 0;
        next.disabled = page === pages - 1;
        indicator.textContent = new Intl.NumberFormat(locale).format(page + 1) + ' / ' + new Intl.NumberFormat(locale).format(pages);
      }
      for (const [position, [index, word]] of items.entries()) {
        const item = document.createElement('li');
        const text = document.createElement('span');
        text.textContent = word;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = '×';
        remove.dataset.remove = word;
        remove.setAttribute('aria-label', t('remove', { word }));
        remove.addEventListener('click', () => {
          words.splice(index, 1);
          render();
          const nextButton = list.querySelectorAll('button')[position] || list.lastElementChild?.querySelector('button');
          (nextButton || input).focus();
          status.textContent = t('dirty');
        });
        item.append(text, remove);
        list.append(item);
      }
      empty.hidden = results.length > 0;
      if (pager) {
        empty.dataset.text = query ? 'noResults' : 'empty';
        empty.textContent = t(empty.dataset.text);
      }
    }

    function add() {
      if (!input.value.trim()) return true;
      words = rules.terms([...words, input.value].join('\n'));
      input.value = '';
      if (pager && !query) page = Math.floor(Math.max(0, words.length - 1) / pageSize);
      render();
      status.textContent = t('dirty');
      return true;
    }

    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      add();
    });
    byId('add-' + inputId).addEventListener('click', () => { add(); input.focus(); });
    prev?.addEventListener('click', () => { page--; render(); if (prev.disabled) next.focus(); });
    next?.addEventListener('click', () => { page++; render(); if (next.disabled) prev.focus(); });

    return {
      add,
      refresh: render,
      search(value) {
        query = rules.normalize(value);
        page = 0;
        render();
      },
      set(value) {
        words = rules.terms(value);
        page = 0;
        input.value = '';
        render();
      },
      value() { return rules.terms([...words, input.value].join('\n')).join('\n'); }
    };
  }

  const examples = {
    exact: ['AI', 'AI tools'],
    balanced: ['AI tools', 'said'],
    contains: ['A.I. / A·I', 'said / OpenAI']
  };
  const tierLists = Object.keys(rules.levels).map(level => {
    const tier = byId('tier-template').content.firstElementChild.cloneNode(true);
    const inputId = 'keywords-' + level;
    const listId = 'keyword-list-' + level;
    const emptyId = 'keywords-empty-' + level;
    const label = tier.querySelector('label');
    label.htmlFor = inputId;
    label.dataset.text = level;
    const hintNode = tier.querySelector('.tier-hint');
    hintNode.id = 'hint-' + level;
    hintNode.dataset.text = level + 'Help';
    const input = tier.querySelector('textarea');
    input.id = inputId;
    input.setAttribute('aria-describedby', hintNode.id);
    tier.querySelector('button').id = 'add-' + inputId;
    const list = tier.querySelector('.word-list');
    list.id = listId;
    list.dataset.label = level;
    tier.querySelector('.empty').id = emptyId;
    const [hit, kept] = examples[level];
    for (const [key, word] of [['example', ''], ['hit', hit], ['kept', kept]]) {
      const item = document.createElement('li');
      item.dataset.example = key;
      item.dataset.word = word;
      tier.querySelector('.tier-examples').append(item);
    }
    byId('tiers').append(tier);
    return [level, wordList(inputId, listId, emptyId, tier.querySelector('.pager'))];
  });
  const exceptions = wordList('exceptions', 'exception-list', 'exceptions-empty');
  function showKeywordGroups(groups) {
    keywordBase = groups;
    for (const [level, list] of tierLists) list.set(groups[level]);
  }
  chrome.storage.onChanged?.addListener((changes, area) => {
    if (area !== 'local' || !changes.keywordGroups?.newValue || !keywordBase || controls.disabled) return;
    if (tierLists.some(([level, list]) => list.value() !== rules.terms(keywordBase[level]).join('\n'))) return;
    showKeywordGroups(changes.keywordGroups.newValue);
  });
  search.addEventListener('input', () => {
    for (const [, list] of tierLists) list.search(search.value);
  });
  search.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    const first = search.value.trim() && byId('tiers').querySelector('.word-list li');
    if (first) {
      first.tabIndex = -1;
      first.focus();
    }
  });
  profanityLevel.addEventListener('change', () => {
    byId('profanity-level-detail').textContent = t(profanityLevel.value + 'Detail');
  });

  function showSettings(settings) {
    enabled.checked = settings.enabled;
    exemptSelf.checked = settings.exemptSelf;
    filterPostAuthor.checked = !settings.exemptPostAuthor;
    showFoldedReason.checked = settings.showFoldedReason;
    profanityEnabled.checked = settings.profanityEnabled;
    profanityLevel.value = settings.profanityLevel;
    locale = Object.hasOwn(i18n.names, settings.locale) ? settings.locale : rules.defaults.locale;
    language.value = locale;
    preview.checked = settings.mode === 'preview';
    for (const [level, list] of tierLists) list.set(settings.keywordGroups[level]);
    exceptions.set(settings.exceptions);
    for (const input of siteInputs) input.checked = !settings.disabledSites.includes(input.value);
    translate();
  }

  function editedSettings() {
    return {
      enabled: enabled.checked, exemptSelf: exemptSelf.checked,
      exemptPostAuthor: !filterPostAuthor.checked, showFoldedReason: showFoldedReason.checked, locale,
      profanityEnabled: profanityEnabled.checked, profanityLevel: profanityLevel.value,
      mode: preview.checked ? 'preview' : 'collapse',
      keywordGroups: Object.fromEntries(tierLists.map(([level, list]) => [level, list.value()])),
      exceptions: exceptions.value(),
      disabledSites: siteInputs.filter(input => !input.checked).map(input => input.value)
    };
  }

  async function updatePageStatus() {
    const result = byId('page-status');
    try {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
      let report;
      for (const tab of tabs) {
        if (tab.active || tab.id == null) continue;
        report = await chrome.tabs.sendMessage(tab.id, { type: 'comment-filter-status' }).catch(() => undefined);
        if (report) break;
      }
      if (!report) throw new Error('No loaded platform tab');
      const platform = siteName(report.site);
      result.textContent = report.enabled
        ? t('count', { site: platform, n: report.scanned }) + ' · ' +
          t(report.preview ? 'hits' : 'folded', { n: report.preview ? report.hits : report.folded })
        : t('disabled', { site: platform });
    } catch {
      result.textContent = t('refresh');
    }
  }

  translate();
  chrome.storage.local.get(rules.defaults).then(value => {
    const settings = rules.read(value);
    keywordBase = settings.keywordGroups;
    showSettings(settings);
    controls.disabled = false;
    updatePageStatus();
  }).catch(() => {
    byId('page-status').textContent = t('loadError');
  });

  form.addEventListener('input', event => {
    if (event.target === enabled || event.target === search || event.target.type === 'file') return;
    status.textContent = t('dirty');
  });
  enabled.addEventListener('change', async () => {
    const value = enabled.checked;
    controls.disabled = true;
    try {
      await chrome.storage.local.set({ enabled: value });
      byId('enabled-hint').textContent = t(value ? 'active' : 'paused');
      updatePageStatus();
    } catch {
      enabled.checked = !value;
      byId('enabled-hint').textContent = t('switchError');
    } finally {
      controls.disabled = false;
    }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    for (const [, list] of tierLists) list.add();
    exceptions.add();
    const settings = editedSettings();
    controls.disabled = true;
    try {
      const applied = await chrome.runtime.sendMessage({
        type: 'comment-filter-save-settings', settings, base: keywordBase
      });
      if (!applied) throw new Error('Settings write failed');
      showKeywordGroups(applied);
      status.textContent = t('saved');
      updatePageStatus();
    } catch {
      status.textContent = t('saveError');
    } finally {
      controls.disabled = false;
    }
  });

  byId('export').addEventListener('click', () => {
    const json = JSON.stringify(editedSettings(), null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'comment-filter-settings.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  byId('import').addEventListener('change', async event => {
    const input = event.target;
    const file = input.files[0];
    if (!file) return;
    controls.disabled = true;
    try {
      const payload = JSON.parse(await file.text());
      if (typeof payload?.keywords !== 'string' && !payload?.keywordGroups) throw new Error('Missing keywords');
      const settings = rules.read(payload);
      showSettings(settings);
      status.textContent = t('imported');
    } catch {
      status.textContent = t('invalid');
    } finally {
      input.value = '';
      controls.disabled = false;
    }
  });
})();
