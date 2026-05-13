export type ScenePrimitive = string | number | boolean | null;
export interface SceneStyle {
  [key: string]: ScenePrimitive | ScenePrimitive[] | SceneStyle | SceneStyle[];
}
export type SceneChild = SceneNode | ScenePrimitive;

export type SceneNode = {
  type: string;
  props: Record<string, unknown>;
  children: SceneChild[];
};

export type RemotionComponent<Props> = (props: Props) => SceneNode;

let currentFrame = 0;

export function useCurrentFrame(): number {
  return currentFrame;
}

export function renderAtFrame<Props>(component: RemotionComponent<Props>, props: Props, frame = 0): SceneNode {
  const previousFrame = currentFrame;
  currentFrame = frame;

  try {
    return component(props);
  } finally {
    currentFrame = previousFrame;
  }
}

export function AbsoluteFill(props: { style?: SceneStyle; children?: SceneChild[] } = {}): SceneNode {
  return element(
    "AbsoluteFill",
    {
      style: {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        ...(props.style ?? {}),
      },
    },
    ...(props.children ?? []),
  );
}

export function element(type: string, props: Record<string, unknown> = {}, ...children: SceneChild[]): SceneNode {
  return {
    type,
    props: sortRecord(props),
    children: children.filter((child) => child !== null && child !== undefined),
  };
}

export function interpolate(
  frame: number,
  inputRange: [number, number],
  outputRange: [number, number],
  options: { extrapolateLeft?: "clamp"; extrapolateRight?: "clamp" } = {},
): number {
  const [inputStart, inputEnd] = inputRange;
  const [outputStart, outputEnd] = outputRange;
  const span = inputEnd - inputStart;

  if (span === 0) {
    return outputEnd;
  }

  let progress = (frame - inputStart) / span;
  if (options.extrapolateLeft === "clamp" || options.extrapolateRight === "clamp") {
    progress = clamp(progress, 0, 1);
  }

  return round(outputStart + (outputEnd - outputStart) * progress);
}

export function spring(options: { frame: number; fps?: number; damping?: number; stiffness?: number }): number {
  const fps = options.fps ?? 30;
  const damping = options.damping ?? 12;
  const stiffness = options.stiffness ?? 120;
  const seconds = Math.max(0, options.frame) / fps;
  const decay = Math.exp(-damping * seconds);
  const oscillation = Math.cos(Math.sqrt(stiffness) * seconds);

  return round(clamp(1 - decay * oscillation, 0, 1));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, decimals = 4): number {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}

function sortRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  ) as Record<string, unknown>;
}
