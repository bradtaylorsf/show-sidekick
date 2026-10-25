---
name: blender-5-api
description: Blender 5.x Python API pitfalls that break code written from older examples or model memory — slotted actions, engine ids, the compositor rewrite, VSE strips, Metal setup in headless runs. Read before writing any bpy script.
applies_to: agents
agent_skill: true
critical: false
epic: 8
issue: 0
---

# Blender 5.x API Cheat Sheet

## Show Sidekick Usage Contract

- Read this before writing any `bpy` code (see `blender-animation`).
- Verified against Blender 5.1.2 / Python 3.13 run headless. If the installed version differs, probe before trusting a line here: `blender -b --factory-startup --python-expr "import bpy; print(bpy.app.version_string)"`.

## When To Use

Every time a script will run inside Blender 5.x.

## Pitfalls

| Old code (breaks) | 5.x replacement |
|---|---|
| `action.fcurves` | Actions are slotted and layered. Use `obj.keyframe_insert(data_path, frame=f)`, or `bpy_extras.anim_utils.action_get_channelbag_for_slot(action, obj.animation_data.action_slot).fcurves` to edit curves. |
| `scene.render.engine = "BLENDER_EEVEE_NEXT"` | `"BLENDER_EEVEE"`. Valid ids: `BLENDER_EEVEE`, `BLENDER_WORKBENCH`, `CYCLES`. |
| `scene.eevee.use_bloom`, `use_gtao`, `use_ssr` | Removed. Use `scene.eevee.use_raytracing`, and a Glare node in the compositor for bloom. |
| `scene.use_nodes = True; scene.node_tree` | `scene.node_tree` is removed. Create a compositor node group and assign it to `scene.compositing_node_group`; set `.scene` on its Render Layers node; output through a Group Output node (`CompositorNodeComposite` is gone). |
| `scene.sequence_editor.sequences` / `SoundSequence` | Sequences are now **strips** (`SoundStrip`, `strips`). |
| `image_settings.file_format = "FFMPEG"` alone | Set `image_settings.media_type` first. Prefer PNG/EXR sequences anyway. |
| Relying on the GUI's GPU preference | Headless runs don't inherit it. In-script: `prefs = bpy.context.preferences.addons["cycles"].preferences; prefs.compute_device_type = "METAL"; prefs.get_devices(); [setattr(d, "use", True) for d in prefs.devices]; scene.cycles.device = "GPU"`. Keep MetalRT off by default. |
| Implicit color management | Default view is AgX. Pin `scene.view_settings.view_transform` explicitly. |
| Add-ons with compiled wheels for Python 3.11 | Fail to import under 3.13. Check before depending on one. |

## Script Skeleton

```python
import sys, random, bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
SEED = int(argv[0]) if argv else 1
random.seed(SEED)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 30
scene.render.resolution_x, scene.render.resolution_y = 1920, 1080
scene.unit_settings.system = "METRIC"
scene.render.engine = "BLENDER_EEVEE"
scene.view_settings.view_transform = "AgX"

# ... build by name ...

assert scene.camera is not None, "no active camera"
bpy.ops.wm.save_as_mainfile(filepath=argv[1] if len(argv) > 1 else "shot.blend")
```

## Anti-Patterns

- Pasting 3.x/4.x snippets from the web without probing them.
- Catching and swallowing exceptions in the build script; let it fail with `--python-exit-code 1`.
- Using `bpy.ops` operators that depend on UI context (selection, active area) when a direct data API exists.

## References

- https://developer.blender.org/docs/release_notes/5.1/python_api/
- https://docs.blender.org/api/current/change_log.html
- https://docs.blender.org/api/5.0/bpy.types.ActionChannelbag.html
