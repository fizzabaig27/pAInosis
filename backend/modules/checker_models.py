"""
modules/checker_models.py
Loads Checker 1 (medical vs non-medical) and Checker 2 (brain MRI vs other scan)
and runs inference. These are the AI-based gate checks, used alongside
brain_validator.py's heuristic checks as a second layer of validation.
"""

import torch
import torch.nn as nn
from torchvision import models, transforms
from PIL import Image
import os

IMAGE_SIZE = 224
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

CHECKER1_PATH = os.path.join(os.path.dirname(__file__), "..", "models", "checker1_medical_vs_nonmedical_final.pth")
CHECKER2_PATH = os.path.join(os.path.dirname(__file__), "..", "models", "mrivsmedical.pth")
CHECKER1_CLASSES = ['medical', 'non_medical']
CHECKER2_CLASSES = ['brain_mri', 'other_scan']

transform = transforms.Compose([
    transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    )
])

_checker1_model = None
_checker2_model = None


def _build_binary_densenet():
    model = models.densenet121(weights=None)
    model.classifier = nn.Linear(model.classifier.in_features, 2)
    return model


def load_checker1() -> nn.Module:
    global _checker1_model
    if _checker1_model is None:
        model = _build_binary_densenet()
        model.load_state_dict(torch.load(CHECKER1_PATH, map_location=device))
        model.to(device)
        model.eval()
        _checker1_model = model
    return _checker1_model


def load_checker2() -> nn.Module:
    global _checker2_model
    if _checker2_model is None:
        model = _build_binary_densenet()
        model.load_state_dict(torch.load(CHECKER2_PATH, map_location=device))
        model.to(device)
        model.eval()
        _checker2_model = model
    return _checker2_model


def _predict_binary(model, class_names, image: Image.Image) -> dict:
    if image.mode != "RGB":
        image = image.convert("RGB")
    tensor = transform(image).unsqueeze(0).to(device)

    with torch.no_grad():
        outputs = model(tensor)
        probs = torch.softmax(outputs, dim=1)[0]

    predicted_idx = int(torch.argmax(probs).item())
    return {
        "predicted_class": class_names[predicted_idx],
        "confidence": round(float(probs[predicted_idx].item()) * 100, 2),
        "all_probabilities": {
            class_names[i]: round(float(probs[i].item()) * 100, 2)
            for i in range(len(class_names))
        }
    }


def check_is_medical(image: Image.Image) -> dict:
    """Checker 1: is this a medical image at all?"""
    model = load_checker1()
    result = _predict_binary(model, CHECKER1_CLASSES, image)
    result["is_medical"] = result["predicted_class"] == "medical"
    return result


def check_is_brain_mri(image: Image.Image) -> dict:
    """Checker 2: is this specifically a brain MRI?"""
    model = load_checker2()
    result = _predict_binary(model, CHECKER2_CLASSES, image)
    result["is_brain_mri"] = result["predicted_class"] == "brain_mri"
    return result