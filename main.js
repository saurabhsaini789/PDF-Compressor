import { PDFDocument, PDFName, PDFDict, PDFStream } from 'pdf-lib';
import './style.css';

// DOM Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const uploadSection = document.getElementById('upload-section');
const optionsSection = document.getElementById('options-section');
const resultSection = document.getElementById('result-section');
const fileNameDisplay = document.getElementById('file-name');
const fileSizeDisplay = document.getElementById('file-size');
const compressBtn = document.getElementById('compress-btn');
const resetBtn = document.getElementById('reset-btn');
const loader = document.getElementById('loader');
const downloadBtn = document.getElementById('download-btn');
const againBtn = document.getElementById('again-btn');

const originalSizeRes = document.getElementById('original-size-res');
const newSizeRes = document.getElementById('new-size-res');
const savingPercentage = document.getElementById('saving-percentage');

let currentFile = null;
let compressedPdfBytes = null;

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    registerServiceWorker();
});

function initEventListeners() {
    // File Selection
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);

    // Drag and Drop
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    // Actions
    compressBtn.addEventListener('click', compressPDF);
    resetBtn.addEventListener('click', resetApp);
    againBtn.addEventListener('click', resetApp);
    downloadBtn.addEventListener('click', downloadCompressedPDF);
}

function handleFileSelect(e) {
    if (e.target.files.length) {
        handleFile(e.target.files[0]);
    }
}

function handleFile(file) {
    if (file.type !== 'application/pdf') {
        alert('Please select a valid PDF file.');
        return;
    }
    currentFile = file;
    fileNameDisplay.textContent = file.name;
    fileSizeDisplay.textContent = formatBytes(file.size);
    
    showSection('options');
}

async function compressPDF() {
    if (!currentFile) return;

    const level = document.querySelector('input[name="compression"]:checked').value;
    showLoader(true);

    try {
        const arrayBuffer = await currentFile.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        
        if (level === 'high') {
            // Atomic Squeeze: Global purge of images and metadata
            const indirectObjects = pdfDoc.context.enumerateIndirectObjects();
            
            for (const [ref, object] of indirectObjects) {
                if (object instanceof PDFStream) {
                    const subtype = object.dict.get(PDFName.of('Subtype'));
                    if (subtype === PDFName.of('Image')) {
                        pdfDoc.context.delete(ref);
                    }
                }
            }

            const catalog = pdfDoc.catalog;
            catalog.delete(PDFName.of('Metadata'));
            catalog.delete(PDFName.of('PieceInfo'));
            catalog.delete(PDFName.of('OutputIntents'));
            
            compressedPdfBytes = await pdfDoc.save({ useObjectStreams: true });
        } else if (level === 'ultimate') {
            // Ultimate Squeeze: Extract text and build a brand new PDF
            const newPdf = await PDFDocument.create();
            const font = await newPdf.embedFont('Helvetica');
            const fontSize = 11;
            const margin = 50;
            const { width, height } = { width: 595.28, height: 841.89 }; // A4
            
            // Load PDF.js from CDN for text extraction
            const pdfjsLib = window['pdfjs-dist/build/pdf'];
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;
            
            let currentPage = newPdf.addPage([width, height]);
            let y = height - margin;
            
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const textItems = textContent.items.map(item => item.str).join(' ');
                
                // Simple word wrapping and layout
                const words = textItems.split(/\s+/);
                let line = '';
                
                for (const word of words) {
                    const testLine = line + word + ' ';
                    const testWidth = font.widthOfTextAtSize(testLine, fontSize);
                    
                    if (testWidth > width - margin * 2 && line.length > 0) {
                        currentPage.drawText(line, { x: margin, y, size: fontSize, font });
                        line = word + ' ';
                        y -= fontSize * 1.4;
                        
                        if (y < margin) {
                            currentPage = newPdf.addPage([width, height]);
                            y = height - margin;
                        }
                    } else {
                        line = testLine;
                    }
                }
                if (line) {
                    currentPage.drawText(line, { x: margin, y, size: fontSize, font });
                    y -= fontSize * 1.4;
                }
                
                // Add a small gap between pages
                y -= fontSize;
                if (y < margin) {
                    currentPage = newPdf.addPage([width, height]);
                    y = height - margin;
                }
            }
            
            compressedPdfBytes = await newPdf.save();
        } else {
            // Light/Standard
            compressedPdfBytes = await pdfDoc.save({ useObjectStreams: true });
        }

        // UI Update
        const originalSize = currentFile.size;
        const newSize = compressedPdfBytes.length;
        
        originalSizeRes.textContent = formatBytes(originalSize);
        newSizeRes.textContent = formatBytes(newSize);
        
        const savings = Math.max(0, Math.round(((originalSize - newSize) / originalSize) * 100));
        savingPercentage.textContent = `${savings}%`;

        showSection('result');
    } catch (error) {
        console.error('Compression error:', error);
        alert('An error occurred while compressing the PDF.');
    } finally {
        showLoader(false);
    }
}

function downloadCompressedPDF() {
    if (!compressedPdfBytes) return;
    
    const blob = new Blob([compressedPdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `squeezed_${currentFile.name}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function showSection(section) {
    [uploadSection, optionsSection, resultSection].forEach(s => s.classList.remove('active'));
    
    if (section === 'upload') uploadSection.classList.add('active');
    if (section === 'options') optionsSection.classList.add('active');
    if (section === 'result') resultSection.classList.add('active');
}

function showLoader(show) {
    loader.style.display = show ? 'flex' : 'none';
}

function resetApp() {
    currentFile = null;
    compressedPdfBytes = null;
    fileInput.value = '';
    showSection('upload');
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').then(registration => {
                console.log('SW registered: ', registration);
            }).catch(registrationError => {
                console.log('SW registration failed: ', registrationError);
            });
        });
    }
}
