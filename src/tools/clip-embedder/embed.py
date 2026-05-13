import argparse
import json

MODEL_ID = "ViT-B-32/laion2b_s34b_b79k"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--path", required=True)
    parser.add_argument("--modality", choices=["image", "frame"], default="image")
    args = parser.parse_args()

    try:
        from PIL import Image
        import open_clip
        import torch
    except Exception as exc:
        raise SystemExit(f"open_clip_torch and pillow are required: {exc}")

    torch.manual_seed(0)
    model, _, preprocess = open_clip.create_model_and_transforms("ViT-B-32", pretrained="laion2b_s34b_b79k")
    model.eval()
    image = preprocess(Image.open(args.path).convert("RGB")).unsqueeze(0)

    with torch.no_grad():
        vector = model.encode_image(image)
        vector = vector / vector.norm(dim=-1, keepdim=True)

    values = vector.squeeze(0).cpu().tolist()
    print(json.dumps({"dim": len(values), "vector": values, "model_id": MODEL_ID}))


if __name__ == "__main__":
    main()
