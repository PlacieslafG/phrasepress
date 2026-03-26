import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, copyFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { Readable } from 'node:stream'
import type { BackupSettings } from './types.js'

// ─── Local ────────────────────────────────────────────────────────────────────

export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true })
}

export async function saveLocally(
  tmpZipPath: string,
  destDir:    string,
  filename:   string,
): Promise<string> {
  await ensureDir(destDir)
  const destPath = join(destDir, filename)
  await copyFile(tmpZipPath, destPath)
  return destPath
}

export async function deleteFile(filePath: string): Promise<void> {
  try {
    await rm(filePath, { force: true })
  } catch { /* best-effort */ }
}

export async function getFileSize(filePath: string): Promise<number> {
  try {
    const s = await stat(filePath)
    return s.size
  } catch {
    return 0
  }
}

// ─── S3 ───────────────────────────────────────────────────────────────────────

function buildS3Config(settings: BackupSettings) {
  return {
    region: settings.s3Region || 'us-east-1',
    credentials: {
      accessKeyId:     settings.s3AccessKey,
      secretAccessKey: settings.s3SecretKey,
    },
    ...(settings.s3Endpoint
      ? { endpoint: settings.s3Endpoint, forcePathStyle: true }
      : {}),
  }
}

export async function uploadToS3(
  settings:  BackupSettings,
  localPath: string,
  filename:  string,
): Promise<string> {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3')
  const s3      = new S3Client(buildS3Config(settings))
  const key     = `backups/${filename}`
  const { size } = await stat(localPath)

  await s3.send(new PutObjectCommand({
    Bucket:        settings.s3Bucket,
    Key:           key,
    Body:          createReadStream(localPath),
    ContentLength: size,
    ContentType:   'application/zip',
  }))

  return key
}

export async function downloadFromS3(
  settings: BackupSettings,
  s3Key:    string,
  destPath: string,
): Promise<void> {
  const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3')
  const s3  = new S3Client(buildS3Config(settings))
  const res = await s3.send(new GetObjectCommand({
    Bucket: settings.s3Bucket,
    Key:    s3Key,
  }))

  if (!res.Body) throw new Error('Empty S3 response body')

  const dest = createWriteStream(destPath)
  await pipeline(res.Body as Readable, dest)
}

export async function deleteFromS3(
  settings: BackupSettings,
  s3Key:    string,
): Promise<void> {
  const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3')
  const s3 = new S3Client(buildS3Config(settings))
  await s3.send(new DeleteObjectCommand({
    Bucket: settings.s3Bucket,
    Key:    s3Key,
  }))
}
