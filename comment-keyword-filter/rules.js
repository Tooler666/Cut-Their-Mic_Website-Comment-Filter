(() => {
  'use strict';

  const normalize = text => text.normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .toLowerCase();
  const sites = Object.freeze({
    tieba: '百度贴吧', bilibili: 'B 站', douyin: '抖音', xiaohongshu: '小红书',
    facebook: 'Facebook', instagram: 'Instagram', reddit: 'Reddit',
    tiktok: 'TikTok', x: 'X / 推特', youtube: 'YouTube'
  });
  const defaults = {
    enabled: true, exemptSelf: true, exemptPostAuthor: true, showFoldedReason: false,
    locale: 'zh-CN', matchLevel: 'balanced',
    profanityEnabled: false, profanityLevel: 'common',
    keywords: '', keywordGroups: null, exceptions: '', mode: 'collapse', disabledSites: []
  };
  const levels = Object.freeze({
    exact: '保守 · 整条匹配',
    balanced: '均衡 · 完整词语',
    contains: '完整词 + 常见变体'
  });
  const segmenter = new Intl.Segmenter('und', { granularity: 'word' });
  const surface = text => normalize(text).replace(/\s+/gu, ' ').trim();
  const levelIds = Object.keys(levels);
  const identifierChar = /[a-z0-9_]/;
  const splitLetters = /(?<=[\p{L}\p{M}])[.·・](?=\p{L})/gu;
  const plainPhrase = /^(?:\p{L}[\p{L}\p{M}]*(?: \p{L}[\p{L}\p{M}]*)*)$/u;
  const elision = /(^|[^\p{L}\p{M}\p{N}_])(?:[cdjlmnst]|qu|jusqu|lorsqu|puisqu)['’](?=\p{L})/gu;

  globalThis.commentFilterRules = {
    sites,
    levels,
    defaults,
    normalize: surface,
    read(value) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Invalid configuration');
      }
      const settings = { ...defaults, ...value };
      const groups = settings.keywordGroups;
      if (typeof settings.enabled !== 'boolean' || typeof settings.exemptSelf !== 'boolean' ||
          typeof settings.exemptPostAuthor !== 'boolean' || typeof settings.showFoldedReason !== 'boolean' ||
          typeof settings.locale !== 'string' ||
          typeof settings.profanityEnabled !== 'boolean' ||
          !['clear', 'common', 'extended'].includes(settings.profanityLevel) ||
          !Object.hasOwn(levels, settings.matchLevel) || typeof settings.keywords !== 'string' ||
          typeof settings.exceptions !== 'string' || !['collapse', 'preview'].includes(settings.mode) ||
          !Array.isArray(settings.disabledSites) ||
          (groups !== null && (typeof groups !== 'object' || Array.isArray(groups) ||
            levelIds.some(level => typeof groups[level] !== 'string')))) {
        throw new Error('Invalid configuration');
      }
      return {
        enabled: settings.enabled, exemptSelf: settings.exemptSelf,
        exemptPostAuthor: settings.exemptPostAuthor, showFoldedReason: settings.showFoldedReason,
        locale: settings.locale,
        profanityEnabled: settings.profanityEnabled, profanityLevel: settings.profanityLevel,
        matchLevel: settings.matchLevel,
        keywords: settings.keywords, exceptions: settings.exceptions,
        keywordGroups: groups === null
          ? Object.fromEntries(levelIds.map(level => [level, level === settings.matchLevel ? settings.keywords : '']))
          : Object.fromEntries(levelIds.map(level => [level, groups[level]])),
        mode: settings.mode,
        disabledSites: Object.keys(sites).filter(site => settings.disabledSites.includes(site))
      };
    },
    terms(input) {
      const words = new Map();
      for (const entry of input.split(/[,，、،\r\n]+/)) {
        const word = entry.trim();
        const key = surface(word);
        if (key && !words.has(key)) words.set(key, word);
      }
      return [...words.values()];
    },
    compile(input) {
      return this.terms(input).map(surface);
    },
    mergeKeywordGroups(base, edited, current) {
      return Object.fromEntries(levelIds.map(level => {
        const before = new Set(this.compile(base[level]));
        const draft = this.terms(edited[level]);
        const remaining = new Set(draft.map(surface));
        const words = this.terms(current[level]).filter(word =>
          !before.has(surface(word)) || remaining.has(surface(word)));
        words.push(...draft.filter(word => !before.has(surface(word))));
        return [level, this.terms(words.join('\n')).join('\n')];
      }));
    },
    find(text, keywords, exceptions = [], level = defaults.matchLevel) {
      const normalized = surface(text);
      if (exceptions.some(word => normalized.includes(word))) return undefined;
      return this.findInLevel(normalized, keywords, level);
    },
    findInGroups(text, groups, exceptions) {
      const normalized = surface(text);
      if (exceptions.some(word => normalized.includes(word))) return undefined;
      for (const [level, words] of groups) {
        const word = level === 'contains'
          ? this.findWithVariants(normalized, words)
          : this.findInLevel(normalized, words, level);
        if (word) return { word, level };
      }
      return undefined;
    },
    findWithVariants(normalized, keywords) {
      const direct = this.findInLevel(normalized, keywords, 'balanced');
      if (direct) return direct;
      const joined = normalized.replace(splitLetters, '');
      if (joined === normalized) return undefined;
      return this.findInLevel(joined, keywords.filter(word => plainPhrase.test(word)), 'balanced');
    },
    findInLevel(normalized, keywords, level) {
      if (level === 'exact') return keywords.find(keyword => normalized === keyword);
      const candidates = keywords.filter(keyword => normalized.includes(keyword));
      if (level === 'contains' || !candidates.length) return candidates[0];
      const boundaries = new Set([normalized.length]);
      for (const { index } of segmenter.segment(normalized)) boundaries.add(index);
      // Common French elisions can be returned as one word by ICU.
      for (const match of normalized.matchAll(elision)) boundaries.add(match.index + match[0].length);
      return candidates.find(keyword => {
        for (let i = normalized.indexOf(keyword); i !== -1; i = normalized.indexOf(keyword, i + 1)) {
          const end = i + keyword.length;
          if (!boundaries.has(i) || !boundaries.has(end)) continue;
          // Keep ASCII identifiers intact if the segmenter splits them.
          if (identifierChar.test(keyword[0]) && identifierChar.test(normalized[i - 1] || '')) continue;
          if (identifierChar.test(keyword.at(-1)) && identifierChar.test(normalized[end] || '')) continue;
          return true;
        }
        return false;
      });
    }
  };
})();
