import JSZip from 'jszip';
import { removeBackground } from '@imgly/background-removal';

export interface SliceResult {
    id: number;
    blob: Blob;
    url: string;
    name: string;
}

const MAX_W = 370;
const MAX_H = 320;

export async function processImage(
    file: File,
    rows: number,
    cols: number,
    removeBg: boolean = false,
    offsetX: number = 0,
    offsetY: number = 0
): Promise<{ slices: SliceResult[]; zipBlob: Blob }> {
    let sourceImage: Blob | File = file;

    // 0. Remove Background (Optional)
    if (removeBg) {
        sourceImage = await removeBackground(file);
    }

    // 1. Load Image
    const img = await loadImage(sourceImage);
    const imgW = img.naturalWidth;
    const imgH = img.naturalHeight;

    const cellW = imgW / cols;
    const cellH = imgH / rows;

    const zip = new JSZip();
    const slices: SliceResult[] = [];

    let count = 1;


    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            // 2. Crop
            const sx = c * cellW + offsetX;
            const sy = r * cellH + offsetY;

            // 3. Resize & Process
            const blob = await cropAndResize(img, sx, sy, cellW, cellH, MAX_W, MAX_H, 'fit');

            // 4. Metadata
            const name = `${String(count).padStart(2, '0')}.png`;
            const url = URL.createObjectURL(blob);

            slices.push({ id: count, blob, url, name });
            zip.file(name, blob);

            count++;
        }
    }

    // Generate main.png (240x240) based on the first cell (01.png)
    if (rows > 0 && cols > 0) {
        // Main and Tab images must be exact size with padding
        // Uses the first cell's position (including offsets)
        const mainBlob = await cropAndResize(img, offsetX, offsetY, cellW, cellH, 240, 240, 'pad');
        zip.file('main.png', mainBlob);

        const tabBlob = await cropAndResize(img, offsetX, offsetY, cellW, cellH, 96, 74, 'pad');
        zip.file('tab.png', tabBlob);
    }

    // 5. Generate Zip
    const zipBlob = await zip.generateAsync({ type: 'blob' });

    return { slices, zipBlob };
}

function loadImage(file: Blob | File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}

function cropAndResize(
    source: HTMLImageElement,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    maxWidth: number,
    maxHeight: number,
    mode: 'fit' | 'pad' = 'fit'
): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        // We want to fit within maxWidth x maxHeight while maintaining aspect ratio
        // But first, let's get the aspect ratio of the crop
        const aspect = sw / sh;

        let targetW = maxWidth;
        let targetH = maxHeight;

        // Calculate proper dimensions to fit inside maxWidth x maxHeight
        if (targetW / aspect > targetH) {
            // Height assumes priority
            targetW = targetH * aspect;
        } else {
            // Width assumes priority
            targetH = targetW / aspect;
        }

        // Set canvas size (this determines output size)
        if (mode === 'pad') {
            canvas.width = maxWidth;
            canvas.height = maxHeight;
        } else {
            canvas.width = targetW;
            canvas.height = targetH;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
        }

        // High quality scaling
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Calculate position to center the image
        let dx = 0;
        let dy = 0;

        if (mode === 'pad') {
            dx = (maxWidth - targetW) / 2;
            dy = (maxHeight - targetH) / 2;
        }

        // Draw cropped portion to resized canvas
        ctx.drawImage(source, sx, sy, sw, sh, dx, dy, targetW, targetH);

        canvas.toBlob(
            (blob) => {
                if (blob) resolve(blob);
                else reject(new Error('Canvas to Blob failed'));
            },
            'image/png'
        );
    });
}
