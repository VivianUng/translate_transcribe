from PIL import Image, ImageOps, ImageFilter
import numpy as np
import cv2
import io
from typing import Dict, Tuple

# def process_image_for_ocr(contents: bytes) -> Image.Image:
#     """
#     Preprocess an image (from raw bytes) for optimal OCR with pytesseract.
#     Focused on clean, printed text images with possible minor noise.
#     Returns a PIL.Image.
#     """
#     # Load with PIL
#     im = Image.open(io.BytesIO(contents))

#     # 1. Convert to grayscale
#     im = ImageOps.grayscale(im)

#     # 2. Convert PIL → OpenCV for better thresholding/denoising
#     img_cv = np.array(im)

#     # 3. Adaptive thresholding (better than global for varied backgrounds)
#     img_cv = cv2.adaptiveThreshold(
#         img_cv, 255,
#         cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
#         cv2.THRESH_BINARY,
#         blockSize=31,  # size of pixel neighborhood
#         C=15           # constant subtracted from mean
#     )

#     # 4. Median blur (remove small noise, keep edges sharp)
#     img_cv = cv2.medianBlur(img_cv, 3)

#     # 5. Resize if text is too small (upscale by 2x if width < 1000px)
#     if img_cv.shape[1] < 1000:
#         img_cv = cv2.resize(img_cv, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)

#     # Convert back to PIL
#     im_processed = Image.fromarray(img_cv)

#     return im_processed


def process_image_for_ocr(contents: bytes) -> Image.Image:
    """Full preprocessing pipeline. Accepts raw bytes and returns a PIL.Image ready for pytesseract."""
    im = Image.open(io.BytesIO(contents))   # Start with raw bytes

    gray_image = convert_to_grayscale(im)
    resized_image = resize_image(gray_image)
    thresholded_image = thresholding(resized_image)

    return thresholded_image  # PIL.Image, valid for pytesseract


def convert_to_grayscale(im: Image.Image) -> Image.Image:
    """Convert image to grayscale."""
    return ImageOps.grayscale(im)


def resize_image(gray_image: Image.Image) -> Image.Image:
    """Resize the grayscale image by scale factor."""
    scale_factor = 2
    return gray_image.resize(
        (gray_image.width * scale_factor, gray_image.height * scale_factor),
        resample=Image.LANCZOS
    )


def thresholding(resized_image: Image.Image) -> Image.Image:
    """Apply edge detection filter."""
    return resized_image.filter(ImageFilter.FIND_EDGES)
