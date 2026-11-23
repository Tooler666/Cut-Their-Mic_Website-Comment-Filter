(() => {
  'use strict';

  const rules = globalThis.commentFilterRules;
  const dictionaries = [
    {
      english: 'fuck,fucking,fucked,fucker,fuckers,motherfucker,motherfuckers,cunt,cunts,cocksucker,go fuck yourself',
      chinese: '操你妈,操你媽,草你妈,草你媽,去你妈的,去你媽的,干你娘,幹你娘,妈了个逼,媽了個逼,狗娘养的,狗娘養的'
    },
    {
      english: 'shit,shitty,bullshit,asshole,assholes,dickhead,dickheads,piece of shit,son of a bitch,bitch,bitches',
      chinese: '傻逼,傻屄,脑残,腦殘,王八蛋,臭傻逼,他妈的,他媽的,你妈的,你媽的,狗东西,狗東西'
    },
    {
      english: 'damn,goddamn,dumbass,dumbasses,jackass,jackasses,idiot,idiots',
      chinese: '白痴,蠢货,蠢貨,废物,廢物,滚蛋,滾蛋,混蛋'
    }
  ];

  // Match a small set of known spellings at the token boundary. Avoid
  // removing all punctuation or treating similar-looking words as profanity.
  const masked = /(?<![\p{L}\p{N}_])(?:f[*#]ck|f\s*\.\s*u\s*\.\s*c\s*\.\s*k|sh[1*]t|a55hole|b[1*]tch)(?![\p{L}\p{N}_])/iu;
  const dictionariesByLevel = new Map(
    Object.entries({ clear: 1, common: 2, extended: 3 }).map(([level, count]) => {
      const entries = dictionaries.slice(0, count);
      return [level, {
        english: rules.compile(entries.map(entry => entry.english).join(',')),
        chinese: rules.compile(entries.map(entry => entry.chinese).join(','))
      }];
    })
  );

  globalThis.commentFilterProfanity = {
    find(text, level) {
      const dictionary = dictionariesByLevel.get(level);
      if (!dictionary) return undefined;
      const match = rules.find(text, dictionary.english) ||
        rules.find(text, dictionary.chinese, [], 'contains');
      if (match) return { word: match, level: 'profanityTitle' };
      if (level !== 'extended') return undefined;
      const clean = text.normalize('NFKC').replace(/[\u200B-\u200D\u2060\uFEFF]/g, '');
      const variant = clean.match(masked)?.[0];
      return variant ? { word: variant, level: 'profanityTitle' } : undefined;
    }
  };
})();
