document.addEventListener('DOMContentLoaded', () => {
  const copyBtn = document.querySelector('.copy-btn');
  const toast = document.querySelector('.copy-toast');
  if (copyBtn && toast) {
    copyBtn.addEventListener('click', async () => {
      const text = copyBtn.dataset.copy;
      try {
        await navigator.clipboard.writeText(text);
        toast.hidden = false;
        copyBtn.disabled = true;
        const original = copyBtn.textContent;
        copyBtn.textContent = 'Copied';
        setTimeout(() => {
          toast.hidden = true;
          copyBtn.disabled = false;
          copyBtn.textContent = original;
        }, 1000);
      } catch (e) {
        toast.hidden = false;
        toast.textContent = 'Copy failed';
        setTimeout(() => { toast.hidden = true; toast.textContent = 'Copied'; }, 1000);
      }
    });
  }
});
