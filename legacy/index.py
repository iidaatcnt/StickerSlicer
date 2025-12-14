from flask import Flask, request, send_file
import sys
import os
import io
from .slicer import slice_to_zip

app = Flask(__name__, static_folder='../public', static_url_path='')

@app.route('/')
def index():
    return send_file('../public/index.html')

@app.route('/api/health')
def health():
    return "OK"

@app.route('/api/slice', methods=['POST'])
def slice_route():
    if 'image' not in request.files:
        return 'No image uploaded', 400
    
    file = request.files['image']
    if file.filename == '':
        return 'No selected file', 400
        
    try:
        rows = int(request.form.get('rows', 4))
        cols = int(request.form.get('cols', 4))
    except ValueError:
        return 'Invalid rows/cols', 400
    
    # Read file into memory
    image_stream = io.BytesIO(file.read())
    
    # Process
    try:
        zip_buffer = slice_to_zip(image_stream, rows, cols)
    except Exception as e:
        return f"Error processing image: {str(e)}", 500
        
    return send_file(
        zip_buffer,
        mimetype='application/zip',
        as_attachment=True,
        download_name='stickers.zip'
    )

if __name__ == '__main__':
    app.run(port=5000, debug=True)
