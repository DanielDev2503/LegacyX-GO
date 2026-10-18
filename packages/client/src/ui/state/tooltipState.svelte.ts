export interface AnchorRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface TooltipShowParams {
  text: string;
  anchorRect?: AnchorRect;
  x?: number;
  y?: number;
  position?: 'top' | 'bottom';
}

export interface TooltipData {
  text: string;
  visible: boolean;
  x: number;
  y: number;
  position: 'top' | 'bottom';
  anchorRect?: AnchorRect | null;
}

class TooltipStore {
  public text = $state('');
  public visible = $state(false);
  public x = $state(0);
  public y = $state(0);
  public position = $state<'top' | 'bottom'>('top');
  public anchorRect = $state<AnchorRect | null>(null);

  public show(params: TooltipShowParams) {
    this.text = params.text;
    this.anchorRect = params.anchorRect ?? null;
    this.x = params.x ?? 0;
    this.y = params.y ?? 0;
    this.position = params.position ?? 'top';
    this.visible = true;
  }

  public hide() {
    this.visible = false;
    this.text = '';
    this.anchorRect = null;
  }
}

export const tooltipState = new TooltipStore();
