import argparse
import json


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--path", required=True)
    parser.add_argument("--sample-every", type=int, default=1)
    args = parser.parse_args()

    try:
        import cv2
    except Exception as exc:
        raise SystemExit(f"opencv-python is required: {exc}")

    cap = cv2.VideoCapture(args.path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    frames = []
    frame_index = 0
    sample_every = max(1, args.sample_every)

    while True:
        ok, frame = cap.read()
        if not ok:
            break

        if frame_index % sample_every == 0:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            detections = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5)
            faces = [
                {"x": float(x), "y": float(y), "w": float(w), "h": float(h), "score": 1.0}
                for (x, y, w, h) in detections
            ]
            frames.append({"time_s": frame_index / fps, "faces": faces})

        frame_index += 1

    cap.release()
    print(json.dumps({"frames": frames}))


if __name__ == "__main__":
    main()
