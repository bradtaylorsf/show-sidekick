---
name: "manimce-best-practices"
description: "Trigger when: (1) User mentions \"manim\" or \"Manim Community\" or \"ManimCE\", (2) Code contains `from manim import *`, (3) User runs `manim` CLI commands, (4) Working with Scene, MathTex, Create(), or ManimCE-specific classes. Best practices for Manim Community Edition - the community-maintained Python animation engine. Covers Scene structure, animations, LaTeX/MathTex, 3D with ThreeDScene, camera control, styling, and CLI usage. NOT for ManimGL/3b1b version (which uses `manimlib` imports and `manimgl` CLI)."
applies_to: "agents"
agent_skill: true
critical: false
epic: 8
issue: 77
---

## Show Sidekick Usage Contract

- Read this skill before calling any tool that lists it in `agent_skills`.
- Route execution through the Show Sidekick registry or CLI workflow; do not bypass the harness with ad-hoc tool scripts.
- Announce paid or externally visible generation before running it, and log provider/model decisions when they affect output.
- Keep this skill aligned with `bundled/templates/user-project/AGENTS.md`, `specs/06-tool-registry.md`, `specs/08-skills.md`.
- The source body below is normalized for Show Sidekick paths and terminology while preserving the original operational details.

## How to use

Read individual rule files for detailed explanations and code examples:

### Core Concepts
- [manimce-best-practices/rules/scenes.md](manimce-best-practices/rules/scenes.md) - Scene structure, construct method, and scene types
- [manimce-best-practices/rules/mobjects.md](manimce-best-practices/rules/mobjects.md) - Mobject types, VMobject, Groups, and positioning
- [manimce-best-practices/rules/animations.md](manimce-best-practices/rules/animations.md) - Animation classes, playing animations, and timing

### Creation & Transformation
- [manimce-best-practices/rules/creation-animations.md](manimce-best-practices/rules/creation-animations.md) - Create, Write, FadeIn, DrawBorderThenFill
- [manimce-best-practices/rules/transform-animations.md](manimce-best-practices/rules/transform-animations.md) - Transform, ReplacementTransform, morphing
- [manimce-best-practices/rules/animation-groups.md](manimce-best-practices/rules/animation-groups.md) - AnimationGroup, LaggedStart, Succession

### Text & Math
- [manimce-best-practices/rules/text.md](manimce-best-practices/rules/text.md) - Text mobjects, fonts, and styling
- [manimce-best-practices/rules/latex.md](manimce-best-practices/rules/latex.md) - MathTex, Tex, LaTeX rendering, and coloring formulas
- [manimce-best-practices/rules/text-animations.md](manimce-best-practices/rules/text-animations.md) - Write, AddTextLetterByLetter, TypeWithCursor

### Styling & Appearance
- [manimce-best-practices/rules/colors.md](manimce-best-practices/rules/colors.md) - Color constants, gradients, and color manipulation
- [manimce-best-practices/rules/styling.md](manimce-best-practices/rules/styling.md) - Fill, stroke, opacity, and visual properties

### Positioning & Layout
- [manimce-best-practices/rules/positioning.md](manimce-best-practices/rules/positioning.md) - move_to, next_to, align_to, shift methods
- [manimce-best-practices/rules/grouping.md](manimce-best-practices/rules/grouping.md) - VGroup, Group, arrange, and layout patterns

### Coordinate Systems & Graphing
- [manimce-best-practices/rules/axes.md](manimce-best-practices/rules/axes.md) - Axes, NumberPlane, coordinate systems
- [manimce-best-practices/rules/graphing.md](manimce-best-practices/rules/graphing.md) - Plotting functions, parametric curves
- [manimce-best-practices/rules/3d.md](manimce-best-practices/rules/3d.md) - ThreeDScene, 3D axes, surfaces, camera orientation

### Animation Control
- [manimce-best-practices/rules/timing.md](manimce-best-practices/rules/timing.md) - Rate functions, easing, run_time, lag_ratio
- [manimce-best-practices/rules/updaters.md](manimce-best-practices/rules/updaters.md) - Updaters, ValueTracker, dynamic animations
- [manimce-best-practices/rules/camera.md](manimce-best-practices/rules/camera.md) - MovingCameraScene, zoom, pan, frame manipulation

