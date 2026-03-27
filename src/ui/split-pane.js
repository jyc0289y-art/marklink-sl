// OfficeLink SL — Resizable Split Pane

/**
 * Initialize resizable split pane
 * @param {HTMLElement} divider - The divider element
 * @param {HTMLElement} leftPane - Left (editor) pane
 * @param {HTMLElement} rightPane - Right (preview) pane
 */
export function initSplitPane(divider, leftPane, rightPane) {
  let isDragging = false;
  let startX = 0;
  let startLeftWidth = 0;

  // A11y attributes for the resize divider
  divider.setAttribute('role', 'separator');
  divider.setAttribute('aria-orientation', 'vertical');
  divider.setAttribute('aria-label', 'Resize pane divider');
  divider.setAttribute('tabindex', '0');

  // Keyboard support for resizing
  divider.addEventListener('keydown', (e) => {
    const STEP = e.shiftKey ? 50 : 10;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

    e.preventDefault();
    const container = leftPane.parentElement;
    const containerWidth = container.getBoundingClientRect().width;
    const dividerWidth = divider.getBoundingClientRect().width;
    const currentLeftWidth = leftPane.getBoundingClientRect().width;

    const delta = e.key === 'ArrowRight' ? STEP : -STEP;
    let newLeftWidth = currentLeftWidth + delta;
    const minWidth = 200;
    const maxWidth = containerWidth - dividerWidth - minWidth;
    newLeftWidth = Math.max(minWidth, Math.min(maxWidth, newLeftWidth));

    const leftRatio = newLeftWidth / (containerWidth - dividerWidth);
    const rightRatio = 1 - leftRatio;
    leftPane.style.flex = `${leftRatio}`;
    rightPane.style.flex = `${rightRatio}`;
  });

  divider.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX;
    startLeftWidth = leftPane.getBoundingClientRect().width;
    divider.classList.add('active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const container = leftPane.parentElement;
    const containerWidth = container.getBoundingClientRect().width;
    const dividerWidth = divider.getBoundingClientRect().width;

    let newLeftWidth = startLeftWidth + dx;
    const minWidth = 200;
    const maxWidth = containerWidth - dividerWidth - minWidth;

    newLeftWidth = Math.max(minWidth, Math.min(maxWidth, newLeftWidth));

    const leftRatio = newLeftWidth / (containerWidth - dividerWidth);
    const rightRatio = 1 - leftRatio;

    leftPane.style.flex = `${leftRatio}`;
    rightPane.style.flex = `${rightRatio}`;
  });

  document.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    divider.classList.remove('active');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });

  // Touch support for mobile drag-to-resize
  divider.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    isDragging = true;
    startX = e.touches[0].clientX;
    startLeftWidth = leftPane.getBoundingClientRect().width;
    divider.classList.add('active');
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchmove', (e) => {
    if (!isDragging || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - startX;
    const container = leftPane.parentElement;
    const containerWidth = container.getBoundingClientRect().width;
    const dividerWidth = divider.getBoundingClientRect().width;

    let newLeftWidth = startLeftWidth + dx;
    const minWidth = 200;
    const maxWidth = containerWidth - dividerWidth - minWidth;

    newLeftWidth = Math.max(minWidth, Math.min(maxWidth, newLeftWidth));

    const leftRatio = newLeftWidth / (containerWidth - dividerWidth);
    const rightRatio = 1 - leftRatio;

    leftPane.style.flex = `${leftRatio}`;
    rightPane.style.flex = `${rightRatio}`;
  }, { passive: true });

  document.addEventListener('touchend', () => {
    if (!isDragging) return;
    isDragging = false;
    divider.classList.remove('active');
  });

  // Double-click divider to reset to 50/50
  divider.addEventListener('dblclick', () => {
    leftPane.style.flex = '1';
    rightPane.style.flex = '1';
  });
}
