from PIL import Image
import os
import io
import zipfile
from typing import Union, Tuple, List

def process_single_sticker(image: Image.Image) -> Image.Image:
    """
    Resizes a single sticker image to fit within LINE specifications (W370 x H320).
    Maintains aspect ratio and ensures RGBA mode.
    """
    MAX_W = 370
    MAX_H = 320
    
    # Ensure RGBA
    if image.mode != 'RGBA':
        image = image.convert('RGBA')
    
    # Resize keeping aspect ratio
    image.thumbnail((MAX_W, MAX_H), Image.Resampling.LANCZOS)
    
    return image

def _generate_slices(image_input: Union[str, io.BytesIO], rows: int, cols: int) -> List[Tuple[str, Image.Image]]:
    """
    Core function to slice image into a grid.
    Returns a list of (filename, image_object) tuples.
    """
    try:
        img = Image.open(image_input)
    except Exception as e:
        print(f"Error opening image: {e}")
        return []

    img_w, img_h = img.size
    cell_w = img_w / cols
    cell_h = img_h / rows
    
    slices = []
    count = 1
    
    print(f"Slicing image ({img_w}x{img_h}) into {rows}x{cols} grid...")

    for r in range(rows):
        for c in range(cols):
            left = c * cell_w
            top = r * cell_h
            right = left + cell_w
            bottom = top + cell_h
            
            # Crop
            cell = img.crop((left, top, right, bottom))
            
            # Process (resize)
            processed_cell = process_single_sticker(cell)
            
            filename = f"{count:02d}.png"
            slices.append((filename, processed_cell))
            count += 1
            
    return slices

def slice_grid(image_path: str, rows: int, cols: int, output_dir: str):
    """
    Slices the input image into rows x cols grid and saves them to disk.
    (CLI usage)
    """
    # Create output directory if not exists
    os.makedirs(output_dir, exist_ok=True)
    
    slices = _generate_slices(image_path, rows, cols)
    
    for filename, img in slices:
        save_path = os.path.join(output_dir, filename)
        img.save(save_path, "PNG")
        print(f"Saved {save_path} ({img.width}x{img.height})")

    print("Done!")

def slice_to_zip(image_stream: io.BytesIO, rows: int, cols: int) -> io.BytesIO:
    """
    Slices the input image stream and returns a ZIP file containing the images as bytes.
    (Web usage)
    """
    slices = _generate_slices(image_stream, rows, cols)
    
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for filename, img in slices:
            # Save image to a memory buffer
            img_byte_arr = io.BytesIO()
            img.save(img_byte_arr, format='PNG')
            img_byte_arr.seek(0)
            
            # Write to zip
            zip_file.writestr(filename, img_byte_arr.getvalue())
            
    zip_buffer.seek(0)
    return zip_buffer
