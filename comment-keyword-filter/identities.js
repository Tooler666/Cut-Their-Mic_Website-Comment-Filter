(() => {
  'use strict';
  const configurations = {
    youtube: {
      path: /^\/(?:@[^/]+|channel\/UC[\w-]+)\/?$/u,
      comment: 'a#author-text, #author-text a',
      viewer: '#account-menu a[href^="/@"], ytd-active-account-header-renderer a[href^="/@"]',
      owner: 'ytd-video-owner-renderer ytd-channel-name a, #upload-info ytd-channel-name a',
      ownerPage: /^(?:\/watch|\/shorts\/[^/]+)$/,
      creator: 'ytd-author-comment-badge-renderer[creator]'
    },
    tiktok: {
      path: /^\/@[\w.]+\/?$/,
      comment: '[data-e2e^="comment-username"] a, a[data-e2e^="comment-username"]',
      viewer: 'a[data-e2e="nav-profile"], [data-e2e="profile-icon"] a',
      owner: '[data-e2e="browse-username"] a, a[data-e2e="browse-username"]'
    },
    douyin: {
      path: /^\/user\/[\w-]+\/?$/,
      comment: '.comment-item-info-wrap a[href*="/user/"]',
      viewer: '[data-e2e="user-avatar"] a[href*="/user/"], a[data-e2e="user-avatar"][href*="/user/"]',
      owner: '[data-e2e="video-author-name"] a[href*="/user/"], a[data-e2e="video-author-name"][href*="/user/"]',
      ownerPage: /^\/video\/\d+/
    },
    xiaohongshu: {
      path: /^\/user\/profile\/[a-f0-9]+\/?$/i,
      comment: '.author-wrapper a[href*="/user/profile/"], a.name[href*="/user/profile/"]',
      viewer: '.user-side-bar a[href^="/user/profile/"], a[data-testid="my-profile"][href^="/user/profile/"]',
      owner: '.note-container .author-container a[href*="/user/profile/"], #noteContainer .author-container a[href*="/user/profile/"]'
    },
    instagram: {
      path: /^\/[\w.]+\/?$/,
      comment: 'a[href^="/"]',
      viewer: 'nav a:has(img[alt$=" profile picture"]), a[data-testid="nav-profile"]',
      owner: 'article header a[href^="/"], [role="dialog"] header a[href^="/"]',
      ownerPage: /^\/(?:p|reel|reels)\/[^/]+/
    },
    reddit: {
      path: /^\/(?:user|u)\/[\w-]+\/?$/i,
      comment: 'a.author, [slot="authorName"] a',
      viewer: '#user-drawer-content a[href^="/user/"], #header-account-menu a[href^="/user/"], #header-bottom-right a.user'
    },
    tieba: {
      path: /^\/home\/main\/?$/,
      comment: 'a.p_author_name, a.j_user_card',
      viewer: '.u_username a[href*="/home/main"], #com_userbar a[href*="/home/main"]'
    },
    facebook: {
      path: /^\/(?:profile\.php|[\w.]+)\/?$/i,
      comment: 'a[role="link"][href]',
      viewer: 'a[href*="profile.php?id="][aria-current="page"][data-testid="blue_bar_profile_link"], a[data-testid="blue_bar_profile_link"]',
      owner: '[data-pagelet^="FeedUnit"] h2 a[href], [data-pagelet^="FeedUnit"] h3 a[href]',
      ownerPage: /\/(?:posts|videos|reel)\/|^\/permalink\.php$/
    }
  };
  const domains = { youtube:'youtube.com', tiktok:'tiktok.com', douyin:'douyin.com',
    xiaohongshu:'xiaohongshu.com', instagram:'instagram.com', reddit:'reddit.com',
    tieba:'tieba.baidu.com', facebook:'facebook.com' };

  function profile(site, link) {
    if (!link) return null;
    const domain = domains[site];
    if (link.hostname !== domain && !link.hostname.endsWith('.' + domain)) return null;
    const path = link.pathname.replace(/\/$/, '');
    if (!configurations[site].path.test(path)) return null;
    if (site === 'tieba') {
      // Numeric IDs, never the nickname in the "un" parameter.
      const id = new URL(link.href).searchParams.get('id');
      return /^\d+$/.test(id || '') ? id : null;
    }
    if (site === 'facebook') {
      const id = new URL(link.href).searchParams.get('id');
      if (path === '/profile.php') return /^\d+$/.test(id || '') ? id : null;
      if (/^\/(?:home|watch|reels|groups|people|marketplace|notifications|share|login|help)$/i.test(path)) return null;
    }
    if (site === 'instagram' && /^\/(p|reel|reels|explore|accounts|direct|stories)$/i.test(path)) return null;
    if (site === 'reddit') return '/user/' + path.split('/').at(-1).toLowerCase();
    if (site === 'youtube' && path.startsWith('/channel/')) return path;
    // Douyin IDs are case-sensitive. A visible nickname is not an account ID.
    return site === 'douyin' ? path : path.toLowerCase();
  }

  function uniqueProfile(site, scope, selector) {
    if (!selector) return null;
    const accounts = new Set(Array.from(scope.querySelectorAll(selector), link => profile(site, link)).filter(Boolean));
    return accounts.size === 1 ? accounts.values().next().value : null;
  }

  function redditUser(value) {
    const name = value?.replace(/^u\//i, '');
    return name && /^(?!\[deleted\]$)[\w-]+$/i.test(name) ? '/user/' + name.toLowerCase() : null;
  }

  function tiebaData(row) {
    try { return JSON.parse(row.getAttribute('data-field') || '{}'); }
    catch { return {}; }
  }

  function tiebaUser(data) {
    const id = String(data.author?.user_id ?? data.user_id ?? '');
    return /^\d+$/.test(id) ? id : null;
  }

  globalThis.commentFilterIdentities = {
    viewer(site) {
      const config = configurations[site];
      if (site === 'reddit') {
        const name = redditUser(document.querySelector('shreddit-app')?.getAttribute('user'));
        if (name) return name;
      }
      return config ? uniqueProfile(site, document, config.viewer) : null;
    },
    author(site, row, body) {
      const config = configurations[site];
      if (!config) return null;
      if (site === 'reddit') {
        const name = redditUser(row.getAttribute('author'));
        if (name) return name;
      }
      if (site === 'tieba') {
        const id = tiebaUser(tiebaData(row));
        if (id) return id;
      }
      const scope = site === 'tiktok'
        ? row.closest('[class*="CommentItem"], [class*="ContentWrapper"]') || row
        : row;
      const links = Array.from(scope.querySelectorAll(config.comment)).filter(link =>
        !body.contains(link) && (link.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING) &&
        !link.closest('[data-testid="quoteTweet"]') &&
        (site !== 'facebook' || link.closest('[role="article"], [data-testid^="UFI2Comment/root"]') === row)
      );
      return links.map(link => profile(site, link)).find(Boolean) || null;
    },
    markedCreator(site, row) {
      const selector = configurations[site]?.creator;
      return !!selector && !!row.querySelector(selector);
    },
    owner(site, pathname) {
      const config = configurations[site];
      if (!config) return null;
      if (site === 'tiktok') {
        const handle = pathname.match(/^\/(\@[\w.]+)\/video\/\d+/)?.[1];
        if (handle) return '/' + handle.toLowerCase();
        if (!pathname.startsWith('/video/')) return null;
      }
      if (site === 'reddit') {
        const id = pathname.match(/\/comments\/([a-z0-9]+)(?:\/|$)/i)?.[1];
        if (!id) return null;
        const fullname = 't3_' + id.toLowerCase();
        const post = Array.from(document.querySelectorAll('shreddit-post[author]'))
          .find(item => [item.id, item.getAttribute('post-id'), item.getAttribute('thingid')].includes(fullname));
        const legacy = Array.from(document.querySelectorAll('.thing.link[data-fullname]'))
          .find(item => item.getAttribute('data-fullname') === fullname);
        return redditUser(post?.getAttribute('author')) ||
          (legacy && uniqueProfile(site, legacy, '.tagline a.author'));
      }
      if (site === 'tieba') {
        if (!/^\/p\/\d+/.test(pathname)) return null;
        for (const row of document.querySelectorAll('.l_post[data-field]')) {
          const data = tiebaData(row);
          if (String(data.content?.post_no) === '1') return tiebaUser(data);
        }
        return null;
      }
      if (config.ownerPage && !config.ownerPage.test(pathname)) return null;
      return uniqueProfile(site, document, config.owner);
    }
  };
})();
