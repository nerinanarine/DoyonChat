const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_DIMENSION = 2048; // px
const JPEG_QUALITY = 0.85;

/**
 * Validates an image file for type and size.
 * Returns error message string or null if valid.
 */
export function validateImageFile(file: File): string | null {
  if (!file.type.startsWith('image/')) {
    return '画像ファイル（PNG, JPEG, GIF, WebP）のみアップロード可能です';
  }
  if (file.size > MAX_FILE_SIZE) {
    return '画像サイズは5MB以下にしてください';
  }
  return null;
}

/**
 * Reads a File as a Base64 data URL.
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
    reader.readAsDataURL(file);
  });
}

/**
 * Resizes an image (given as Base64 data URL) if it exceeds maxDimension.
 * Returns a JPEG Base64 data URL at reduced size.
 */
export function resizeImageIfNeeded(
  dataUrl: string,
  maxDimension: number = MAX_DIMENSION,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width <= maxDimension && height <= maxDimension) {
        resolve(dataUrl); // no resize needed
        return;
      }
      // Scale down maintaining aspect ratio
      if (width > height) {
        height = Math.round((height / width) * maxDimension);
        width = maxDimension;
      } else {
        width = Math.round((width / height) * maxDimension);
        height = maxDimension;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas not supported'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
    };
    img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
    img.src = dataUrl;
  });
}
