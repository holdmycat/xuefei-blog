console.log('[home.js] loaded', location.href);
document.addEventListener('DOMContentLoaded', () => {
  // 自托管 MP4 注入（中文区 + 移动端可内联播放）
  const mp4VideoHtml = (src, cover) =>
    `<video class="self-hosted-video" controls autoplay playsinline preload="metadata"${cover ? ` poster="${cover}"` : ''}><source src="${src}" type="video/mp4"></video>`;
  const galleries = document.querySelectorAll('[data-pinned-gallery]');
  console.log('[pinned] boot', { galleryCount: galleries.length });
  galleries.forEach((gallery) => {
    const main = gallery.querySelector('[data-pinned-main]');
    const coverTemplate = main?.querySelector('[data-pinned-play]')?.cloneNode(true);

    const renderCover = () => {
      if (!main || !coverTemplate) return;
      main.removeAttribute('data-state');
      main.innerHTML = '';
      main.appendChild(coverTemplate.cloneNode(true));
    };

    let pinnedYTPlayer = null;
    const playVideo = (playBtn) => {
      if (!main || !playBtn) return;
      const cover = playBtn.dataset.videoCover || '';
      const mp4 = playBtn.dataset.mp4 || '';
      if (mp4) {
        main.setAttribute('data-state', 'playing');
        main.innerHTML = mp4VideoHtml(mp4, cover);
        const fb = gallery.querySelector('.pinned-fallback');
        if (fb) fb.hidden = true;
        return;
      }
      const rawSrc = playBtn.dataset.iframe
        || (playBtn.dataset.bvid ? `https://player.bilibili.com/player.html?bvid=${playBtn.dataset.bvid}&page=1&high_quality=1&danmaku=0` : '');
      if (!rawSrc) return;
      const ytId = (typeof extractYouTubeId === 'function') ? extractYouTubeId(rawSrc) : '';
      main.setAttribute('data-state', 'playing');

      if (ytId && typeof loadYouTubeAPI === 'function') {
        main.innerHTML = `<div id="pinned-yt-mount"></div>`;
        if (pinnedYTPlayer && typeof pinnedYTPlayer.destroy === 'function') {
          try { pinnedYTPlayer.destroy(); } catch (_) {}
        }
        pinnedYTPlayer = null;
        loadYouTubeAPI().then((YT) => {
          const mount = main.querySelector('#pinned-yt-mount');
          if (!mount || !YT || !YT.Player) {
            renderVideoFallback(main, rawSrc, cover, 'Video');
            return;
          }
          try {
            pinnedYTPlayer = new YT.Player(mount, {
              videoId: ytId,
              playerVars: { autoplay: 1, rel: 0, playsinline: 1 },
              events: {
                onError: () => renderVideoFallback(main, rawSrc, cover, 'Video'),
              },
            });
          } catch (_) {
            renderVideoFallback(main, rawSrc, cover, 'Video');
          }
        }).catch(() => renderVideoFallback(main, rawSrc, cover, 'Video'));
      } else {
        const iframeSrc = rawSrc.includes('autoplay=')
          ? rawSrc
          : `${rawSrc}${rawSrc.includes('?') ? '&' : '?'}autoplay=1`;
        main.innerHTML = `<iframe src="${iframeSrc}" title="Video" frameborder="0" loading="lazy" referrerpolicy="no-referrer" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
      }

      const fallback = gallery.querySelector('.pinned-fallback');
      if (fallback) {
        fallback.hidden = false;
      }
    };

    gallery.addEventListener('click', (event) => {
      const playBtn = event.target.closest('[data-pinned-play]');
      if (playBtn && gallery.contains(playBtn)) {
        playVideo(playBtn);
        return;
      }

      const button = event.target.closest('.pinned-thumb');
      if (!button || !gallery.contains(button)) return;

      if (!main) return;

      gallery.querySelectorAll('.pinned-thumb').forEach((thumb) => {
        thumb.classList.toggle('active', thumb === button);
      });

      const mediaType = button.dataset.mediaType;
      if (mediaType === 'video') {
        renderCover();
        return;
      }

      if (mediaType === 'image') {
        const src = button.dataset.src;
        if (!src) return;
        main.removeAttribute('data-state');
        main.innerHTML = `<img src="${src}" alt="Pinned media" loading="lazy" decoding="async">`;
      }
    });
  });

  const projectRows = Array.from(document.querySelectorAll('.project-row[data-project-id]'));
  const projectDataMap = new Map();
  const getProjectData = (row) => {
    if (!row) return null;
    const id = row.dataset.projectId;
    if (id && projectDataMap.has(id)) {
      return projectDataMap.get(id);
    }
    const raw = row.dataset.project;
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      if (id) {
        projectDataMap.set(id, data);
      }
      return data;
    } catch (error) {
      console.warn('[projects] invalid json', id, error);
      return null;
    }
  };

  const modal = document.querySelector('.project-modal');
  const modalThumbs = modal?.querySelector('[data-project-modal-thumbs]');
  const modalTitle = modal?.querySelector('[data-project-modal-title]');
  const modalSubtitle = modal?.querySelector('[data-project-modal-subtitle]');
  const modalDesc = modal?.querySelector('[data-project-modal-desc]');
  const modalResponsibility = modal?.querySelector('[data-project-modal-responsibility]');
  const modalTeam = modal?.querySelector('[data-project-modal-team]');
  const modalPeriod = modal?.querySelector('[data-project-modal-period]');
  const modalTags = modal?.querySelector('[data-project-modal-tags]');
  const modalTech = modal?.querySelector('[data-project-modal-tech]');
  const modalTechWrap = modalTech?.closest('.pinned-tech');
  const modalHighlights = modal?.querySelector('[data-project-modal-highlights]');

  let modalPlayer = null;
  const closeModal = () => {
    if (!modal) return;
    modal.hidden = true;
    if (modalPlayer && typeof modalPlayer.destroy === 'function') {
      try { modalPlayer.destroy(); } catch (_) {}
    }
    modalPlayer = null;
    const player = modal.querySelector('[data-video-player]');
    if (player) {
      player.innerHTML = '';
      player.classList.remove('is-playing');
    }
    if (modalHighlights) modalHighlights.innerHTML = '';
  };

  const getIframeSrc = (video) => {
    if (!video) return '';
    const raw = video.iframe_src
      || (video.bvid ? `https://player.bilibili.com/player.html?bvid=${video.bvid}&page=1&high_quality=1&danmaku=0` : '');
    if (!raw) return '';
    const ytId = (typeof extractYouTubeId === 'function') ? extractYouTubeId(raw) : '';
    if (ytId) {
      const autoplay = video.autoplay ? '&autoplay=1' : '';
      return `https://www.youtube.com/embed/${ytId}?rel=0&enablejsapi=1${autoplay}`;
    }
    if (video.autoplay === true && !raw.includes('autoplay=')) {
      return `${raw}${raw.includes('?') ? '&' : '?'}autoplay=1`;
    }
    return raw;
  };

  const getModalMediaNodes = (modalEl) => {
    if (!modalEl) return {};
    return {
      poster: modalEl.querySelector('[data-video-poster]'),
      posterImg: modalEl.querySelector('[data-video-poster-img]'),
      player: modalEl.querySelector('[data-video-player]'),
    };
  };

  const renderImage = (modalEl, src, alt) => {
    const { player, poster } = getModalMediaNodes(modalEl);
    if (!player) return;
    player.innerHTML = `<img src="${src}" alt="${alt}" loading="lazy" decoding="async">`;
    player.classList.add('is-playing');
    if (poster) {
      poster.hidden = true;
      poster.classList.add('is-hidden');
    }
  };

  const renderVideo = (modalEl, project, options = {}) => {
    const { poster, posterImg, player } = getModalMediaNodes(modalEl);
    if (!player) return;
    const video = project?.video;
    const iframeSrc = getIframeSrc(video);
    const cover = video?.cover || project?.cover || '';
    const shouldPlay = options.play === true;

    player.innerHTML = '';
    player.classList.remove('is-playing');

    if (!iframeSrc && !(video && video.mp4)) {
      if (cover) {
        renderImage(modalEl, cover, `${project?.title || ''} cover`);
      }
      return;
    }

    if (poster) {
      const posterButton = poster.cloneNode(true);
      poster.parentNode?.replaceChild(posterButton, poster);
      const posterImage = posterButton.querySelector('[data-video-poster-img]');
      if (posterImage) {
        posterImage.src = cover || '';
        posterImage.alt = cover ? `${project?.title || ''} video cover` : '';
      }
      posterButton.hidden = !(cover && !shouldPlay);
      posterButton.classList.toggle('is-hidden', shouldPlay);
      if (cover) {
        posterButton.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          renderVideo(modalEl, project, { play: true });
        });
      }
    }

    if (!shouldPlay && cover) {
      return;
    }

    if (video?.mp4) {
      player.innerHTML = mp4VideoHtml(video.mp4, cover);
      player.classList.add('is-playing');
      return;
    }

    const rawSrc = video?.iframe_src
      || (video?.bvid ? `https://player.bilibili.com/player.html?bvid=${video.bvid}&page=1&high_quality=1&danmaku=0` : '');
    const ytId = (typeof extractYouTubeId === 'function') ? extractYouTubeId(rawSrc) : '';

    if (ytId && typeof loadYouTubeAPI === 'function') {
      player.innerHTML = `<div id="modal-yt-mount"></div>`;
      player.classList.add('is-playing');
      if (modalPlayer && typeof modalPlayer.destroy === 'function') {
        try { modalPlayer.destroy(); } catch (_) {}
      }
      modalPlayer = null;
      loadYouTubeAPI().then((YT) => {
        if (!modal || modal.hidden) return;
        const mount = player.querySelector('#modal-yt-mount');
        if (!mount || !YT || !YT.Player) {
          renderVideoFallback(player, rawSrc, cover, project?.title);
          return;
        }
        try {
          modalPlayer = new YT.Player(mount, {
            videoId: ytId,
            playerVars: { autoplay: 1, rel: 0, playsinline: 1 },
            events: {
              onError: () => renderVideoFallback(player, rawSrc, cover, project?.title),
            },
          });
        } catch (_) {
          renderVideoFallback(player, rawSrc, cover, project?.title);
        }
      }).catch(() => renderVideoFallback(player, rawSrc, cover, project?.title));
      return;
    }

    player.innerHTML = `<iframe src="${iframeSrc}" title="${project?.title || 'Video'}" frameborder="0" loading="lazy" referrerpolicy="no-referrer" allow="autoplay; fullscreen; picture-in-picture; accelerometer; clipboard-write; encrypted-media; gyroscope" allowfullscreen></iframe>`;
    player.classList.add('is-playing');
  };

  const setActiveThumb = (button) => {
    if (!modalThumbs) return;
    modalThumbs.querySelectorAll('.pinned-thumb').forEach((thumb) => {
      thumb.classList.toggle('active', thumb === button);
    });
  };

  const renderModal = (project) => {
    if (!modal || !project) return;
    modal.hidden = false;
    if (modalTitle) modalTitle.textContent = project.title || '';
    if (modalSubtitle) {
      modalSubtitle.textContent = project.subtitle || '';
      modalSubtitle.hidden = !project.subtitle;
    }
    if (modalDesc) {
      modalDesc.innerHTML = project.description ? `<p>${project.description}</p>` : '';
      modalDesc.hidden = !project.description;
    }
    if (modalResponsibility) {
      modalResponsibility.textContent = project.responsibility || '';
      modalResponsibility.closest('.meta-row')?.toggleAttribute('hidden', !project.responsibility);
    }
    if (modalTeam) {
      modalTeam.textContent = project.team_size ? `${project.team_size} 人` : '';
      modalTeam.closest('.meta-row')?.toggleAttribute('hidden', !project.team_size);
    }
    if (modalPeriod) {
      modalPeriod.textContent = project.period || '';
      modalPeriod.closest('.meta-row')?.toggleAttribute('hidden', !project.period);
    }
    const metaExtra = modalResponsibility?.closest('.pinned-meta-extra');
    if (metaExtra) {
      metaExtra.toggleAttribute('hidden', !project.responsibility && !project.team_size);
    }
    const metaPeriod = modalPeriod?.closest('.pinned-meta');
    if (metaPeriod) {
      metaPeriod.toggleAttribute('hidden', !project.period);
    }
    if (modalTags) {
      modalTags.innerHTML = '';
      (project.tags || []).forEach((tag) => {
        const span = document.createElement('span');
        span.className = 'tag';
        span.textContent = tag;
        modalTags.appendChild(span);
      });
      modalTags.hidden = !(project.tags && project.tags.length);
    }
    if (modalTech) {
      modalTech.innerHTML = '';
      (project.tech_stack || []).forEach((tech) => {
        const span = document.createElement('span');
        span.className = 'chip';
        span.textContent = tech;
        modalTech.appendChild(span);
      });
      if (modalTechWrap) {
        modalTechWrap.toggleAttribute('hidden', !(project.tech_stack && project.tech_stack.length));
      } else {
        modalTech.hidden = !(project.tech_stack && project.tech_stack.length);
      }
    }

    if (project.video?.iframe_src || project.video?.bvid) {
      renderVideo(modal, project, { play: false });
    } else if (project.cover) {
      renderImage(modal, project.cover, `${project.title} cover`);
    } else if (project.gallery?.[0]) {
      renderImage(modal, project.gallery[0], `${project.title} cover`);
    }
    if (modalThumbs) {
      modalThumbs.innerHTML = '';
    if (project.video?.cover) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pinned-thumb pinned-thumb--video';
        button.dataset.mediaType = 'video';
        button.dataset.iframe = project.video.iframe_src || '';
        button.dataset.bvid = project.video.bvid || '';
        button.innerHTML = `<img src="${project.video.cover}" alt="${project.title} video thumbnail" loading="lazy" decoding="async"><span class="pinned-thumb-play" aria-hidden="true"></span>`;
      modalThumbs.appendChild(button);
      setActiveThumb(button);
    } else if (project.video?.iframe_src || project.video?.bvid) {
      renderVideo(modal, project, { play: true });
    }
      (project.gallery || []).forEach((src) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'pinned-thumb';
        button.dataset.mediaType = 'image';
        button.dataset.src = src;
        button.innerHTML = `<img src="${src}" alt="${project.title} thumbnail" loading="lazy" decoding="async">`;
        modalThumbs.appendChild(button);
        if (!modalThumbs.querySelector('.pinned-thumb.active') && !project.video?.cover) {
          setActiveThumb(button);
        }
      });
      modalThumbs.hidden = !modalThumbs.childElementCount;
    }

    if (modalHighlights) {
      modalHighlights.innerHTML = '';
      const highlights = project.tech_highlights || [];
      highlights.forEach((h, i) => {
        const article = document.createElement('article');
        article.className = 'hub-feature';
        let mediaHtml;
        if (h.mp4) {
          mediaHtml = `<div class="hub-feature-video-wrap"><video class="hub-feature-video" controls playsinline preload="metadata"${h.poster ? ` poster="${h.poster}"` : ''}><source src="${h.mp4}" type="video/mp4"></video></div>`;
        } else if (h.bilibili) {
          mediaHtml = `<div class="hub-feature-video-wrap"><iframe src="https://player.bilibili.com/player.html?bvid=${h.bilibili}&page=1&high_quality=1&danmaku=0&autoplay=0" title="${h.title || ''}" frameborder="0" loading="lazy" referrerpolicy="no-referrer" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`;
        } else if (h.youtube) {
          mediaHtml = `<div class="hub-feature-video-wrap"><iframe src="https://www.youtube.com/embed/${h.youtube}" title="${h.title || ''}" frameborder="0" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen" allowfullscreen></iframe></div>`;
        } else {
          mediaHtml = `<div class="hub-media-placeholder hub-media-placeholder--feature"><div class="placeholder-icon">▶</div><div class="placeholder-label">${h.title || ''}</div></div>`;
        }
        article.innerHTML =
          `<h3 class="hub-feature-title"><span class="hub-feature-no">${i + 1}</span>${h.title || ''}</h3>` +
          mediaHtml +
          (h.caption ? `<p class="hub-feature-caption">${h.caption}</p>` : '');
        modalHighlights.appendChild(article);
      });
      modalHighlights.hidden = highlights.length === 0;
    }
  };

  const bindModalEvents = () => {
    if (!modal) return;
    const backdrop = modal.querySelector('.project-modal__backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) {
          closeModal();
        }
      });
    }
    modal.querySelectorAll('[data-project-modal-close]:not(.project-modal__backdrop)').forEach((node) => {
      node.addEventListener('click', closeModal);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !modal.hidden) {
        closeModal();
      }
    });
    modalThumbs?.addEventListener('click', (event) => {
      const button = event.target.closest('.pinned-thumb');
      if (!button) return;
      const projectId = modal.dataset.projectId;
      const project = projectDataMap.get(projectId);
      if (!project) return;
      if (button.dataset.mediaType === 'video') {
        renderVideo(modal, project, { play: false });
      } else if (button.dataset.mediaType === 'image') {
        const src = button.dataset.src;
        if (!src) return;
        renderImage(modal, src, `${project.title} media`);
      }
      setActiveThumb(button);
    });
  };

  bindModalEvents();

  const extractYouTubeId = (rawUrl) => {
    if (!rawUrl) return '';
    const url = rawUrl.trim();
    let m = url.match(/youtu\.be\/([\w-]{6,})/i); if (m) return m[1];
    m = url.match(/youtube\.com\/shorts\/([\w-]{6,})/i); if (m) return m[1];
    m = url.match(/youtube\.com\/embed\/([\w-]{6,})/i); if (m) return m[1];
    m = url.match(/[?&]v=([\w-]{6,})/i); if (m && /youtube\.com/i.test(url)) return m[1];
    return '';
  };

  const toEmbedUrl = (rawUrl) => {
    if (!rawUrl) return '';
    const ytId = extractYouTubeId(rawUrl);
    if (ytId) return `https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0&enablejsapi=1`;
    const url = rawUrl.trim();
    return url.includes('autoplay=') ? url : `${url}${url.includes('?') ? '&' : '?'}autoplay=1`;
  };

  const getWatchUrl = (rawUrl) => {
    const id = extractYouTubeId(rawUrl);
    return id ? `https://www.youtube.com/watch?v=${id}` : rawUrl;
  };

  let ytApiPromise = null;
  const loadYouTubeAPI = () => {
    if (ytApiPromise) return ytApiPromise;
    ytApiPromise = new Promise((resolve) => {
      if (window.YT && window.YT.Player) { resolve(window.YT); return; }
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prev === 'function') { try { prev(); } catch (_) {} }
        resolve(window.YT);
      };
      if (!document.querySelector('script[data-yt-iframe-api]')) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        tag.async = true;
        tag.dataset.ytIframeApi = '1';
        document.head.appendChild(tag);
      }
    });
    return ytApiPromise;
  };

  let videoPopup = null;
  let videoPopupPlayer = null;
  const closeVideoPopup = () => {
    if (!videoPopup) return;
    if (videoPopupPlayer && typeof videoPopupPlayer.destroy === 'function') {
      try { videoPopupPlayer.destroy(); } catch (_) {}
    }
    videoPopupPlayer = null;
    videoPopup.remove();
    videoPopup = null;
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onVideoPopupKey);
  };
  const onVideoPopupKey = (event) => {
    if (event.key === 'Escape') closeVideoPopup();
  };

  const renderVideoFallback = (containerEl, rawUrl, cover, title) => {
    if (!containerEl) return;
    const watchUrl = getWatchUrl(rawUrl);
    const coverHtml = cover
      ? `<img class="video-popup__fallback-cover" src="${cover}" alt="${title || ''} cover">`
      : '';
    containerEl.innerHTML = `
      <div class="video-popup__fallback">
        ${coverHtml}
        <div class="video-popup__fallback-body">
          <p class="video-popup__fallback-msg">This video can't be embedded.</p>
          <a class="video-popup__fallback-btn" href="${watchUrl}" target="_blank" rel="noopener noreferrer">Open on YouTube ↗</a>
        </div>
      </div>`;
  };

  const openVideoPopup = (rawSrc, title, cover, opts = {}) => {
    if (!rawSrc) return;
    closeVideoPopup();
    const embedSrc = toEmbedUrl(rawSrc);
    const ytId = extractYouTubeId(rawSrc);
    const watchUrl = getWatchUrl(rawSrc);
    const overlay = document.createElement('div');
    overlay.className = 'video-popup';
    const escapeHatch = ytId
      ? `<a class="video-popup__open-yt" href="${watchUrl}" target="_blank" rel="noopener noreferrer">Open on YouTube ↗</a>`
      : '';
    overlay.innerHTML = `
      <div class="video-popup__backdrop"></div>
      <div class="video-popup__frame" role="dialog" aria-modal="true" aria-label="${title || 'Video player'}">
        <button type="button" class="video-popup__close" aria-label="Close">×</button>
        ${escapeHatch}
        <div class="video-popup__player">
          <div id="video-popup-mount"></div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    videoPopup = overlay;
    overlay.querySelector('.video-popup__backdrop')?.addEventListener('click', closeVideoPopup);
    overlay.querySelector('.video-popup__close')?.addEventListener('click', closeVideoPopup);
    document.addEventListener('keydown', onVideoPopupKey);

    const playerContainer = overlay.querySelector('.video-popup__player');
    if (opts.mp4) {
      const mount = overlay.querySelector('#video-popup-mount');
      if (mount) mount.outerHTML = mp4VideoHtml(rawSrc, cover);
      return;
    }
    if (ytId) {
      loadYouTubeAPI().then((YT) => {
        if (!videoPopup || videoPopup !== overlay) return;
        const mount = overlay.querySelector('#video-popup-mount');
        if (!mount || !YT || !YT.Player) {
          renderVideoFallback(playerContainer, rawSrc, cover, title);
          return;
        }
        try {
          videoPopupPlayer = new YT.Player(mount, {
            videoId: ytId,
            playerVars: { autoplay: 1, rel: 0, playsinline: 1 },
            events: {
              onError: () => renderVideoFallback(playerContainer, rawSrc, cover, title),
            },
          });
        } catch (_) {
          renderVideoFallback(playerContainer, rawSrc, cover, title);
        }
      }).catch(() => renderVideoFallback(playerContainer, rawSrc, cover, title));
    } else {
      const mount = overlay.querySelector('#video-popup-mount');
      if (mount) {
        mount.outerHTML = `<iframe src="${embedSrc}" title="${title || 'Video player'}" frameborder="0" loading="lazy" referrerpolicy="no-referrer" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
      }
    }
  };

  projectRows.forEach((row) => {
    const playBtn = row.querySelector('[data-project-play]');
    const detailBtn = row.querySelector('[data-project-detail]');

    if (playBtn) {
      playBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const title = row.querySelector('.project-title')?.textContent?.trim() || 'Video';
        const cover = playBtn.dataset.projectVideoCover || '';
        const mp4 = playBtn.dataset.projectMp4 || '';
        if (mp4) { openVideoPopup(mp4, title, cover, { mp4: true }); return; }
        const rawSrc = playBtn.dataset.projectIframe
          || (playBtn.dataset.projectBvid
            ? `https://player.bilibili.com/player.html?bvid=${playBtn.dataset.projectBvid}&page=1&high_quality=1&danmaku=0`
            : '');
        openVideoPopup(rawSrc, title, cover);
      });
    }

    if (detailBtn && modal) {
      detailBtn.addEventListener('click', () => {
        const projectId = row.dataset.projectId;
        const project = getProjectData(row);
        if (!project) return;
        modal.dataset.projectId = projectId;
        renderModal(project);
      });
    }

    row.addEventListener('click', (event) => {
      if (event.target.closest('button, a')) return;
      if (!detailBtn || !modal) return;
      const projectId = row.dataset.projectId;
      const project = getProjectData(row);
      if (!project) return;
      modal.dataset.projectId = projectId;
      renderModal(project);
    });
  });

  const filterBar = document.querySelector('[data-project-filters]');
  const list = document.querySelector('[data-project-list]');
  if (!filterBar || !list) return;

  const buttons = Array.from(filterBar.querySelectorAll('.filter-tag'));
  const cards = Array.from(list.querySelectorAll('.project-card'));
  const activeFilters = new Set();

  const normalizeTags = (value) => (value || '')
    .split(' ')
    .map((tag) => tag.trim())
    .filter(Boolean);

  const applyFilters = () => {
    if (activeFilters.size === 0) {
      cards.forEach((card) => { card.hidden = false; });
      return;
    }

    cards.forEach((card) => {
      const tags = normalizeTags(card.dataset.tags);
      const matches = Array.from(activeFilters).every((filter) => tags.includes(filter));
      card.hidden = !matches;
    });
  };

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const filter = button.dataset.filter;
      if (!filter) return;

      if (activeFilters.has(filter)) {
        activeFilters.delete(filter);
        button.classList.remove('active');
      } else {
        activeFilters.add(filter);
        button.classList.add('active');
      }

      applyFilters();
    });
  });
});

