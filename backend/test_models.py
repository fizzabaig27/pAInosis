from modules import ai_model, checker_models
from PIL import Image

print("Loading Checker 3 (tumor classifier)...")
ai_model.load_model()
print("Checker 3 loaded successfully")

print("Loading Checker 1 (medical vs non-medical)...")
checker_models.load_checker1()
print("Checker 1 loaded successfully")

print("Loading Checker 2 (brain MRI vs other)...")
checker_models.load_checker2()
print("Checker 2 loaded successfully")