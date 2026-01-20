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
