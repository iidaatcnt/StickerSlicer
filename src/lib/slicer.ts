import JSZip from 'jszip';
import { removeBackground } from '@imgly/background-removal';

export interface SliceResult {
    id: number;
    blob: Blob;
    url: string;
    name: string;
}

export interface Padding {
    top: number;
    bottom: number;
    left: number;
    right: number;
}

const MAX_W = 370;
const MAX_H = 320;

export async function processImage(
    file: File,
    rows: number,
    cols: number,
    removeBg: boolean = false,
    padding: Padding = { top: 0, bottom: 0, left: 0, right: 0 }
): Promise<{ slices: SliceResult[]; zipBlob: Blob }> {
    let sourceImage: Blob | File = file;

    if (removeBg) {
        sourceImage = await removeBackground(file);
    }

    const img = await loadImage(sourceImage);
    const imgW = img.naturalWidth;
    const imgH = img.naturalHeight;

    // 余白を除いたアクティブエリアでセルサイズを計算
    const activeW = imgW - padding.left - padding.right;
    const activeH = imgH - padding.top  - padding.bottom;
    const cellW = activeW / cols;
    const cellH = activeH / rows;

    const zip = new JSZip();
    const slices: SliceResult[] = [];
    let count = 1;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const sx = padding.left + c * cellW;
            const sy = padding.top  + r * cellH;

            const blob = await cropAndResize(img, sx, sy, cellW, cellH, MAX_W, MAX_H, 'fit');
            const name = `${String(count).padStart(2, '0')}.png`;
            const url = URL.createObjectURL(blob);

            slices.push({ id: count, blob, url, name });
            zip.file(name, blob);
            count++;
        }
    }

    // main.png (240x240) と tab.png (96x74) は1枚目のセルから生成
    if (rows > 0 && cols > 0) {
        const mainBlob = await cropAndResize(img, padding.left, padding.top, cellW, cellH, 240, 240, 'pad');
        zip.file('main.png', mainBlob);

        const tabBlob = await cropAndResize(img, padding.left, padding.top, cellW, cellH, 96, 74, 'pad');
        zip.file('tab.png', tabBlob);
    }

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
        const aspect = sw / sh;

        let targetW = maxWidth;
        let targetH = maxHeight;

        if (targetW / aspect > targetH) {
            targetW = targetH * aspect;
        } else {
            targetH = targetW / aspect;
        }

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

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        let dx = 0;
        let dy = 0;

        if (mode === 'pad') {
            dx = (maxWidth - targetW) / 2;
            dy = (maxHeight - targetH) / 2;
        }

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
