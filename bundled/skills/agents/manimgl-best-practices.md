---
name: "manimgl-best-practices"
description: "Trigger when: (1) User mentions \"manimgl\" or \"ManimGL\" or \"3b1b manim\", (2) Code contains `from manimlib import *`, (3) User runs `manimgl` CLI commands, (4) Working with InteractiveScene, self.frame, self.embed(), ShowCreation(), or ManimGL-specific patterns. Best practices for ManimGL (Grant Sanderson's 3Blue1Brown version) - OpenGL-based animation engine with interactive development. Covers InteractiveScene, Tex with t2c, camera frame control, interactive mode (-se flag), 3D rendering, and checkpoint_paste() workflow. NOT for Manim Community Edition (which uses `manim` imports and `manim` CLI)."
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
- [manimgl-best-practices/rules/scenes.md](manimgl-best-practices/rules/scenes.md) - InteractiveScene, Scene types, and construct method
- [manimgl-best-practices/rules/mobjects.md](manimgl-best-practices/rules/mobjects.md) - Mobject types, VMobject, Groups, and positioning
- [manimgl-best-practices/rules/animations.md](manimgl-best-practices/rules/animations.md) - Animation classes, playing animations, and timing

### Creation & Transformation
- [manimgl-best-practices/rules/creation-animations.md](manimgl-best-practices/rules/creation-animations.md) - ShowCreation, Write, FadeIn, DrawBorderThenFill
- [manimgl-best-practices/rules/transform-animations.md](manimgl-best-practices/rules/transform-animations.md) - Transform, ReplacementTransform, TransformMatchingTex
- [manimgl-best-practices/rules/animation-groups.md](manimgl-best-practices/rules/animation-groups.md) - LaggedStart, Succession, AnimationGroup

### Text & Math
- [manimgl-best-practices/rules/tex.md](manimgl-best-practices/rules/tex.md) - Tex class, raw strings R"...", and LaTeX rendering
- [manimgl-best-practices/rules/text.md](manimgl-best-practices/rules/text.md) - Text mobjects, fonts, and styling
- [manimgl-best-practices/rules/t2c.md](manimgl-best-practices/rules/t2c.md) - tex_to_color_map (t2c) for coloring math expressions

### Styling & Appearance
- [manimgl-best-practices/rules/colors.md](manimgl-best-practices/rules/colors.md) - Color constants, gradients, RGB, hex, GLSL coloring
- [manimgl-best-practices/rules/styling.md](manimgl-best-practices/rules/styling.md) - Fill, stroke, opacity, backstroke, gloss, shadow

### 3D & Camera
- [manimgl-best-practices/rules/3d.md](manimgl-best-practices/rules/3d.md) - 3D objects, surfaces, Sphere, Torus, parametric surfaces, lighting
- [manimgl-best-practices/rules/camera.md](manimgl-best-practices/rules/camera.md) - frame.reorient(), Euler angles, fix_in_frame(), camera animations

### Interactive Development
- [manimgl-best-practices/rules/interactive.md](manimgl-best-practices/rules/interactive.md) - Interactive mode with `-se` flag, checkpoint_paste()
- [manimgl-best-practices/rules/frame.md](manimgl-best-practices/rules/frame.md) - self.frame, camera control, reorient, and zooming
- [manimgl-best-practices/rules/embedding.md](manimgl-best-practices/rules/embedding.md) - self.embed() for IPython debugging, touch() mode

### Configuration & CLI
- [manimgl-best-practices/rules/cli.md](manimgl-best-practices/rules/cli.md) - manimgl command, flags (-w, -o, -se, -l, -h), rendering options
- [manimgl-best-practices/rules/config.md](manimgl-best-practices/rules/config.md) - custom_config.yml, directories, camera settings, quality presets

## Working Examples

Complete, tested example files demonstrating common patterns:

- [manimgl-best-practices/examples/basic_animations.py](manimgl-best-practices/examples/basic_animations.py) - Basic shapes, text, and animations
- [manimgl-best-practices/examples/math_visualization.py](manimgl-best-practices/examples/math_visualization.py) - LaTeX equations and mathematical content
- [manimgl-best-practices/examples/graph_plotting.py](manimgl-best-practices/examples/graph_plotting.py) - Axes, functions, and graphing
- [manimgl-best-practices/examples/3d_visualization.py](manimgl-best-practices/examples/3d_visualization.py) - 3D scenes with camera control and surfaces
- [manimgl-best-practices/examples/updater_patterns.py](manimgl-best-practices/examples/updater_patterns.py) - Dynamic animations with updaters

## Scene Templates

