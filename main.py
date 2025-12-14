import argparse
import os
import sys
from api.slicer import slice_grid

def main():
    parser = argparse.ArgumentParser(description="StickerSlicer: Slice a grid of images into LINE stickers.")
    parser.add_argument("input_file", help="Path to the input image file.")
    parser.add_argument("--rows", "-r", type=int, default=4, help="Number of rows in the grid (default: 4).")
    parser.add_argument("--cols", "-c", type=int, default=4, help="Number of columns in the grid (default: 4).")
    
    args = parser.parse_args()
    
    if not os.path.exists(args.input_file):
        print(f"Error: File '{args.input_file}' not found.")
        sys.exit(1)
        
    # Determine output directory name
    base_name = os.path.splitext(os.path.basename(args.input_file))[0]
    output_dir = os.path.join(os.path.dirname(os.path.abspath(args.input_file)), base_name)
    
    slice_grid(args.input_file, args.rows, args.cols, output_dir)

if __name__ == "__main__":
    main()
