'use client';

import { useState, useCallback } from 'react';
// import { useDropzone } from 'react-dropzone'; // Removed
import { Upload, Download, Loader2, Image as ImageIcon } from 'lucide-react';
import { saveAs } from 'file-saver';
import { processImage, SliceResult } from '@/lib/slicer';
import { cn } from '@/lib/utils';

export function SlicerApp() {
    const [file, setFile] = useState<File | null>(null);
    const [previewOriginal, setPreviewOriginal] = useState<string | null>(null);
    const [rows, setRows] = useState<number | ''>(4);
    const [cols, setCols] = useState<number | ''>(4);
    const [isProcessing, setIsProcessing] = useState(false);
    const [slices, setSlices] = useState<SliceResult[]>([]);
    const [zipBlob, setZipBlob] = useState<Blob | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];
            setFile(selectedFile);
            setPreviewOriginal(URL.createObjectURL(selectedFile));
            setSlices([]);
            setZipBlob(null);
        }
    };

    const handleSlice = async () => {
        if (!file) return;

        setIsProcessing(true);
        try {
            // Small timeout to let UI update
            await new Promise(r => setTimeout(r, 100));

            const r = Number(rows) || 4;
            const c = Number(cols) || 4;

            const result = await processImage(file, r, c);
            setSlices(result.slices);
            setZipBlob(result.zipBlob);

            // Auto download? Maybe optional. user can click button.
        } catch (error) {
            console.error(error);
            alert('Error processing image');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDownload = () => {
        if (zipBlob && file) {
            const name = file.name.replace(/\.[^/.]+$/, "");
            saveAs(zipBlob, `${name}_stickers.zip`);
        }
    };

    return (
        <div className="w-full max-w-4xl mx-auto p-6 space-y-8">
            {/* Header */}
            <div className="text-center space-y-2">
                <h1 className="text-4xl font-bold bg-gradient-to-r from-green-500 to-emerald-700 bg-clip-text text-transparent">
                    Sticker Slicer
                </h1>
                <p className="text-gray-400">
                    Private, fast, and client-side LINE sticker generation.
                </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
                {/* Controls */}
                <div className="space-y-6 bg-zinc-900 p-6 rounded-2xl border border-zinc-800 relative z-20">
                    <div className="space-y-4">
                        <label className="block text-sm font-medium text-gray-300">
                            1. Upload Image
                        </label>
                        <div className="relative group isolate">
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleFileChange}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            />
                            <div className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-zinc-700 rounded-xl bg-zinc-900/50 group-hover:border-green-500/50 transition-colors">
                                <Upload className="w-8 h-8 text-gray-500 mb-2 group-hover:text-green-500" />
                                <span className="text-sm text-gray-500 group-hover:text-gray-300">
                                    {file ? file.name : "Click or Drag image here"}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 relative z-20">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-300">Rows</label>
                            <input
                                type="number"
                                min="1"
                                max="10"
                                value={rows}
                                onChange={e => {
                                    const val = e.target.value;
                                    setRows(val === '' ? '' : Number(val));
                                }}
                                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 relative z-30 text-white"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-300">Cols</label>
                            <input
                                type="number"
                                min="1"
                                max="10"
                                value={cols}
                                onChange={e => {
                                    const val = e.target.value;
                                    setCols(val === '' ? '' : Number(val));
                                }}
                                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 relative z-30 text-white"
                            />
                        </div>
                    </div>

                    <button
                        onClick={handleSlice}
                        disabled={!file || isProcessing}
                        className={cn(
                            "w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all relative z-20",
                            !file
                                ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                                : "bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/20 active:scale-95"
                        )}
                    >
                        {isProcessing ? (
                            <>
                                <Loader2 className="animate-spin" /> Processing...
                            </>
                        ) : (
                            <>
                                <ImageIcon className="w-5 h-5" /> Slice Image
                            </>
                        )}
                    </button>

                    {zipBlob && (
                        <button
                            onClick={handleDownload}
                            className="w-full py-3 bg-white text-zinc-900 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-gray-100 transition-all shadow-lg relative z-20"
                        >
                            <Download className="w-5 h-5" /> Download ZIP
                        </button>
                    )}
                </div>

                {/* Preview */}
                <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 min-h-[400px] flex flex-col">
                    <label className="block text-sm font-medium text-gray-300 mb-4">
                        Preview
                    </label>

                    <div className="flex-1 flex items-center justify-center bg-zinc-950/50 rounded-xl p-4 overflow-hidden">
                        {slices.length > 0 ? (
                            <div
                                className="grid gap-1"
                                style={{
                                    gridTemplateColumns: `repeat(${cols}, 1fr)`
                                }}
                            >
                                {slices.map((slice) => (
                                    <div key={slice.id} className="aspect-[370/320] relative bg-zinc-800 rounded-sm overflow-hidden group">
                                        <img
                                            src={slice.url}
                                            alt={slice.name}
                                            className="w-full h-full object-contain"
                                        />
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs text-white pointer-events-none transition-opacity">
                                            {slice.name}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : previewOriginal ? (
                            <div className="relative">
                                <img
                                    src={previewOriginal}
                                    alt="Original"
                                    className="max-w-full max-h-[300px] object-contain opacity-50"
                                />
                                <div className="absolute inset-0 flex items-center justify-center text-zinc-500 font-medium">
                                    Preview will appear here
                                </div>
                            </div>
                        ) : (
                            <div className="text-zinc-700 flex flex-col items-center">
                                <ImageIcon className="w-12 h-12 mb-2 opacity-20" />
                                <span>No image selected</span>
                            </div>
                        )}
                    </div>
                    {slices.length > 0 && (
                        <div className="mt-4 text-center text-xs text-gray-500">
                            Generated {slices.length} stickers ({rows} x {cols})
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