Copy and modify these templates to start new projects:

- [manimgl-best-practices/templates/basic_scene.py](manimgl-best-practices/templates/basic_scene.py) - Standard 2D scene template
- [manimgl-best-practices/templates/interactive_scene.py](manimgl-best-practices/templates/interactive_scene.py) - InteractiveScene with self.embed()
- [manimgl-best-practices/templates/3d_scene.py](manimgl-best-practices/templates/3d_scene.py) - 3D scene with frame.reorient()
- [manimgl-best-practices/templates/math_scene.py](manimgl-best-practices/templates/math_scene.py) - Mathematical derivations and equations

## Quick Reference

### Basic Scene Structure
```python
from manimlib import *

class MyScene(InteractiveScene):
    def construct(self):
        # Create mobjects
        circle = Circle()

        # Add to scene (static)
        self.add(circle)

        # Or animate
        self.play(ShowCreation(circle))  # Note: ShowCreation, not Create

        # Wait
        self.wait(1)
```

### Render Command
```bash
# Render and preview
manimgl scene.py MyScene

# Interactive mode - drop into shell at line 15
manimgl scene.py MyScene -se 15

# Write to file
manimgl scene.py MyScene -w

# Low quality for testing
manimgl scene.py MyScene -l
```

### Key Differences from ManimCE

| Feature | ManimGL (3b1b) | Manim Community |
|---------|----------------|-----------------|
| Import | `from manimlib import *` | `from manim import *` |
| CLI | `manimgl` | `manim` |
| Math text | `Tex(R"\pi")` | `MathTex(r"\pi")` |
| Scene | `InteractiveScene` | `Scene` |
| Create anim | `ShowCreation` | `Create` |
| Camera | `self.frame` | `self.camera.frame` |
| Fix in frame | `mob.fix_in_frame()` | `self.add_fixed_in_frame_mobjects(mob)` |
| Package | `manimgl` (PyPI) | `manim` (PyPI) |

### Interactive Development Workflow

ManimGL's killer feature is interactive development:

```bash
# Start at line 20 with state preserved
manimgl scene.py MyScene -se 20
```

In interactive mode:
```python
# Copy code to clipboard, then run:
checkpoint_paste()           # Run with animations
checkpoint_paste(skip=True)  # Run instantly (no animations)
checkpoint_paste(record=True) # Record while running
```

### Camera Control (self.frame)

```python
# Get the camera frame
frame = self.frame

# Reorient in 3D (phi, theta, gamma, center, height)
frame.reorient(45, -30, 0, ORIGIN, 8)

# Animate camera movement
self.play(frame.animate.reorient(60, -45, 0))

# Fix mobjects to stay in screen space during 3D movement
title.fix_in_frame()
```

### LaTeX with Tex class

```python
# Use raw strings with capital R
formula = Tex(R"\int_0^1 x^2 \, dx = \frac{1}{3}")

# Color mapping with t2c
equation = Tex(
    R"E = mc^2",
    t2c={"E": BLUE, "m": GREEN, "c": YELLOW}
)

# Isolate substrings for animation
formula = Tex(R"\sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6}")
formula.set_color_by_tex("n", BLUE)
```

### Common Patterns

#### Embedding for debugging
```python
def construct(self):
    circle = Circle()
    self.play(ShowCreation(circle))
    self.embed()  # Drops into IPython shell here
```

#### Set floor plane for 3D
```python
self.set_floor_plane("xz")  # Makes xy the viewing plane
```

#### Backstroke for text readability
```python
text = Text("Label")
text.set_backstroke(BLACK, 5)  # Black outline behind text
```

### Installation

```bash
# Install ManimGL
pip install manimgl

# Check installation
manimgl --version
```

### Common Pitfalls to Avoid

1. **Version confusion** - Ensure you're using `manimgl`, not `manim` (community version)
2. **ShowCreation vs Create** - ManimGL uses `ShowCreation`, not `Create`
3. **Tex vs MathTex** - ManimGL uses `Tex` with capital R raw strings
4. **self.frame vs self.camera.frame** - ManimGL uses `self.frame` directly
5. **fix_in_frame()** - Call on the mobject, not the scene
6. **Interactive mode** - Use `-se` flag for interactive development

## License & Attribution

This skill contains example code adapted from [3Blue1Brown's video repository](https://github.com/3b1b/videos) by Grant Sanderson.

**License:** [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)

- **Attribution required** - Credit both 3Blue1Brown and the adapter
- **NonCommercial** - Not for commercial use
- **ShareAlike** - Derivatives must use the same license

See [LICENSE.txt](LICENSE.txt) for full details.
