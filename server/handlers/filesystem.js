/**
 * FILESYSTEM HANDLERS
 * Safe filesystem operations
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base directory for file operations (security sandbox)
const BASE_DIR = path.resolve(__dirname, '../..');

// Ensure path is within BASE_DIR
const safePath = (inputPath) => {
  const resolved = path.resolve(BASE_DIR, inputPath);
  const relative = path.relative(BASE_DIR, resolved);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Access denied: Path outside allowed directory');
  }

  return resolved;
};

export default {
  /**
   * Read - Read file contents
   */
  fs_read: async ({ input }) => {
    const { path: filePath, encoding = 'utf8' } = input;

    try {
      const safe = safePath(filePath);
      const exists = await fs.pathExists(safe);

      if (!exists) {
        return { error: 'File not found', path: filePath };
      }

      const content = await fs.readFile(safe, encoding);
      const stats = await fs.stat(safe);

      return {
        success: true,
        path: filePath,
        content,
        size: stats.size,
        modified: stats.mtime
      };
    } catch (err) {
      return {
        error: err.message,
        path: filePath
      };
    }
  },

  /**
   * Write - Write file contents
   */
  fs_write: async ({ input }) => {
    const { path: filePath, content, encoding = 'utf8' } = input;

    try {
      const safe = safePath(filePath);
      await fs.ensureFile(safe);
      await fs.writeFile(safe, content, encoding);
      const stats = await fs.stat(safe);

      return {
        success: true,
        path: filePath,
        size: stats.size
      };
    } catch (err) {
      return {
        error: err.message,
        path: filePath
      };
    }
  },

  /**
   * List - List directory contents
   */
  fs_list: async ({ input }) => {
    const { path: dirPath = '.', recursive = false } = input;

    try {
      const safe = safePath(dirPath);
      const exists = await fs.pathExists(safe);

      if (!exists) {
        return { error: 'Directory not found', path: dirPath };
      }

      const items = await fs.readdir(safe);
      const details = await Promise.all(
        items.map(async (item) => {
          const itemPath = path.join(safe, item);
          const stats = await fs.stat(itemPath);
          return {
            name: item,
            type: stats.isDirectory() ? 'directory' : 'file',
            size: stats.size,
            modified: stats.mtime
          };
        })
      );

      return {
        success: true,
        path: dirPath,
        items: details
      };
    } catch (err) {
      return {
        error: err.message,
        path: dirPath
      };
    }
  },

  /**
   * Exists - Check if path exists
   */
  fs_exists: async ({ input }) => {
    const { path: checkPath } = input;

    try {
      const safe = safePath(checkPath);
      const exists = await fs.pathExists(safe);

      let type = null;
      if (exists) {
        const stats = await fs.stat(safe);
        type = stats.isDirectory() ? 'directory' : 'file';
      }

      return {
        exists,
        path: checkPath,
        type
      };
    } catch (err) {
      return {
        error: err.message,
        path: checkPath
      };
    }
  },

  /**
   * Delete - Delete file or directory
   */
  fs_delete: async ({ input }) => {
    const { path: deletePath } = input;

    try {
      const safe = safePath(deletePath);
      const exists = await fs.pathExists(safe);

      if (!exists) {
        return { error: 'Path not found', path: deletePath };
      }

      await fs.remove(safe);

      return {
        success: true,
        path: deletePath
      };
    } catch (err) {
      return {
        error: err.message,
        path: deletePath
      };
    }
  },

  /**
   * Copy - Copy file or directory
   */
  fs_copy: async ({ input }) => {
    const { from, to, overwrite = false } = input;

    try {
      const safeFrom = safePath(from);
      const safeTo = safePath(to);

      const exists = await fs.pathExists(safeFrom);
      if (!exists) {
        return { error: 'Source not found', from };
      }

      await fs.copy(safeFrom, safeTo, { overwrite });

      return {
        success: true,
        from,
        to
      };
    } catch (err) {
      return {
        error: err.message,
        from,
        to
      };
    }
  },

  /**
   * JSON Read - Read and parse JSON file
   */
  fs_json_read: async ({ input }) => {
    const { path: filePath } = input;

    try {
      const safe = safePath(filePath);
      const data = await fs.readJson(safe);

      return {
        success: true,
        path: filePath,
        data
      };
    } catch (err) {
      return {
        error: err.message,
        path: filePath
      };
    }
  },

  /**
   * JSON Write - Write JSON file
   */
  fs_json_write: async ({ input }) => {
    const { path: filePath, data, spaces = 2 } = input;

    try {
      const safe = safePath(filePath);
      await fs.ensureFile(safe);
      await fs.writeJson(safe, data, { spaces });

      return {
        success: true,
        path: filePath
      };
    } catch (err) {
      return {
        error: err.message,
        path: filePath
      };
    }
  }
};
