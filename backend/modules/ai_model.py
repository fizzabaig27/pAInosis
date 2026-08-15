"""
modules/ai_model.py
Loads the trained DenseNet121 brain tumor classifier (Checker 3) and runs inference.
Architecture matches the Colab training notebook exactly: DenseNet121 with a single
Linear classifier head (NOT a multi-layer head).
"""

import torch
import torch.nn as nn
from torchvision import models, transforms
from PIL import Image
import numpy as np
import time
import os

# ── Constants ──────────────────────────────────────────────────
MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "models", "brain_tumor_model_final.pth")
IMAGE_SIZE = 224
CONFIDENCE_THRESHOLD = 70.0

CLASS_NAMES = ['glioma', 'meningioma', 'notumor', 'pituitary']

CLASS_DISPLAY = {
    'glioma': 'Glioma',
    'meningioma': 'Meningioma',
    'notumor': 'No Tumor Detected',
    'pituitary': 'Pituitary Tumor',
}

preprocess = transforms.Compose([
    transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    )
])

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# Known validation performance, from held-out test set evaluation (Colab)
VALIDATION_STATS = {
    "glioma": {"precision": 0.98, "recall": 0.92, "f1_score": 0.95},
    "meningioma": {"precision": 0.93, "recall": 0.96, "f1_score": 0.94},
    "notumor": {"precision": 0.97, "recall": 1.00, "f1_score": 0.98},
    "pituitary": {"precision": 0.98, "recall": 1.00, "f1_score": 0.99},
}

def build_model() -> nn.Module:
    model = models.densenet121(weights=None)
    model.classifier = nn.Linear(model.classifier.in_features, len(CLASS_NAMES))
    return model


_model = None


def load_model() -> nn.Module:
    global _model
    if _model is None:
        model = build_model()
        state_dict = torch.load(MODEL_PATH, map_location=device)
        model.load_state_dict(state_dict)
        model.to(device)
        model.eval()
        _model = model
    return _model


def predict(image: Image.Image) -> dict:
    model = load_model()

    if image.mode != "RGB":
        image = image.convert("RGB")

    tensor = preprocess(image).unsqueeze(0).to(device)

    start_time = time.time()
    with torch.no_grad():
        outputs = model(tensor)
        probabilities = torch.softmax(outputs, dim=1)[0]
    inference_time = int((time.time() - start_time) * 1000)

    probs_np = probabilities.cpu().numpy()
    predicted_idx = int(np.argmax(probs_np))
    predicted_class = CLASS_NAMES[predicted_idx]
    confidence = float(probs_np[predicted_idx]) * 100

    all_probabilities = {
        CLASS_NAMES[i]: round(float(probs_np[i]) * 100, 2)
        for i in range(len(CLASS_NAMES))
    }

    return {
        "predicted_class": predicted_class,
        "display_name": CLASS_DISPLAY[predicted_class],
        "confidence": round(confidence, 2),
        "all_probabilities": all_probabilities,
        "requires_human_review": confidence < CONFIDENCE_THRESHOLD,
        "inference_time_ms": inference_time,
        "validation_stats": VALIDATION_STATS[predicted_class],
    }


def predict_from_numpy(img_array: np.ndarray) -> dict:
    if len(img_array.shape) == 3 and img_array.shape[2] == 3:
        img_array = img_array[:, :, ::-1]
    image = Image.fromarray(img_array.astype(np.uint8))
    return predict(image)