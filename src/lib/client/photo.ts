/**
 * Prepares a meal photo on the phone: shrinks it to at most 1280 px (sharp
 * enough to read labels, ~150–400 KB as JPEG) and looks for a barcode in it
 * with the browser's built-in detector, when the browser has one.
 */
export interface PreparedPhoto {
  data: string; // base64, no data: prefix
  mediaType: "image/jpeg";
  previewUrl: string;
  barcodes: string[];
}

const MAX_SIDE = 1280;

interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource): Promise<{ rawValue: string }[]>;
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);

  let barcodes: string[] = [];
  const Detector = (globalThis as { BarcodeDetector?: new (o: { formats: string[] }) => BarcodeDetectorLike }).BarcodeDetector;
  if (Detector) {
    try {
      const found = await new Detector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] }).detect(bitmap);
      barcodes = [...new Set(found.map((b) => b.rawValue).filter((v) => /^\d{8,14}$/.test(v)))].slice(0, 3);
    } catch {
      // No barcode support on this device; the photo still works without it.
    }
  }
  bitmap.close();

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.82),
  );
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { data: btoa(bin), mediaType: "image/jpeg", previewUrl: URL.createObjectURL(blob), barcodes };
}
