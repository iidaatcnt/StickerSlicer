'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Download, Loader2, Image as ImageIcon, Wand2, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { saveAs } from 'file-saver';
import { processImage, SliceResult, Padding } from '@/lib/slicer';
import { cn } from '@/lib/utils';

export function SlicerApp() {
    const [file, setFile] = useState<File | null>(null);
    const [previewOriginal, setPreviewOriginal] = useState<string | null>(null);
    const [rows, setRows] = useState<number | ''>(5);
    const [cols, setCols] = useState<number | ''>(6);
    const [isProcessing, setIsProcessing] = useState(false);
    const [slices, setSlices] = useState<SliceResult[]>([]);
    const [zipBlob, setZipBlob] = useState<Blob | null>(null);
    const [removeBg, setRemoveBg] = useState(false);
    const [padding, setPadding] = useState<Padding>({ top: 0, bottom: 0, left: 0, right: 0 });
    const [bgColor, setBgColor] = useState<string>('transparent');
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

    const imgRef = useRef<HTMLImageElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // キーボード操作（ライトボックス）
    useEffect(() => {
        if (lightboxIndex === null) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setLightboxIndex(null);
            if (e.key === 'ArrowRight') setLightboxIndex(i => i !== null ? Math.min(i + 1, slices.length - 1) : null);
            if (e.key === 'ArrowLeft')  setLightboxIndex(i => i !== null ? Math.max(i - 1, 0) : null);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [lightboxIndex, slices.length]);

    const drawGrid = useCallback(() => {
        const canvas = canvasRef.current;
        const img = imgRef.current;
        if (!canvas || !img || !previewOriginal) return;

        const dispW = img.clientWidth;
        const dispH = img.clientHeight;
        if (dispW === 0 || dispH === 0) return;

        canvas.width = dispW;
        canvas.height = dispH;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, dispW, dispH);

        const r = Number(rows) || 1;
        const c = Number(cols) || 1;
        const natW = img.naturalWidth;
        const natH = img.naturalHeight;

        const scaleX = dispW / natW;
        const scaleY = dispH / natH;

        const padL = padding.left   * scaleX;
        const padR = padding.right  * scaleX;
        const padT = padding.top    * scaleY;
        const padB = padding.bottom * scaleY;

        const activeW = dispW - padL - padR;
        const activeH = dispH - padT - padB;
        const cellW = activeW / c;
        const cellH = activeH / r;

        ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
        if (padT > 0) ctx.fillRect(0, 0, dispW, padT);
        if (padB > 0) ctx.fillRect(0, dispH - padB, dispW, padB);
        if (padL > 0) ctx.fillRect(0, padT, padL, activeH);
        if (padR > 0) ctx.fillRect(dispW - padR, padT, padR, activeH);

        ctx.strokeStyle = 'rgba(34, 197, 94, 0.85)';
        ctx.lineWidth = 1.5;

        for (let i = 0; i <= c; i++) {
            const x = padL + i * cellW;
            ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + activeH); ctx.stroke();
        }
        for (let i = 0; i <= r; i++) {
            const y = padT + i * cellH;
            ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + activeW, y); ctx.stroke();
        }

        ctx.fillStyle = 'rgba(34, 197, 94, 0.9)';
        ctx.font = `${Math.max(10, Math.min(cellW, cellH) * 0.25)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        let num = 1;
        for (let ri = 0; ri < r; ri++) {
            for (let ci = 0; ci < c; ci++) {
                ctx.fillText(String(num), padL + ci * cellW + cellW / 2, padT + ri * cellH + cellH / 2);
                num++;
            }
        }
    }, [rows, cols, padding, previewOriginal]);

    useEffect(() => { drawGrid(); }, [drawGrid]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];
            setFile(selectedFile);
            setPreviewOriginal(URL.createObjectURL(selectedFile));
            setSlices([]);
            setZipBlob(null);
            setRemoveBg(false);
        }
    };

    const handleSlice = async () => {
        if (!file) return;
        setIsProcessing(true);
        try {
            await new Promise(r => setTimeout(r, 100));
            const r = Number(rows) || 5;
            const c = Number(cols) || 6;
            const result = await processImage(file, r, c, removeBg, padding);
            setSlices(result.slices);
            setZipBlob(result.zipBlob);
        } catch (error) {
            console.error(error);
            alert('画像の処理中にエラーが発生しました');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDownload = () => {
        if (zipBlob && file) {
            const name = file.name.replace(/\.[^/.]+$/, '');
            saveAs(zipBlob, `${name}_stickers.zip`);
        }
    };

    const updatePadding = (key: keyof Padding, value: string) => {
        setPadding(prev => ({ ...prev, [key]: value === '' ? 0 : Number(value) }));
    };

    const checkerBg = 'repeating-conic-gradient(#3f3f46 0% 25%, #27272a 0% 50%) 0 0 / 16px 16px';
    const previewBg = bgColor === 'transparent' ? checkerBg : bgColor;

    return (
        <div className="w-full max-w-5xl mx-auto p-6 space-y-8">
            {/* Header */}
            <div className="text-center space-y-2">
                <h1 className="text-4xl font-bold bg-gradient-to-r from-green-500 to-emerald-700 bg-clip-text text-transparent">
                    スタンプスライサー
                </h1>
                <p className="text-gray-400">プライベート、高速、クライアントサイドでLINEスタンプ生成。</p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
                {/* Controls */}
                <div className="space-y-5 bg-zinc-900 p-6 rounded-2xl border border-zinc-800">
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-300">1. 画像をアップロード</label>
                        <div className="relative group">
                            <input type="file" accept="image/*" onChange={handleFileChange}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                            <div className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-zinc-700 rounded-xl bg-zinc-900/50 group-hover:border-green-500/50 transition-colors">
                                <Upload className="w-6 h-6 text-gray-500 mb-1 group-hover:text-green-500" />
                                <span className="text-sm text-gray-500 group-hover:text-gray-300">
                                    {file ? file.name : 'クリックまたはドラッグ'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-300">2. グリッド設定</label>
                        <div className="grid grid-cols-2 gap-3">
                            {(['行数', '列数'] as const).map((label, i) => (
                                <div key={label} className="space-y-1">
                                    <label className="text-xs text-gray-400">{label}</label>
                                    <input type="number" min="1" max="20"
                                        value={i === 0 ? rows : cols}
                                        onChange={e => i === 0
                                            ? setRows(e.target.value === '' ? '' : Number(e.target.value))
                                            : setCols(e.target.value === '' ? '' : Number(e.target.value))}
                                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-white" />
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-300">
                            3. 余白（px）
                            <span className="ml-2 text-xs text-gray-500 font-normal">右プレビューを見ながら調整</span>
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            {(['top', 'bottom', 'left', 'right'] as const).map(key => (
                                <div key={key} className="space-y-1">
                                    <label className="text-xs text-gray-400">
                                        {{ top: '上', bottom: '下', left: '左', right: '右' }[key]}
                                    </label>
                                    <input type="number" min="0" value={padding[key]}
                                        onChange={e => updatePadding(key, e.target.value)}
                                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-white" />
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-gray-500">赤＝余白エリア　緑＝切り出しライン</p>
                    </div>

                    <div className="flex items-center justify-between py-1">
                        <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                            <Wand2 className="w-4 h-4 text-purple-400" />
                            AI背景削除
                            <span className="text-xs text-gray-500 font-normal">（初回約20MBダウンロード）</span>
                        </label>
                        <button onClick={() => setRemoveBg(!removeBg)}
                            className={cn('w-12 h-6 rounded-full transition-colors relative', removeBg ? 'bg-purple-600' : 'bg-zinc-700')}>
                            <span className={cn('absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform', removeBg ? 'translate-x-6' : 'translate-x-0')} />
                        </button>
                    </div>

                    <button onClick={handleSlice} disabled={!file || isProcessing}
                        className={cn('w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all',
                            !file ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                                  : 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/20 active:scale-95')}>
                        {isProcessing ? <><Loader2 className="animate-spin" /> 処理中...</> : <><ImageIcon className="w-5 h-5" /> 画像を分割</>}
                    </button>

                    {zipBlob && (
                        <button onClick={handleDownload}
                            className="w-full py-3 bg-white text-zinc-900 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-gray-100 transition-all shadow-lg">
                            <Download className="w-5 h-5" /> ZIPをダウンロード
                        </button>
                    )}
                </div>

                {/* Preview */}
                <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 min-h-[400px] flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                        <label className="text-sm font-medium text-gray-300">
                            {slices.length > 0 ? `プレビュー（${slices.length}枚）` : 'グリッドプレビュー'}
                            {slices.length > 0 && <span className="ml-2 text-xs text-gray-500 font-normal">クリックで拡大</span>}
                        </label>
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs text-gray-500">背景</span>
                            {[
                                { value: 'transparent', label: '透過', style: 'bg-[url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'8\' height=\'8\'%3E%3Crect width=\'4\' height=\'4\' fill=\'%23ccc\'/%3E%3Crect x=\'4\' y=\'4\' width=\'4\' height=\'4\' fill=\'%23ccc\'/%3E%3Crect x=\'4\' width=\'4\' height=\'4\' fill=\'%23fff\'/%3E%3Crect y=\'4\' width=\'4\' height=\'4\' fill=\'%23fff\'/%3E%3C/svg%3E")]' },
                                { value: '#ffffff', label: '白', style: 'bg-white' },
                                { value: '#888888', label: '灰', style: 'bg-gray-500' },
                                { value: '#000000', label: '黒', style: 'bg-black' },
                            ].map(opt => (
                                <button key={opt.value} title={opt.label} onClick={() => setBgColor(opt.value)}
                                    className={cn('w-6 h-6 rounded border-2 transition-all', opt.style,
                                        bgColor === opt.value ? 'border-green-400 scale-110' : 'border-zinc-600')} />
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 flex items-center justify-center rounded-xl p-4 overflow-hidden"
                        style={{ background: previewBg }}>
                        {slices.length > 0 ? (
                            <div className="grid gap-1 w-full" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
                                {slices.map((slice, idx) => (
                                    <button key={slice.id}
                                        onClick={() => setLightboxIndex(idx)}
                                        className="aspect-[370/320] relative rounded-sm overflow-hidden group cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-green-400">
                                        <img src={slice.url} alt={slice.name} className="w-full h-full object-contain" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                            <span className="text-white text-xs font-bold drop-shadow">{slice.name}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        ) : previewOriginal ? (
                            <div className="relative w-full h-full flex items-center justify-center">
                                <div className="relative inline-block">
                                    <img ref={imgRef} src={previewOriginal} alt="Original"
                                        className="max-w-full max-h-[380px] object-contain block"
                                        onLoad={drawGrid} />
                                    <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none"
                                        style={{ width: '100%', height: '100%' }} />
                                </div>
                            </div>
                        ) : (
                            <div className="text-zinc-700 flex flex-col items-center">
                                <ImageIcon className="w-12 h-12 mb-2 opacity-20" />
                                <span>画像が選択されていません</span>
                            </div>
                        )}
                    </div>

                    {slices.length > 0 && (
                        <div className="mt-3">
                            <button onClick={() => { setSlices([]); setZipBlob(null); }}
                                className="w-full py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-gray-300 rounded-lg transition-colors">
                                ← グリッドに戻る
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* ライトボックス */}
            {lightboxIndex !== null && slices[lightboxIndex] && (
                <div className="fixed inset-0 z-50 flex items-center justify-center"
                    onClick={() => setLightboxIndex(null)}>
                    {/* 背景オーバーレイ */}
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

                    {/* 画像 */}
                    <div className="relative z-10 flex flex-col items-center gap-4"
                        onClick={e => e.stopPropagation()}>
                        <div className="rounded-2xl overflow-hidden shadow-2xl"
                            style={{ background: previewBg, width: 370, height: 320 }}>
                            <img src={slices[lightboxIndex].url}
                                alt={slices[lightboxIndex].name}
                                className="w-full h-full object-contain" />
                        </div>
                        <span className="text-white/70 text-sm">
                            {slices[lightboxIndex].name}　{lightboxIndex + 1} / {slices.length}
                        </span>
                    </div>

                    {/* 前へ */}
                    <button
                        onClick={e => { e.stopPropagation(); setLightboxIndex(i => i !== null ? Math.max(i - 1, 0) : null); }}
                        disabled={lightboxIndex === 0}
                        className="absolute left-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-20 transition-all">
                        <ChevronLeft className="w-8 h-8 text-white" />
                    </button>

                    {/* 次へ */}
                    <button
                        onClick={e => { e.stopPropagation(); setLightboxIndex(i => i !== null ? Math.min(i + 1, slices.length - 1) : null); }}
                        disabled={lightboxIndex === slices.length - 1}
                        className="absolute right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-20 transition-all">
                        <ChevronRight className="w-8 h-8 text-white" />
                    </button>

                    {/* 閉じる */}
                    <button onClick={() => setLightboxIndex(null)}
                        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-all">
                        <X className="w-6 h-6 text-white" />
                    </button>
                </div>
            )}
        </div>
    );
}
