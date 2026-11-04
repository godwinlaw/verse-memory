/* The browser's file seam: handing a file to the member, and reading one they
 * chose. Written like recognizer.js and device.js, a few lines over the window
 * with no logic of their own, so that backup.js, which decides what goes in
 * the file and what to make of one coming back, stays pure and tested. */

/* Offer `text` as a download named `filename`. A hidden anchor with a download
 * attribute is still the one way to do this that works everywhere the app
 * runs, including an installed copy with no file picker of its own. */
export function downloadText(filename, text, type = "application/json") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked a moment later rather than at once, since some browsers only start
  // the download after click() has returned.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* The text of a File the member picked. */
export function readFileText(file) {
  if (file && typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
