document.addEventListener('DOMContentLoaded', () => {
  const gallery = document.querySelector('[data-pinned-gallery]');
  if (!gallery) return;

  const main = gallery.querySelector('[data-pinned-main]');
  const thumbs = Array.from(gallery.querySelectorAll('.pinned-thumb'));
  if (!main || thumbs.length === 0) return;

  const setActive = (target) => {
    thumbs.forEach((btn) => btn.classList.remove('active'));
    target.classList.add('active');
  };

  const setMainMedia = (type, src) => {
    if (!type || !src) return;

    if (type === 'video') {
      main.innerHTML = `<iframe src="${src}" title="Pinned project video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
      return;
    }

    main.innerHTML = `<img src="${src}" alt="Pinned project media" loading="lazy" decoding="async">`;
  };

  thumbs.forEach((thumb) => {
    thumb.addEventListener('click', () => {
      const type = thumb.dataset.mediaType;
      const src = thumb.dataset.src;
      setActive(thumb);
      setMainMedia(type, src);
    });
  });
});
