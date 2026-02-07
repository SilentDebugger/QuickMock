import fs from 'fs';

/**
 * Watch a file for changes and invoke `callback` on save.
 * Debounced to avoid double-fires from editors that
 * delete-then-recreate on save.
 */
export function watchFile(filePath, callback) {
  let timer = null;

  const watcher = fs.watch(filePath, (event) => {
    if (event !== 'change') return;

    if (timer) clearTimeout(timer);
    timer = setTimeout(() => callback(), 250);
  });

  watcher.on('error', () => {
    // File may have been briefly deleted during an editor save.
    // Attempt to re-attach after a short delay.
    setTimeout(() => {
      try { watchFile(filePath, callback); } catch { /* give up */ }
    }, 1000);
  });

  return watcher;
}
