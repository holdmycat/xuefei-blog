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
  document.querySelectorAll('script[data-project-json]').forEach((script) => {
    const id = script.dataset.projectJson;
    if (!id) return;
    try {
      projectDataMap.set(id, JSON.parse(script.textContent));
    } catch (error) {
      console.warn('[projects] invalid json', id, error);
    }
  });

  const modal = document.querySelector('.project-modal');
  const modalMain = modal?.querySelector('[data-project-modal-main]');
  const modalThumbs = modal?.querySelector('[data-project-modal-thumbs]');
  const modalTitle = modal?.querySelector('[data-project-modal-title]');
  const modalSubtitle = modal?.querySelector('[data-project-modal-subtitle]');
  const modalDesc = modal?.querySelector('[data-project-modal-desc]');
  const modalResponsibility = modal?.querySelector('[data-project-modal-responsibility]');
  const modalTeam = modal?.querySelector('[data-project-modal-team]');
  const modalPeriod = modal?.querySelector('[data-project-modal-period]');
  const modalTags = modal?.querySelector('[data-project-modal-tags]');
  const modalTech = modal?.querySelector('[data-project-modal-tech]');
  const modalLinks = modal?.querySelector('[data-project-modal-links]');

  const closeModal = () => {
    if (!modal) return;
    modal.hidden = true;
    if (modalMain) {
      modalMain.innerHTML = '';
    }
  };

  const renderModalCover = (project) => {
    if (!modalMain || !project?.video?.cover) return;
    modalMain.innerHTML = '';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pinned-video-cover';
    button.setAttribute('data-project-modal-play', 'true');
    button.dataset.iframe = project.video.iframe_src || '';
    button.dataset.bvid = project.video.bvid || '';
    button.setAttribute('aria-label', 'Play video');
    button.innerHTML = `<img src="${project.video.cover}" alt="${project.title} video cover" loading="lazy" decoding="async"><span class="play-icon" aria-hidden="true"></span>`;
    modalMain.appendChild(button);
  };

  const renderModalIframe = (project) => {
    if (!modalMain) return;
    const iframeSrc = project?.video?.iframe_src
      || `https://player.bilibili.com/player.html?bvid=${project?.video?.bvid}&page=1&high_quality=1&danmaku=0&autoplay=1`;
    modalMain.innerHTML = `<iframe src="${iframeSrc}${iframeSrc.includes('autoplay=') ? '' : '&autoplay=1'}" title="Bilibili video" frameborder="0" loading="lazy" referrerpolicy="no-referrer" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
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
      modalDesc.textContent = project.description || '';
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
      modalTech.hidden = !(project.tech_stack && project.tech_stack.length);
    }
    if (modalLinks) {
      modalLinks.innerHTML = '';
      const links = project.links || {};
      const linkPairs = [
        { label: 'Demo', href: links.demo },
        { label: 'GitHub', href: links.github },
        { label: 'Steam', href: links.steam },
        { label: 'Bilibili', href: links.bilibili },
      ];
      linkPairs.forEach((item) => {
        if (!item.href) return;
        const link = document.createElement('a');
        link.className = 'btn';
        link.href = item.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = item.label;
        modalLinks.appendChild(link);
      });
      modalLinks.hidden = !modalLinks.childElementCount;
    }

    if (project.video?.cover) {
      renderModalCover(project);
    } else if (project.cover) {
      modalMain.innerHTML = `<img src="${project.cover}" alt="${project.title} cover" loading="lazy" decoding="async">`;
    }
    if (modalThumbs) {
      modalThumbs.innerHTML = '';
      if (project.video?.cover) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'project-modal__thumb project-modal__thumb--video';
        button.dataset.mediaType = 'video';
        button.dataset.iframe = project.video.iframe_src || '';
        button.dataset.bvid = project.video.bvid || '';
        button.innerHTML = `<img src="${project.video.cover}" alt="${project.title} video thumbnail" loading="lazy" decoding="async"><span class="project-modal__thumb-play" aria-hidden="true"></span>`;
        modalThumbs.appendChild(button);
      }
      (project.gallery || []).forEach((src) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'project-modal__thumb';
        button.dataset.mediaType = 'image';
        button.dataset.src = src;
        button.innerHTML = `<img src="${src}" alt="${project.title} thumbnail" loading="lazy" decoding="async">`;
        modalThumbs.appendChild(button);
      });
    }
  };

  const bindModalEvents = () => {
    if (!modal) return;
    modal.querySelectorAll('[data-project-modal-close]').forEach((node) => {
      node.addEventListener('click', closeModal);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !modal.hidden) {
        closeModal();
      }
    });
    modal.addEventListener('click', (event) => {
      const playBtn = event.target.closest('[data-project-modal-play]');
      if (!playBtn) return;
      const projectId = modal.dataset.projectId;
      const project = projectDataMap.get(projectId);
      if (!project) return;
      renderModalIframe(project);
    });
    modalThumbs?.addEventListener('click', (event) => {
      const button = event.target.closest('.project-modal__thumb');
      if (!button) return;
      const projectId = modal.dataset.projectId;
      const project = projectDataMap.get(projectId);
      if (!project) return;
      if (button.dataset.mediaType === 'video') {
        renderModalCover(project);
      } else if (button.dataset.mediaType === 'image') {
        const src = button.dataset.src;
        if (!src || !modalMain) return;
        modalMain.innerHTML = `<img src="${src}" alt="${project.title} media" loading="lazy" decoding="async">`;
      }
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
        const project = projectDataMap.get(projectId);
        if (!project) return;
        modal.dataset.projectId = projectId;
        renderModal(project);
      });
    }

    row.addEventListener('click', (event) => {
      if (event.target.closest('button, a')) return;
      if (!detailBtn || !modal) return;
      const projectId = row.dataset.projectId;
      const project = projectDataMap.get(projectId);
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
