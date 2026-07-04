import path from "node:path";

const uploadPathPrefix = `uploads${path.sep}`;

export function getUploadRootDir() {
  return process.env.UPLOAD_ROOT_DIR?.trim() || path.join(process.cwd(), "uploads");
}

export function storedUploadPath(filename: string) {
  return path.join("uploads", filename);
}

export function uploadFilePath(filename: string) {
  return path.join(getUploadRootDir(), filename);
}

export function resolveStoredUploadPath(storedPath: string) {
  if (path.isAbsolute(storedPath)) {
    return storedPath;
  }

  if (storedPath === "uploads") {
    return getUploadRootDir();
  }

  if (storedPath.startsWith(uploadPathPrefix)) {
    return path.join(getUploadRootDir(), storedPath.slice(uploadPathPrefix.length));
  }

  return path.join(process.cwd(), storedPath);
}
