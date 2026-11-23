(() => {
  'use strict';

  const marker = 'data-local-comment-keyword-hidden';
  const rules = globalThis.commentFilterRules;
  const i18n = globalThis.commentFilterI18n;
  const profanity = globalThis.commentFilterProfanity;
  const identities = globalThis.commentFilterIdentities;
  const host = location.hostname;
  const on = domain => host === domain || host.endsWith('.' + domain);
  const isBilibili = on('bilibili.com');
  const isXiaohongshu = on('xiaohongshu.com');
  const isYouTube = on('youtube.com');
  const isTikTok = on('tiktok.com');
  const isX = on('x.com') || on('twitter.com');
  const extraPlatforms = {
    'instagram.com': ['instagram', '[data-testid="comment"], [data-testid="comment-item"], a[href*="/c/"] > time, article time, [role="dialog"] time, main time'],
    'reddit.com': ['reddit', 'shreddit-comment, .thing.comment'],
    'tieba.baidu.com': ['tieba', '.l_post, .lzl_single_post, .pb-comment-item'],
    'facebook.com': ['facebook', '[role="article"][aria-label], [data-testid="UFI2Comment/root_depth_0"], [data-testid="UFI2Comment/root_depth_1"], a[href*="comment_id="]']
  };
  const extra = Object.entries(extraPlatforms).find(([domain]) => on(domain))?.[1];
  const site = extra?.[0] || (isBilibili ? 'bilibili' : isTikTok ? 'tiktok' : isYouTube ? 'youtube'
    : isX ? 'x' : isXiaohongshu ? 'xiaohongshu' : 'douyin');
  const biliRows = 'bili-comment-renderer, bili-comment-reply-renderer';
  const tikTokBody = '[data-e2e="comment-level-1"], [data-e2e="comment-level-2"]';
  const rowSelector = extra?.[1] || (isBilibili
    ? `${biliRows}, .reply-item, .sub-reply-item`
    : isXiaohongshu
      ? '.comment-item, .comment-item-sub'
      : isYouTube
        ? 'ytd-comment-view-model, ytd-comment-renderer'
        : isTikTok
          ? tikTokBody
          : isX
            ? 'article[data-testid="tweet"]'
            : '[data-e2e="comment-item"], [data-e2e="comment-reply-item"]');

  const notices = new Map();
  const countedIds = new Map();
  let countedRows = new WeakMap();
  const shadowObservers = new Map();
  const knownReplyIds = new Set();
  let pageUrl = location.href;
  let shadowStyles;
  let keywords = [];
  let profanityLevel;
  let exceptions = [];
  let enabled = false;
  let preview = false;
  let exemptSelf = true;
  let exemptPostAuthor = true;
  let showFoldedReason = false;
  let locale = rules.defaults.locale;
  let scanned = 0;
  let pending = false;
  let retryTimer;
  let revision = 0;

  function ownBody(row, selector) {
    return Array.from(row.querySelectorAll(selector))
      .find(body => body.closest(rowSelector) === row);
  }

  function commentBody(row) {
    if (site === 'reddit') return ownBody(row, '[slot="comment"], .usertext-body .md');
    if (site === 'tieba') return ownBody(row, '.d_post_content, .lzl_content_main, .pb-rich-text, .comment-content');
    if (isYouTube) return ownBody(row, '#content-text');
    if (isTikTok) return row;
    if (isX) {
      return Array.from(row.querySelectorAll('[data-testid="tweetText"]'))
        .find(body => !insideXQuote(body, row));
    }
    if (isBilibili) {
      if (row.matches(biliRows)) {
        const body = row.shadowRoot?.querySelector('#content, #contents, bili-rich-text');
        const rich = body?.matches('bili-rich-text') ? body : body?.querySelector('bili-rich-text');
        return rich?.shadowRoot?.querySelector('#contents') || body;
      }
      return ownBody(row, '.reply-content, .sub-reply-content');
    }
    if (isXiaohongshu) {
      return ownBody(row, '.note-text') || ownBody(row, '.comment-content, .content, .text');
    }
    const explicit = ownBody(row, '[data-e2e="comment-content"], .comment-item-content, .comment-content');
    if (explicit) return explicit;
    const author = ownBody(row, '.comment-item-info-wrap');
    const stats = ownBody(row, '.comment-item-stats-container');
    if (!author || !stats || author.parentElement !== stats.parentElement) return null;
    for (let block = author.nextElementSibling; block && block !== stats; block = block.nextElementSibling) {
      if (block.textContent.trim() && !block.matches(rowSelector) && !block.querySelector(rowSelector)) return block;
    }
    return null;
  }

  function instagramComment(anchor) {
    if (anchor.tagName !== 'TIME') {
      const body = anchor.querySelector('[data-testid="comment-text"], [data-testid="comment-content"], span[dir="auto"]:not(a span)');
      return body && [anchor, body];
    }
    const isCommentLink = /\/c\/\d+/.test(anchor.closest('a')?.pathname || '');
    let row = anchor.parentElement;
    for (let depth = 0; row && depth < 8; depth++, row = row.parentElement) {
      if (row.matches('article, main, [role="dialog"]') || row.querySelectorAll('time').length > 1) break;
      const hasReply = Array.from(row.querySelectorAll('button, [role="button"]'))
        .some(button => /^(reply|回复|回覆|responder|répondre|antworten|返信|답글)$/iu.test(button.textContent.trim()));
      if (!isCommentLink && !hasReply) continue;
      const body = Array.from(row.querySelectorAll('span[dir="auto"], [data-testid="comment-text"]'))
        .find(span => span.textContent.trim() && !span.closest('a, button, [role="button"], time') &&
          (span.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_FOLLOWING));
      if (body && row.querySelector('a[href^="/"]:not([href*="/c/"])')) return [row, body];
    }
    return null;
  }

  function facebookComment(anchor) {
    const row = anchor.matches('a')
      ? anchor.closest('[role="article"], [data-testid^="UFI2Comment/root"]')
      : anchor;
    if (!row) return null;
    const explicit = row.matches('[data-testid^="UFI2Comment/root"]');
    const link = Array.from(row.querySelectorAll('a[href*="comment_id="]'))
      .find(el => el.closest('[role="article"], [data-testid^="UFI2Comment/root"]') === row);
    const label = row.getAttribute('aria-label') || '';
    if (!explicit && !link && !/^(comment (by|from)\b|留言|评论|来自.+的评论)/iu.test(label)) return null;
    // Feed posts can also contain comment permalinks. A post headline or
    // message container identifies the outer post rather than a comment.
    if (row.querySelector('[data-ad-comet-preview="message"], [data-testid="post_message"]')) return null;
    const nestedSelector = '[role="article"], [data-testid^="UFI2Comment/root"]';
    const candidates = Array.from(row.querySelectorAll('[data-testid="comment-body"], [data-testid="UFI2Comment/body"], div[dir="auto"], span[dir="auto"]'));
    const body = candidates.find(el =>
      el.textContent.trim() && (!link || !el.contains(link)) &&
      el.closest(nestedSelector) === row &&
      !el.closest('a, button, [role="button"], [role="link"]') &&
      !el.querySelector('a[role="link"], button, [role="button"]')
    );
    return body && [row, body];
  }

  function scheduleScan() {
    if (!enabled || pending) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      scan();
    });
  }

  function observe(root) {
    const observer = new MutationObserver(scheduleScan);
    observer.observe(root, {
      subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ['class', 'data-e2e', 'data-testid', 'href', 'aria-label', 'slot']
    });
    return observer;
  }

  function collect(root, rows, activeRoots) {
    for (const row of root.querySelectorAll(rowSelector)) rows.add(row);
    if (!isBilibili) return;

    // At document level, enter only the comment components. Within their
    // shadow trees, follow nested components, including reply and rich text.
    const nodes = root === document
      ? root.querySelectorAll(`bili-comments, bili-comment-thread-renderer, ${biliRows}`)
      : root.querySelectorAll('*');
    for (const node of nodes) {
      const shadow = node.shadowRoot;
      if (!shadow || activeRoots.has(shadow)) continue;
      activeRoots.add(shadow);
      if (!shadow.adoptedStyleSheets.includes(shadowStyles)) {
        shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, shadowStyles];
      }
      if (!shadowObservers.has(shadow)) shadowObservers.set(shadow, observe(shadow));
      collect(shadow, rows, activeRoots);
    }
  }

  function scan() {
    const rows = new Set();
    const activeRoots = new Set();
    const active = keywords.length || profanityLevel;
    if (enabled) collect(document, rows, activeRoots);
    if (pageUrl !== location.href) {
      for (const [row, state] of notices) removeNotice(row, state);
      knownReplyIds.clear();
      countedIds.clear();
      countedRows = new WeakMap();
      pageUrl = location.href;
    }
    for (const [root, observer] of shadowObservers) {
      if (activeRoots.has(root)) continue;
      observer.disconnect();
      shadowObservers.delete(root);
    }

    scanned = 0;
    const matches = new Set();
    const counted = new Set();
    const stats = { scanned: 0, folded: 0 };
    const currentAuthor = active && exemptSelf ? viewerIdentity() : null;
    const postAuthor = active && exemptPostAuthor ? postAuthorIdentity() : null;
    for (const candidate of isX ? xReplies(rows) : rows) {
      const pair = site === 'instagram' ? instagramComment(candidate) :
        site === 'facebook' ? facebookComment(candidate) : [candidate, commentBody(candidate)];
      if (!pair) continue;
      const [row, body] = pair;
      if (!body || counted.has(body)) continue;
      counted.add(body);
      const text = body?.textContent || '';
      if (!text.trim()) continue;
      scanned++;
      const record = statsRecord(row, text);
      if (!record.scanned) {
        record.scanned = true;
        stats.scanned++;
      }
      if (!active) continue;
      if (exemptPostAuthor && identities.markedCreator(site, row)) continue;
      if (currentAuthor || postAuthor) {
        const author = authorIdentity(row, body);
        if (author && (author === currentAuthor || author === postAuthor)) continue;
      }
      if (exceptions.length && rules.find(text, exceptions, [], 'contains')) continue;
      const hit = rules.findInGroups(text, keywords, []) || profanity.find(text, profanityLevel);
      if (hit) {
        // Keep a site's nested replies visible when its parent comment hits.
        const bodyOnly = site === 'instagram' || site === 'facebook' || row.querySelector(rowSelector);
        const target = isTikTok ? tikTokRow(row) : bodyOnly ? body : row;
        showNotice(target, commentIdentity(row, text), hit.word, hit.level);
        if (!preview && !notices.get(target).expanded && !record.folded) {
          record.folded = true;
          stats.folded++;
        }
        matches.add(target);
      }
    }
    for (const [row, state] of notices) {
      if (!matches.has(row)) removeNotice(row, state);
    }
    if (stats.scanned || stats.folded) {
      chrome.runtime?.sendMessage?.({ type: 'comment-filter-stats', site, ...stats }).catch(console.error);
    }
  }

  function statsRecord(row, text) {
    const id = row.getAttribute('data-comment-id') || row.getAttribute('thingid') ||
      (site === 'reddit' && /^t1_/.test(row.id) ? row.id : '') ||
      (isX ? statusId(permalink(row)?.pathname || '') : '');
    if (id) {
      if (!countedIds.has(id)) countedIds.set(id, {});
      return countedIds.get(id);
    }
    let rows = countedRows.get(row);
    if (!rows) {
      rows = new Map();
      countedRows.set(row, rows);
    }
    if (!rows.has(text)) rows.set(text, {});
    return rows.get(text);
  }

  function viewerIdentity() {
    if (isBilibili) return document.cookie.match(/(?:^|;\s*)DedeUserID=(\d+)(?:;|$)/)?.[1];
    if (isX) {
      const switcher = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
      const labels = Array.from(switcher?.querySelectorAll('[dir]') || []);
      return labels.map(label => label.textContent.trim())
        .findLast(text => /^@[a-z0-9_]{1,15}$/i.test(text))?.toLowerCase();
    }
    return identities.viewer(site);
  }

  function authorIdentity(row, body) {
    if (isX) {
      const author = row.querySelector('[data-testid="User-Name"] a[href^="/"]');
      const handle = author?.pathname.match(/^\/([a-z0-9_]{1,15})\/?$/i)?.[1];
      return handle ? '@' + handle.toLowerCase() : null;
    }
    if (!isBilibili) return identities.author(site, row, body);
    const root = row.shadowRoot || row;
    const info = root.querySelector('bili-comment-user-info');
    const selector = 'a[href*="space.bilibili.com/"]';
    const author = info?.shadowRoot?.querySelector(selector) ||
      root.querySelector('#header')?.querySelector(selector) ||
      ownBody(row, '.user-info ' + selector + ', .user-name[href*="space.bilibili.com/"], .user a[href*="space.bilibili.com/"]');
    return biliUid(author);
  }

  function biliUid(link) {
    return link?.hostname === 'space.bilibili.com' ? link.pathname.match(/^\/(\d+)(?:\/|$)/)?.[1] : null;
  }

  function postAuthorIdentity() {
    if (isX) {
      const handle = location.pathname.match(/^\/([a-z0-9_]{1,15})\/status\/\d+(?:\/|$)/i)?.[1];
      return handle && handle !== 'i' ? '@' + handle.toLowerCase() : null;
    }
    if (isBilibili && location.pathname.startsWith('/video/')) {
      const link = document.querySelector('#v_upinfo .up-name[href*="space.bilibili.com/"], .up-info-container .up-name[href*="space.bilibili.com/"]');
      return biliUid(link);
    }
    return identities.owner(site, location.pathname);
  }

  function tikTokRow(body) {
    const wrapper = body.closest('[class*="CommentItem"], [class*="ContentWrapper"]');
    return wrapper && wrapper.querySelectorAll(tikTokBody).length === 1 ? wrapper : body;
  }

  function insideXQuote(node, row) {
    // The timestamp anchor can itself have role=link.
    const card = node.parentElement?.closest('[data-testid="quoteTweet"], [role="link"]');
    return card && row.contains(card);
  }

  const statusId = pathname => pathname.match(/\/status\/(\d+)(?:\/|$)/)?.[1];

  function permalink(row) {
    const links = Array.from(row.querySelectorAll('a[href*="/status/"]'))
      .filter(link => !insideXQuote(link, row) && statusId(link.pathname));
    return links.find(link => link.querySelector('time') || link.closest('[data-testid="User-Name"]')) ||
      links.find(link => /\/status\/\d+\/?$/.test(link.pathname) && !link.closest('[data-testid="tweetText"]'));
  }

  function xReplies(rows) {
    const focalId = statusId(location.pathname);
    if (!focalId) return [];
    const entries = Array.from(rows)
      .filter(row => row.closest('[data-testid="primaryColumn"]'))
      .map(row => [row, statusId(permalink(row)?.pathname || '')]);
    const focal = entries.findIndex(([, id]) => id === focalId);
    const known = entries.findIndex(([, id]) => knownReplyIds.has(id));
    const start = focal >= 0 ? focal + 1 : known;
    if (start < 0) return [];
    const replies = [];
    for (const [row, id] of entries.slice(start)) {
      if (id === focalId) continue;
      if (id) knownReplyIds.add(id);
      replies.push(row);
    }
    return replies;
  }

  function commentIdentity(row, text) {
    const key = row.getAttribute('data-comment-id') || row.id ||
      (isX ? permalink(row)?.pathname : '');
    return JSON.stringify([key, text]);
  }

  function removeNotice(row, state) {
    row.removeAttribute(marker);
    state.notice.remove();
    notices.delete(row);
  }

  function showNotice(row, identity, keyword, level) {
    let state = notices.get(row);
    if (state?.identity !== identity) {
      if (state) removeNotice(row, state);
      const notice = document.createElement('div');
      notice.className = 'local-comment-keyword-notice';
      // Preserve the same slot as the comment in component-based layouts.
      if (row.slot) notice.slot = row.slot;
      const label = document.createElement('span');
      const button = document.createElement('button');
      button.type = 'button';
      notice.append(label, button);
      state = { notice, label, button, identity, keyword, level, preview, locale, showFoldedReason, expanded: false };
      notices.set(row, state);
      updateNotice(row, state);
      button.addEventListener('click', event => {
        event.stopPropagation();
        if (!row.isConnected || notices.get(row) !== state) return;
        state.expanded = !state.expanded;
        updateNotice(row, state);
      });
    }
    if (state.keyword !== keyword || state.level !== level || state.preview !== preview ||
        state.locale !== locale || state.showFoldedReason !== showFoldedReason) {
      if (state.preview !== preview) state.expanded = false;
      state.preview = preview;
      state.keyword = keyword;
      state.level = level;
      state.locale = locale;
      state.showFoldedReason = showFoldedReason;
      updateNotice(row, state);
    }
    if (state.notice.parentNode !== row.parentNode || state.notice.nextSibling !== row) {
      row.before(state.notice);
    }
  }

  function updateNotice(row, state) {
    row.toggleAttribute(marker, !state.preview && !state.expanded);
    const t = (key, values) => i18n.text(state.locale, key, values);
    state.notice.lang = state.locale;
    state.notice.dir = state.locale === 'ar' ? 'rtl' : 'ltr';
    state.label.textContent = t(state.preview ? 'previewNotice' : 'notice');
    if (state.preview || state.expanded || state.showFoldedReason) {
      const reason = document.createElement('small');
      reason.textContent = t('reason', { level: t(state.level), word: state.keyword });
      state.label.append(' ', reason);
    }
    state.button.hidden = state.preview;
    state.button.textContent = t(state.expanded ? 'close' : 'open');
    state.button.setAttribute('aria-expanded', String(state.expanded));
  }

  let documentObserver;
  async function loadSettings() {
    const requested = ++revision;
    const settings = rules.read(await chrome.storage.local.get(rules.defaults));
    if (requested !== revision) return;
    enabled = settings.enabled && !settings.disabledSites.includes(site);
    preview = settings.mode === 'preview';
    exemptSelf = settings.exemptSelf;
    exemptPostAuthor = settings.exemptPostAuthor;
    showFoldedReason = settings.showFoldedReason;
    locale = Object.hasOwn(i18n.names, settings.locale) ? settings.locale : rules.defaults.locale;
    keywords = enabled
      ? Object.entries(settings.keywordGroups).map(([level, words]) => [level, rules.compile(words)]).filter(([, words]) => words.length)
      : [];
    exceptions = rules.compile(settings.exceptions);
    profanityLevel = enabled && settings.profanityEnabled ? settings.profanityLevel : undefined;
    if (enabled && !documentObserver) {
      if (isBilibili && !shadowStyles) {
        shadowStyles = new CSSStyleSheet();
        shadowStyles.replaceSync(`
          [${marker}] { display: none !important; }
          .local-comment-keyword-notice {
            display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px;
            padding: 8px 12px; margin: 6px 0; border: 1px solid #8a938d;
            border-radius: 8px; background: Canvas; color: CanvasText;
            font: 13px/1.5 system-ui, sans-serif;
          }
          .local-comment-keyword-notice button {
            font: inherit; cursor: pointer; padding: 2px 8px;
            background: ButtonFace; color: ButtonText;
          }
        `);
      }
      documentObserver = observe(document);
      // A custom element may attach its shadow root without changing the
      // observed document. Periodically discover those late attachments.
      if (isBilibili || isX) retryTimer = setInterval(scheduleScan, 1000);
    } else if (!enabled && documentObserver) {
      documentObserver.disconnect();
      documentObserver = undefined;
      clearInterval(retryTimer);
    }
    scan();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && Object.keys(rules.defaults).some(key => key in changes)) {
      loadSettings().catch(console.error);
    }
  });
  let selectionToast;
  let selectionTimer;
  function showSelectionToast(message) {
    selectionToast?.remove();
    clearTimeout(selectionTimer);
    const toast = document.createElement('div');
    toast.className = 'local-comment-keyword-toast';
    toast.lang = locale;
    toast.dir = locale === 'ar' ? 'rtl' : 'ltr';
    const label = document.createElement('span');
    label.setAttribute('role', 'status');
    label.textContent = i18n.text(locale, message.status, {
      word: message.word, level: message.level && i18n.text(locale, message.level)
    });
    toast.append(label);
    if (message.token) {
      const undo = document.createElement('button');
      undo.type = 'button';
      undo.textContent = i18n.text(locale, 'selectionUndo');
      undo.addEventListener('click', async () => {
        undo.disabled = true;
        const restored = await chrome.runtime.sendMessage({ type: 'comment-filter-selection-undo', token: message.token })
          .catch(() => false);
        if (selectionToast === toast) showSelectionToast({ status: restored ? 'selectionUndone' : 'selectionExpired' });
      });
      toast.append(undo);
    }
    (document.body || document.documentElement).append(toast);
    selectionToast = toast;
    selectionTimer = setTimeout(() => { toast.remove(); selectionToast = undefined; }, 10000);
  }

  chrome.runtime?.onMessage.addListener((message, sender, reply) => {
    if (message?.type === 'comment-filter-selection-result') {
      showSelectionToast(message);
      return;
    }
    if (message?.type !== 'comment-filter-status') return;
    reply({
      site, enabled, preview, scanned, hits: notices.size,
      folded: preview ? 0 : Array.from(notices.values()).filter(state => !state.expanded).length
    });
  });
  loadSettings().catch(console.error);
})();
