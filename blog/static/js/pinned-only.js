(function () {
  var galleries = document.querySelectorAll('[data-pinned-gallery]');
  if (!galleries.length) {
    return;
  }

  galleries.forEach(function (gallery) {
    gallery.addEventListener('click', function (event) {
      var button = event.target.closest('.pinned-thumb');
      if (!button || !gallery.contains(button)) {
        return;
      }

      var main = gallery.querySelector('[data-pinned-main]');
      if (!main) {
        return;
      }

      var mediaType = button.getAttribute('data-media-type');
      var src = button.getAttribute('data-src');
      if (!mediaType || !src) {
        return;
      }

      if (mediaType === 'video') {
        main.innerHTML = '<iframe src="' + src + '" title="Pinned video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>';
      } else {
        main.innerHTML = '<img src="' + src + '" alt="Pinned media" loading="lazy" decoding="async">';
      }

      gallery.querySelectorAll('.pinned-thumb').forEach(function (thumb) {
        thumb.classList.toggle('active', thumb === button);
      });
    });
  });
})();
