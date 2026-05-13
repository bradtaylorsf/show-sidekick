import { AbsoluteFill, element, interpolate, spring, useCurrentFrame, type SceneChild, type SceneNode } from "./primitives.js";
import { resolveTheme, type BaseSceneProps, type ChartDatum, type RemotionTheme } from "./types.js";

export { element } from "./primitives.js";

export function sceneRoot(
  name: string,
  props: BaseSceneProps,
  children: SceneChild[],
  options: { overlay?: boolean } = {},
): SceneNode {
  const theme = resolveTheme(props.theme);
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, theme.motion.enter_frames], [0.01, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return AbsoluteFill({
    style: {
      background: options.overlay ? "transparent" : theme.palette.background,
      color: theme.palette.text,
      fontFamily: theme.typography.body,
      height: props.height,
      opacity,
      overflow: "hidden",
      width: props.width,
    },
    children: [
      element("scene-meta", {
        frame,
        height: props.height,
        name,
        overlay: options.overlay === true,
        width: props.width,
      }),
      ...children,
    ],
  });
}

export function panel(theme: RemotionTheme, children: SceneChild[], props: Record<string, unknown> = {}): SceneNode {
  return element(
    "panel",
    {
      style: {
        background: theme.palette.surface,
        borderColor: theme.palette.grid,
        borderRadius: 8,
        borderWidth: 2,
        padding: 64,
      },
      ...props,
    },
    ...children,
  );
}

export function label(theme: RemotionTheme, text: string, props: Record<string, unknown> = {}): SceneNode {
  return element("text", {
    role: "label",
    text,
    style: {
      color: theme.palette.muted,
      fontFamily: theme.typography.body,
      fontSize: theme.typography.label_size,
      letterSpacing: 0,
      textTransform: "uppercase",
    },
    ...props,
  });
}

export function title(theme: RemotionTheme, text: string, props: Record<string, unknown> = {}): SceneNode {
  return element("text", {
    role: "title",
    text,
    style: {
      color: theme.palette.text,
      fontFamily: theme.typography.display,
      fontSize: theme.typography.title_size,
      fontWeight: 800,
      letterSpacing: 0,
      lineHeight: 0.95,
    },
    ...props,
  });
}

export function bodyText(theme: RemotionTheme, text: string, props: Record<string, unknown> = {}): SceneNode {
  return element("text", {
    role: "body",
    text,
    style: {
      color: theme.palette.text,
      fontFamily: theme.typography.body,
      fontSize: theme.typography.body_size,
      lineHeight: 1.25,
    },
    ...props,
  });
}

export function accentRule(theme: RemotionTheme, props: Record<string, unknown> = {}): SceneNode {
  const progress = spring({
    frame: Math.max(0, useCurrentFrame() - theme.motion.accent_delay_frames),
    damping: 14,
    stiffness: 90,
  });

  return element("accent-rule", {
    progress,
    style: {
      background: theme.palette.primary,
      height: 8,
      transformOrigin: "left center",
      width: `${Math.round(progress * 100)}%`,
    },
    ...props,
  });
}

export function normalizeChartData(data: ChartDatum[]): Array<ChartDatum & { ratio: number; percent: number }> {
  const maxValue = Math.max(...data.map((datum) => datum.value), 1);
  const total = data.reduce((sum, datum) => sum + Math.max(0, datum.value), 0) || 1;

  return data.map((datum) => ({
    ...datum,
    ratio: roundRatio(datum.value / maxValue),
    percent: roundRatio(Math.max(0, datum.value) / total),
  }));
}

function roundRatio(value: number): number {
  return Math.round(value * 10000) / 10000;
}
