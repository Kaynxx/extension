export interface MangaTile {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly sourceX: number;
  readonly sourceY: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
}

export interface MangaPipelineOptions {
  readonly enabled: boolean;
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly tileSize?: number;
  readonly overlap?: number;
}
