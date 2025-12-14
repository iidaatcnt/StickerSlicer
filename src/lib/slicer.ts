import JSZip from 'jszip';

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
    cols: number
): Promise<{ slices: SliceResult[]; zipBlob: Blob }> {
    // 1. Load Image
    const img = await loadImage(file);
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
            const sx = c * cellW;
            const sy = r * cellH;

            // 3. Resize & Process
            const blob = await cropAndResize(img, sx, sy, cellW, cellH, MAX_W, MAX_H);

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
        const mainBlob = await cropAndResize(img, 0, 0, cellW, cellH, 240, 240);
        zip.file('main.png', mainBlob);

        const tabBlob = await cropAndResize(img, 0, 0, cellW, cellH, 96, 74);
        zip.file('tab.png', tabBlob);
    }

    // 5. Generate Zip
    const zipBlob = await zip.generateAsync({ type: 'blob' });

    return { slices, zipBlob };
}

function loadImage(file: File): Promise<HTMLImageElement> {
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
    maxHeight: number
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
        canvas.width = targetW;
        canvas.height = targetH;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
        }

        // High quality scaling
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Draw cropped portion to resized canvas
        ctx.drawImage(source, sx, sy, sw, sh, 0, 0, targetW, targetH);

        canvas.toBlob(
            (blob) => {
                if (blob) resolve(blob);
                else reject(new Error('Canvas to Blob failed'));
            },
            'image/png'
        );
    });
}
