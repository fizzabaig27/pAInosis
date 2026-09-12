#pAInosis Final Year Project
Painosis is a full-stack medical imaging platform (React + FastAPI) that enhances medical scans and diagnoses brain tumors from MRI images using a cascaded deep learning pipeline built on DenseNet-121. The system validates that an uploaded
image is medical, confirms it's specifically a brain MRI, and
classifies it into one of four categories — glioma, meningioma, pituitary tumor, or no tumor — with Grad-CAM heatmaps showing which regions influenced the prediction. Role-based access distinguishes Doctors, Radiologists, Researchers, and 
Admins, with PMDC license verification gating clinical features and traceable, signed PDF reports for verified medical professionals.
