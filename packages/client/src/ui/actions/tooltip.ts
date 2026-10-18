import { tooltipState, type AnchorRect } from '../state/tooltipState.svelte.js';

export interface TooltipPositionResult {
  x: number;
  y: number;
  placement: 'top' | 'bottom';
  arrowX: number;
}

export function calculateTooltipPosition(
  anchorRect: AnchorRect,
  tooltipSize: { width: number; height: number },
  viewportSize: { width: number; height: number } = {
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800
  },
  safeMargin = 16
): TooltipPositionResult {
  const tooltipWidth = tooltipSize.width || 280;
  const tooltipHeight = tooltipSize.height || 60;

  let placement: 'top' | 'bottom' = 'top';
  let y: number;

  // B. Auto-Flip Vertical con Detección Rigurosa
  if (anchorRect.top - tooltipHeight < safeMargin) {
    // No cabe arriba -> colocar abajo del elemento
    y = anchorRect.bottom + 8;
    placement = 'bottom';
  } else {
    // Cabe arriba
    y = anchorRect.top - tooltipHeight - 8;
    placement = 'top';
  }

  // C. Viewport Hard-Clamp Bidireccional: Eje Y
  const maxY = viewportSize.height - tooltipHeight - safeMargin;
  y = Math.max(safeMargin, Math.min(y, maxY));

  // C. Centrado y Viewport Hard-Clamp Bidireccional: Eje X
  let x = anchorRect.left + anchorRect.width / 2 - tooltipWidth / 2;
  const maxX = viewportSize.width - tooltipWidth - safeMargin;
  x = Math.max(safeMargin, Math.min(x, maxX));

  // D. Flecha Indicadora Dinámica (Pointer Arrow)
  const anchorCenterX = anchorRect.left + anchorRect.width / 2;
  const arrowX = Math.max(12, Math.min(tooltipWidth - 12, anchorCenterX - x));

  return { x, y, placement, arrowX };
}

export function tooltip(node: HTMLElement, text: string | undefined | null) {
  let currentText = text;
  let isTargetActive = false;

  function calculateAndShow() {
    if (!currentText || !currentText.trim()) return;

    const rect = node.getBoundingClientRect();
    const anchorRect: AnchorRect = {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height
    };

    const initialPos = calculateTooltipPosition(anchorRect, { width: 280, height: 60 });

    isTargetActive = true;
    tooltipState.show({
      text: currentText,
      anchorRect,
      x: initialPos.x,
      y: initialPos.y,
      position: initialPos.placement
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
