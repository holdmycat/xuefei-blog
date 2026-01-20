document.addEventListener('DOMContentLoaded', () => {
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
