import { describe, expect, it } from "vitest";
import {
  overlayCatalog,
  overlayFixtures,
  renderOverlayByType,
  renderSceneByType,
  sceneCatalog,
  sceneFixtures,
  type OverlayType,
  type SceneType,
} from "./index.js";

describe("remotion scene library", () => {
  for (const type of Object.keys(sceneCatalog) as SceneType[]) {
    it(`renders ${type} against its fixture`, () => {
      const fixture = sceneFixtures[type];

      expect(() => sceneCatalog[type].schema.parse(fixture)).not.toThrow();
      expect(renderSceneByType(type, fixture, 0)).toMatchSnapshot();
    });
  }

  for (const type of Object.keys(overlayCatalog) as OverlayType[]) {
    it(`renders overlay ${type} against its fixture`, () => {
      const fixture = overlayFixtures[type];

      expect(() => overlayCatalog[type].schema.parse(fixture)).not.toThrow();
      expect(renderOverlayByType(type, fixture, 0)).toMatchSnapshot();
    });
  }
});
