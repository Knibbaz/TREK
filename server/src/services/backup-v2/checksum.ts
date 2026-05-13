import crypto from 'crypto';
import fs from 'fs';

export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

export function sha256String(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

export function sha256Buffer(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export async function computeChecksums(
  baseDir: string,
  relativePaths: string[]
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const relPath of relativePaths) {
    const fullPath = `${baseDir}/${relPath}`;
    if (fs.existsSync(fullPath)) {
      result[relPath] = await sha256File(fullPath);
    }
  }
  return result;
}

export function verifyChecksums(
  baseDir: string,
  checksums: Record<string, string>
): { valid: boolean; mismatches: string[] } {
  const mismatches: string[] = [];
  for (const [relPath, expectedHash] of Object.entries(checksums)) {
    const fullPath = `${baseDir}/${relPath}`;
    if (!fs.existsSync(fullPath)) {
      mismatches.push(`${relPath}: file missing`);
      continue;
    }
    const actualHash = sha256String(fs.readFileSync(fullPath, 'utf8'));
    if (actualHash !== expectedHash) {
      mismatches.push(`${relPath}: checksum mismatch`);
    }
  }
  return { valid: mismatches.length === 0, mismatches };
}
