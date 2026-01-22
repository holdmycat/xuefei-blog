console.log('[home.js] loaded', location.href);
document.addEventListener('DOMContentLoaded', () => {
  const gallery = document.querySelector('[data-pinned-gallery]');
  console.log('[pinned] boot', { hasGallery: !!gallery });
  if (gallery) {
    const main = gallery.querySelector('[data-pinned-main]');
    const coverTemplate = main?.querySelector('[data-pinned-play]')?.cloneNode(true);
    if (!coverTemplate) {
      console.warn('[pinned] no play button');
    }

    const renderCover = () => {
      if (!main || !coverTemplate) return;
      main.removeAttribute('data-state');
      main.innerHTML = '';
      main.appendChild(coverTemplate.cloneNode(true));
    };

    const playVideo = (playBtn) => {
      if (!main || !playBtn) return;
      console.log('[pinned] play click');
      const iframeSrc = playBtn.dataset.iframe
        || `https://player.bilibili.com/player.html?bvid=${playBtn.dataset.bvid}&page=1&high_quality=1&danmaku=0&autoplay=1`;
      main.setAttribute('data-state', 'playing');
      main.innerHTML = `<iframe src="${iframeSrc}" title="Bilibili video" frameborder="0" loading="lazy" referrerpolicy="no-referrer" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
      console.log('[pinned] iframe inserted', main.querySelector('iframe')?.src);
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
  }

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

  const closeModal = () => {
    if (!modal) return;
    modal.hidden = true;
    const player = modal.querySelector('[data-video-player]');
    if (player) {
      player.innerHTML = '';
      player.classList.remove('is-playing');
    }
  };

  const getIframeSrc = (video) => {
    if (!video) return '';
    if (video.iframe_src) {
      if (video.autoplay === true && !video.iframe_src.includes('autoplay=')) {
        return `${video.iframe_src}&autoplay=1`;
      }
      return video.iframe_src;
    }
    if (video.bvid) {
      const autoplay = video.autoplay ? '&autoplay=1' : '';
      return `https://player.bilibili.com/player.html?bvid=${video.bvid}&page=1&high_quality=1&danmaku=0${autoplay}`;
    }
    return '';
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

    if (!iframeSrc) {
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

    player.innerHTML = `<iframe src="${iframeSrc}" title="Bilibili video" frameborder="0" loading="lazy" referrerpolicy="no-referrer" allow="autoplay; fullscreen; picture-in-picture; accelerometer; clipboard-write; encrypted-media; gyroscope" allowfullscreen></iframe>`;
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

  projectRows.forEach((row) => {
    const playBtn = row.querySelector('[data-project-play]');
    const detailBtn = row.querySelector('[data-project-detail]');
    const main = row.querySelector('[data-project-main]');
    const coverTemplate = main?.innerHTML || '';

    if (playBtn && main) {
      playBtn.addEventListener('click', () => {
        const iframeSrc = playBtn.dataset.projectIframe
          || `https://player.bilibili.com/player.html?bvid=${playBtn.dataset.projectBvid}&page=1&high_quality=1&danmaku=0&autoplay=1`;
        main.innerHTML = `<iframe src="${iframeSrc}${iframeSrc.includes('autoplay=') ? '' : '&autoplay=1'}" title="Bilibili video" frameborder="0" loading="lazy" referrerpolicy="no-referrer" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
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
