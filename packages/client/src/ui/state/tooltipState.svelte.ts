export interface TooltipData {
  text: string;
  visible: boolean;
  x: number;
  y: number;
  position: 'top' | 'bottom';
}

class TooltipStore {
  public text = $state('');
  public visible = $state(false);
  public x = $state(0);
  public y = $state(0);
  public position = $state<'top' | 'bottom'>('top');

  public show(params: { text: string; x: number; y: number; position: 'top' | 'bottom' }) {
    this.text = params.text;
    this.x = params.x;
    this.y = params.y;
    this.position = params.position;
    this.visible = true;
  }

  public hide() {
    this.visible = false;
    this.text = '';
  }
}

export const tooltipState = new TooltipStore();
