import JSZip from 'jszip';

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

export interface DetectedCell {
    x: number; y: number; w: number; h: number; // セル領域
    cx: number; cy: number; cw: number; ch: number; // コンテンツ領域
}

const MAX_W = 370;
const MAX_H = 320;

// ────────────────────────────────────────────
// 自動検出モード
// ────────────────────────────────────────────

/**
 * 黒背景画像からスタンプ領域を自動検出する
 * 1. 輝度プロファイルで行の区切りを検出
 * 2. 各行帯で列の区切りを検出
 * 3. 各セル内のコンテンツ輪郭ボックスを取得
 */
export function detectCells(
    imageData: ImageData,
    bgThreshold = 30,
    gapThreshold = 0.01 // 行/列の「隙間」判定：非背景ピクセル比率がこれ以下なら隙間
): DetectedCell[] {
    const { data, width, height } = imageData;

    const isBackground = (r: number, g: number, b: number) =>
        r < bgThreshold && g < bgThreshold && b < bgThreshold;

    // 各行の非背景ピクセル比率
    const rowProfile: number[] = [];
    for (let y = 0; y < height; y++) {
        let count = 0;
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            if (!isBackground(data[i], data[i + 1], data[i + 2])) count++;
        }
        rowProfile.push(count / width);
    }

    // 行の区切りを検出（隙間 → スタンプ帯 のブロック分割）
    const rowBands = splitProfile(rowProfile, gapThreshold);
    if (rowBands.length === 0) return [];

    const cells: DetectedCell[] = [];

    for (const [rowStart, rowEnd] of rowBands) {
        const bandH = rowEnd - rowStart;

        // 各列の非背景ピクセル比率（この行帯の中だけで計算）
        const colProfile: number[] = [];
        for (let x = 0; x < width; x++) {
            let count = 0;
            for (let y = rowStart; y < rowEnd; y++) {
                const i = (y * width + x) * 4;
                if (!isBackground(data[i], data[i + 1], data[i + 2])) count++;
            }
            colProfile.push(count / bandH);
        }

        const colBands = splitProfile(colProfile, gapThreshold);

        for (const [colStart, colEnd] of colBands) {
            // セル内のコンテンツ輪郭ボックスを取得
            const bbox = getContentBBox(data, width, rowStart, rowEnd, colStart, colEnd, isBackground);
            cells.push({
                x: colStart, y: rowStart, w: colEnd - colStart, h: bandH,
                cx: bbox.x, cy: bbox.y, cw: bbox.w, ch: bbox.h,
            });
        }
    }

    return cells;
}

/** プロファイル配列から「コンテンツのある帯」の [start, end] リストを返す */
function splitProfile(profile: number[], threshold: number): [number, number][] {
    const bands: [number, number][] = [];
    let inBand = false;
    let start = 0;

    for (let i = 0; i < profile.length; i++) {
        if (!inBand && profile[i] > threshold) {
            inBand = true;
            start = i;
        } else if (inBand && profile[i] <= threshold) {
            inBand = false;
            if (i - start > 5) bands.push([start, i]); // 5px以下の帯は無視
        }
    }
    if (inBand && profile.length - start > 5) bands.push([start, profile.length]);
    return bands;
}

/** セル内のコンテンツ（非背景ピクセル）の輪郭ボックスを返す */
function getContentBBox(
    data: Uint8ClampedArray,
    width: number,
    rowStart: number, rowEnd: number,
    colStart: number, colEnd: number,
    isBackground: (r: number, g: number, b: number) => boolean
): { x: number; y: number; w: number; h: number } {
    let minX = colEnd, maxX = colStart, minY = rowEnd, maxY = rowStart;
    for (let y = rowStart; y < rowEnd; y++) {
        for (let x = colStart; x < colEnd; x++) {
            const i = (y * width + x) * 4;
            if (!isBackground(data[i], data[i + 1], data[i + 2])) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    if (minX > maxX || minY > maxY) return { x: colStart, y: rowStart, w: colEnd - colStart, h: rowEnd - rowStart };
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** 検出されたセルを 370×320px 中央配置で書き出す */
function cropCellCentered(
    source: HTMLImageElement,
    cell: DetectedCell
): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        canvas.width = MAX_W;
        canvas.height = MAX_H;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('no ctx')); return; }

        // コンテンツを MAX_W×MAX_H に収まるようスケール（余白10px）
        const margin = 10;
        const scale = Math.min((MAX_W - margin * 2) / cell.cw, (MAX_H - margin * 2) / cell.ch);
        const dw = cell.cw * scale;
        const dh = cell.ch * scale;
        const dx = (MAX_W - dw) / 2;
        const dy = (MAX_H - dh) / 2;

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(source, cell.cx, cell.cy, cell.cw, cell.ch, dx, dy, dw, dh);

        canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png');
    });
}

export async function processImageAuto(
    file: File,
    bgThreshold = 30,
    gapThreshold = 0.01
): Promise<{ slices: SliceResult[]; zipBlob: Blob; cells: DetectedCell[] }> {
    const img = await loadImage(file);

    // imageData 取得用の一時 canvas
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = img.naturalWidth;
    tmpCanvas.height = img.naturalHeight;
    const tmpCtx = tmpCanvas.getContext('2d')!;
    tmpCtx.drawImage(img, 0, 0);
    const imageData = tmpCtx.getImageData(0, 0, img.naturalWidth, img.naturalHeight);

    const rawCells = detectCells(imageData, bgThreshold, gapThreshold);

    // 中央値ベースの小領域フィルター：中央値の20%未満のセルを除外
    const areas = rawCells.map(c => c.cw * c.ch).sort((a, b) => a - b);
    const median = areas.length > 0 ? areas[Math.floor(areas.length / 2)] : 0;
    const cells = rawCells.filter(c => c.cw * c.ch >= median * 0.2);

    const zip = new JSZip();
    const slices: SliceResult[] = [];

    for (let i = 0; i < cells.length; i++) {
        const blob = await cropCellCentered(img, cells[i]);
        const name = `${String(i + 1).padStart(2, '0')}.png`;
        const url = URL.createObjectURL(blob);
        slices.push({ id: i + 1, blob, url, name });
        zip.file(name, blob);
    }

    // main.png / tab.png は1枚目から
    if (cells.length > 0) {
        const mainBlob = await cropAndResize(img, cells[0].cx, cells[0].cy, cells[0].cw, cells[0].ch, 240, 240, 'pad');
        zip.file('main.png', mainBlob);
        const tabBlob = await cropAndResize(img, cells[0].cx, cells[0].cy, cells[0].cw, cells[0].ch, 96, 74, 'pad');
        zip.file('tab.png', tabBlob);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    return { slices, zipBlob, cells };
}

export async function processImage(
    file: File,
    rows: number,
    cols: number,
    padding: Padding = { top: 0, bottom: 0, left: 0, right: 0 }
): Promise<{ slices: SliceResult[]; zipBlob: Blob }> {
    const img = await loadImage(file);
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