document.addEventListener('DOMContentLoaded', () => {
  const wrapper = document.querySelector('[data-home-tabs]');
  if (!wrapper) return;

  const tabs = Array.from(wrapper.querySelectorAll('.home-tab'));
  const panels = Array.from(wrapper.querySelectorAll('.home-tab-panel'));
  if (tabs.length === 0 || panels.length === 0) return;

  const validKeys = tabs.map((t) => t.dataset.tab);

  const activate = (key, { updateHash = true } = {}) => {
    if (!validKeys.includes(key)) {
      key = validKeys[0];
    }
    tabs.forEach((tab) => {
      const isActive = tab.dataset.tab === key;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    panels.forEach((panel) => {
      const isActive = panel.dataset.panel === key;
      panel.classList.toggle('is-active', isActive);
      if (isActive) {
        panel.removeAttribute('hidden');
      } else {
        panel.setAttribute('hidden', '');
      }
    });
    if (updateHash) {
      const targetHash = key === validKeys[0] ? '' : `#${key}`;
      if ((location.hash || '') !== targetHash) {
        history.replaceState(null, '', `${location.pathname}${location.search}${targetHash}`);
      }
    }
    if (window.mermaid && key === 'ai') {
      try { window.mermaid.run(); } catch (_) { /* noop */ }
    }
  };

  const initial = (location.hash || '').replace(/^#/, '');
  activate(initial || validKeys[0], { updateHash: false });

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => activate(tab.dataset.tab));
  });

  window.addEventListener('hashchange', () => {
    const key = (location.hash || '').replace(/^#/, '') || validKeys[0];
    activate(key, { updateHash: false });
  });
});

// ============ Preserve tab on language switch ============
document.addEventListener('DOMContentLoaded', () => {
  const langBtns = document.querySelectorAll('.lang-btn, .hero-lang-btn');
  if (!langBtns.length) return;
  langBtns.forEach((btn) => {
    btn.addEventListener('click', (event) => {
      const wrapper = document.querySelector('[data-home-tabs]');
      if (!wrapper) return;
      const allTabs = Array.from(wrapper.querySelectorAll('.home-tab'));
      const activeTab = wrapper.querySelector('.home-tab.is-active');
      if (!activeTab || allTabs.length === 0) return;
      // 默认 tab（第一个）不需要 hash
      if (allTabs[0] === activeTab) return;
      const tabKey = activeTab.dataset.tab;
      if (!tabKey) return;
      event.preventDefault();
      const url = new URL(btn.href, location.origin);
      url.hash = '#' + tabKey;
      window.location.href = url.toString();
    });
  });
});

// ============ Lightbox (image zoom with prev/next) ============
document.addEventListener('DOMContentLoaded', () => {
  if (!document.body.classList.contains('home-page')) return;

  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.setAttribute('hidden', '');
  overlay.innerHTML = `
    <button type="button" class="lightbox-close" aria-label="Close">×</button>
    <button type="button" class="lightbox-nav lightbox-prev" aria-label="Previous">‹</button>
    <button type="button" class="lightbox-nav lightbox-next" aria-label="Next">›</button>
    <img class="lightbox-image" alt="">
  `;
  document.body.appendChild(overlay);

  const imgEl = overlay.querySelector('.lightbox-image');
  const closeBtn = overlay.querySelector('.lightbox-close');
  const prevBtn = overlay.querySelector('.lightbox-prev');
  const nextBtn = overlay.querySelector('.lightbox-next');
  let prevBodyOverflow = '';
  let currentGallery = [];
  let currentIndex = 0;

  const sameUrl = (a, b) => {
    if (!a || !b) return false;
    const norm = (u) => u.split('?')[0].split('#')[0].split('/').pop();
    return norm(a) === norm(b);
  };

  const collectGallery = (clickedImg) => {
    const galleryRoot = clickedImg.closest('[data-pinned-gallery]');
    if (galleryRoot) {
      const thumbs = galleryRoot.querySelectorAll('.pinned-thumb[data-src]');
      if (thumbs.length) {
        const items = Array.from(thumbs).map((t) => ({
          src: t.dataset.src,
          alt: t.querySelector('img')?.alt || '',
        }));
        const clickedSrc = clickedImg.currentSrc || clickedImg.src;
        let idx = items.findIndex((it) => sameUrl(it.src, clickedSrc));
        if (idx < 0) idx = 0;
        return { items, index: idx };
      }
    }
    const featuresRoot = clickedImg.closest('.hub-features');
    if (featuresRoot) {
      const imgs = featuresRoot.querySelectorAll('.hub-feature-media img');
      if (imgs.length) {
        const items = Array.from(imgs).map((i) => ({
          src: i.currentSrc || i.src,
          alt: i.alt || '',
        }));
        const idx = Array.from(imgs).indexOf(clickedImg);
        return { items, index: idx < 0 ? 0 : idx };
      }
    }
    return {
      items: [{ src: clickedImg.currentSrc || clickedImg.src, alt: clickedImg.alt || '' }],
      index: 0,
    };
  };

  const render = () => {
    const item = currentGallery[currentIndex];
    if (!item) return;
    imgEl.src = item.src;
    imgEl.alt = item.alt;
    const multi = currentGallery.length > 1;
    prevBtn.toggleAttribute('hidden', !multi);
    nextBtn.toggleAttribute('hidden', !multi);
  };

  const open = (clickedImg) => {
    const { items, index } = collectGallery(clickedImg);
    if (!items.length) return;
    currentGallery = items;
    currentIndex = index;
    render();
    overlay.removeAttribute('hidden');
    prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  };

  const close = () => {
    if (overlay.hasAttribute('hidden')) return;
    overlay.setAttribute('hidden', '');
    imgEl.removeAttribute('src');
    document.body.style.overflow = prevBodyOverflow;
    currentGallery = [];
  };

  const navigate = (delta) => {
    if (currentGallery.length <= 1) return;
    currentIndex = (currentIndex + delta + currentGallery.length) % currentGallery.length;
    render();
  };

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLImageElement)) return;
    if (!target.closest('.pinned-main, .hub-feature-media')) return;
    event.preventDefault();
    open(target);
  });

  closeBtn.addEventListener('click', close);
  prevBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    navigate(-1);
  });
  nextBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    navigate(1);
  });
  imgEl.addEventListener('click', (event) => {
    event.stopPropagation();
  });
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  document.addEventListener('keydown', (event) => {
    if (overlay.hasAttribute('hidden')) return;
    if (event.key === 'Escape') close();
    else if (event.key === 'ArrowLeft') navigate(-1);
    else if (event.key === 'ArrowRight') navigate(1);
  });
});