### Configuration & CLI
- [manimce-best-practices/rules/cli.md](manimce-best-practices/rules/cli.md) - Command-line interface, rendering options, quality flags
- [manimce-best-practices/rules/config.md](manimce-best-practices/rules/config.md) - Configuration system, manim.cfg, settings

### Shapes & Geometry
- [manimce-best-practices/rules/shapes.md](manimce-best-practices/rules/shapes.md) - Circle, Square, Rectangle, Polygon, and geometric primitives
- [manimce-best-practices/rules/lines.md](manimce-best-practices/rules/lines.md) - Line, Arrow, Vector, DashedLine, and connectors

## Working Examples

Complete, tested example files demonstrating common patterns:

- [manimce-best-practices/examples/basic_animations.py](manimce-best-practices/examples/basic_animations.py) - Shape creation, text, lagged animations, path movement
- [manimce-best-practices/examples/math_visualization.py](manimce-best-practices/examples/math_visualization.py) - LaTeX equations, color-coded math, derivations
- [manimce-best-practices/examples/updater_patterns.py](manimce-best-practices/examples/updater_patterns.py) - ValueTracker, dynamic animations, physics simulations
- [manimce-best-practices/examples/graph_plotting.py](manimce-best-practices/examples/graph_plotting.py) - Axes, functions, areas, Riemann sums, polar plots
- [manimce-best-practices/examples/3d_visualization.py](manimce-best-practices/examples/3d_visualization.py) - ThreeDScene, surfaces, 3D camera, parametric curves

## Scene Templates

Copy and modify these templates to start new projects:

- [manimce-best-practices/templates/basic_scene.py](manimce-best-practices/templates/basic_scene.py) - Standard 2D scene template
- [manimce-best-practices/templates/camera_scene.py](manimce-best-practices/templates/camera_scene.py) - MovingCameraScene with zoom/pan
- [manimce-best-practices/templates/threed_scene.py](manimce-best-practices/templates/threed_scene.py) - 3D scene with surfaces and camera rotation

## Quick Reference

### Basic Scene Structure
```python
from manim import *

class MyScene(Scene):
    def construct(self):
        # Create mobjects
        circle = Circle()

        # Add to scene (static)
        self.add(circle)

        # Or animate
        self.play(Create(circle))

        # Wait
        self.wait(1)
```

### Render Command
```bash
# Basic render with preview
manim -pql scene.py MyScene

# Quality flags: -ql (low), -qm (medium), -qh (high), -qk (4k)
manim -pqh scene.py MyScene
```

### Key Differences from 3b1b/ManimGL

| Feature | Manim Community | 3b1b/ManimGL |
|---------|-----------------|--------------|
| Import | `from manim import *` | `from manimlib import *` |
| CLI | `manim` | `manimgl` |
| Math text | `MathTex(r"\pi")` | `Tex(R"\pi")` |
| Scene | `Scene` | `InteractiveScene` |
| Package | `manim` (PyPI) | `manimgl` (PyPI) |

### Jupyter Notebook Support

Use the `%%manim` cell magic:

```python
%%manim -qm MyScene
class MyScene(Scene):
    def construct(self):
        self.play(Create(Circle()))
```

### Common Pitfalls to Avoid

1. **Version confusion** - Ensure you're using `manim` (Community), not `manimgl` (3b1b version)
2. **Check imports** - `from manim import *` is ManimCE; `from manimlib import *` is ManimGL
3. **Outdated tutorials** - Video tutorials may be outdated; prefer official documentation
4. **manimpango issues** - If text rendering fails, check manimpango installation requirements
5. **PATH issues (Windows)** - If `manim` command not found, use `python -m manim` or check PATH

### Installation

```bash
# Install Manim Community
pip install manim

# Check installation
manim checkhealth
```

### Useful Commands

```bash
manim -pql scene.py Scene    # Preview low quality (development)
manim -pqh scene.py Scene    # Preview high quality
manim --format gif scene.py  # Output as GIF
manim checkhealth            # Verify installation
manim plugins -l             # List plugins
```
