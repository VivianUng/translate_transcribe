from PIL import Image, ImageOps, ImageFilter
import io

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
