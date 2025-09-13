import cv2
import numpy as np
from PIL import Image
import tempfile

IMAGE_SIZE = 1800

def process_image_for_ocr(file_path):
    temp_filename = set_image_dpi(file_path)
    im_new = enhance_and_clean(temp_filename)
    return im_new

def set_image_dpi(file_path):
    im = Image.open(file_path)

    # Ensure no alpha channel (convert RGBA → RGB)
    if im.mode == "RGBA":
        im = im.convert("RGB")

    length_x, width_y = im.size
    factor = max(1, int(IMAGE_SIZE / length_x))
    size = factor * length_x, factor * width_y
    im_resized = im.resize(size, Image.Resampling.LANCZOS)
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.jpg')
    temp_filename = temp_file.name
    im_resized.save(temp_filename, dpi=(300, 300))
    return temp_filename

def enhance_and_clean(file_name):
    # Read in grayscale
    img = cv2.imread(file_name, cv2.IMREAD_GRAYSCALE)

    # Step 1: Contrast enhancement using CLAHE
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8,8))
    img = clahe.apply(img)

    # Step 2: Gaussian blur to reduce tiny noise
    blurred = cv2.GaussianBlur(img, (3,3), 0)

    # Step 3: Adaptive threshold
    thresh = cv2.adaptiveThreshold(
        blurred,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        2
    )

    # Step 4: Morphological closing (fills small holes in text)
    kernel = np.ones((2, 2), np.uint8)
    morph = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)

    # Step 5: Optional sharpening to strengthen edges
    kernel_sharp = np.array([[0, -1, 0],
                             [-1, 5,-1],
                             [0, -1, 0]])
    sharpened = cv2.filter2D(morph, -1, kernel_sharp)

    return sharpened



# import tempfile

# import cv2
# import numpy as np
# from PIL import Image

# IMAGE_SIZE = 1800
# BINARY_THREHOLD = 180

# def process_image_for_ocr(file_path):
#     # TODO : Implement using opencv
#     temp_filename = set_image_dpi(file_path)
#     im_new = remove_noise_and_smooth(temp_filename)
#     return im_new

# def set_image_dpi(file_path):
#     im = Image.open(file_path)
#     length_x, width_y = im.size
#     factor = max(1, int(IMAGE_SIZE / length_x))
#     size = factor * length_x, factor * width_y
#     # size = (1800, 1800)
#     im_resized = im.resize(size, Image.Resampling.LANCZOS)
#     temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.jpg')
#     temp_filename = temp_file.name
#     im_resized.save(temp_filename, dpi=(300, 300))
#     return temp_filename

# def image_smoothening(img):
#     ret1, th1 = cv2.threshold(img, BINARY_THREHOLD, 255, cv2.THRESH_BINARY)
#     ret2, th2 = cv2.threshold(th1, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
#     blur = cv2.GaussianBlur(th2, (1, 1), 0)
#     ret3, th3 = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
#     return th3

# def remove_noise_and_smooth(file_name):
#     img = cv2.imread(file_name, 0)
#     filtered = cv2.adaptiveThreshold(img.astype(np.uint8), 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY, 41,
#                                      3)
#     kernel = np.ones((1, 1), np.uint8)
#     opening = cv2.morphologyEx(filtered, cv2.MORPH_OPEN, kernel)
#     closing = cv2.morphologyEx(opening, cv2.MORPH_CLOSE, kernel)
#     img = image_smoothening(img)
#     or_image = cv2.bitwise_or(img, closing)
#     return or_image