/**
 * Promise-based file reader utilities.
 *
 * Wraps the callback-based FileReader API into clean async functions.
 */

/**
 * Read a File as a data URL (base64-encoded string).
 * Useful for image previews and binary file uploads.
 */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Failed to read file "${file.name}" as data URL`));
    reader.readAsDataURL(file);
  });
}

/**
 * Read a File as UTF-8 text.
 * Useful for code files, config files, and other text-based content.
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Failed to read file "${file.name}" as text`));
    reader.readAsText(file);
  });
}
