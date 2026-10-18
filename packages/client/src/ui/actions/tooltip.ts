import { tooltipState } from '../state/tooltipState.svelte.js';

export function tooltip(node: HTMLElement, text: string | undefined | null) {
  let currentText = text;
  let isTargetActive = false;

  function calculateAndShow() {
    if (!currentText || !currentText.trim()) return;

    const rect = node.getBoundingClientRect();
    const padding = 12;
    const estimatedHeight = 60;
    const estimatedHalfWidth = 140;

    // Auto-flip vertical logic: If not enough room above (less than 12px), flip to bottom
    const position: 'top' | 'bottom' = rect.top - estimatedHeight < padding ? 'bottom' : 'top';
    const y = position === 'top' ? rect.top - 8 : rect.bottom + 8;

    // Horizontal centering with viewport clamping
    let x = rect.left + rect.width / 2;
    if (typeof window !== 'undefined') {
      const minX = padding + estimatedHalfWidth;
      const maxX = window.innerWidth - padding - estimatedHalfWidth;
      if (minX < maxX) {
        x = Math.max(minX, Math.min(maxX, x));
      }
    }

    isTargetActive = true;
    tooltipState.show({
      text: currentText,
      x,
      y,
      position
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
      window.addEventListener('resize', handleScroll, { passive: true });
    }
  }

  function handleHide() {
    if (isTargetActive) {
      isTargetActive = false;
      tooltipState.hide();
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('scroll', handleScroll, { capture: true });
      window.removeEventListener('resize', handleScroll);
    }
  }

  function handleScroll() {
    handleHide();
  }

  function handlePointerEnter() {
    calculateAndShow();
  }

  function handlePointerLeave() {
    handleHide();
  }

  function handleFocus() {
    calculateAndShow();
  }

  function handleBlur() {
    handleHide();
  }

  node.addEventListener('pointerenter', handlePointerEnter);
  node.addEventListener('pointerleave', handlePointerLeave);
  node.addEventListener('focus', handleFocus);
  node.addEventListener('blur', handleBlur);

  return {
    update(newText: string | undefined | null) {
      currentText = newText;
      if (isTargetActive && currentText) {
        calculateAndShow();
      } else if (!currentText) {
        handleHide();
      }
    },
    destroy() {
      handleHide();
      node.removeEventListener('pointerenter', handlePointerEnter);
      node.removeEventListener('pointerleave', handlePointerLeave);
      node.removeEventListener('focus', handleFocus);
      node.removeEventListener('blur', handleBlur);
    }
  };
}
