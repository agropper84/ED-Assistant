/**
 * Google Drive JSON CRUD Layer
 *
 * Manages encrypted JSON files in the user's Google Drive as the primary
 * data store. All files are AES-256-GCM encrypted before upload.
 * File names are SHA-256 hashed to avoid PHI in Drive file listings.
 */

import { google, type drive_v3 } from 'googleapis';
import crypto from 'crypto';
import { Readable } from 'stream';
import { getOAuth2Client, refreshAccessToken } from './oauth';
import { getSessionFromCookies } from './session';
import {
  getUserEncryptionKey, setUserEncryptionKey,
  getUserDriveFolderId, setUserDriveFolderId,
  getUserPatientsFolderId, setUserPatientsFolderId,
} from './kv';
import { encryptValue, decryptValue, generateEncryptionKey } from './encryption';
import type {
  DriveContext, DateSheetFile, MasterIndexFile, EDPatientFile, PatientFields, ShiftTimesData,
} from './types-json';
import {
  DRIVE_FOLDER_NAME, SHEETS_SUBFOLDER, MASTER_INDEX_FILE,
} from './types-json';
import type { Patient } from './google-sheets';

// ============================================================
// CONTEXT
// ============================================================

const BUFFER_MS = 5 * 60 * 1000;

export async function getDriveContext(): Promise<DriveContext> {
  const session = await getSessionFromCookies();
  if (!session.userId || !session.approved) {
    throw new Error('Not authenticated');
  }

  // Token refresh
  if (session.tokenExpiry && Date.now() > session.tokenExpiry - BUFFER_MS) {
    const newCreds = await refreshAccessToken(session.refreshToken);
    if (!newCreds.access_token) throw new Error('Token refresh failed - please re-login');
    session.accessToken = newCreds.access_token;
    session.tokenExpiry = newCreds.expiry_date || Date.now() + 3600 * 1000;
    await session.save();
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
  });

  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  // Fetch all cached KV values in parallel
  const [cachedFolderId, cachedSheetsFolderId, cachedKey] = await Promise.all([
    getUserDriveFolderId(session.userId),
    getUserPatientsFolderId(session.userId),
    getUserEncryptionKey(session.userId),
  ]);

  // Resolve folder ID
  let folderId = cachedFolderId;
  if (!folderId) {
    folderId = await ensureDataFolder(drive);
    await setUserDriveFolderId(session.userId, folderId);
  }

  // Resolve sheets subfolder
  let sheetsFolderId = cachedSheetsFolderId;
  if (!sheetsFolderId) {
    sheetsFolderId = await findFileByName(drive, SHEETS_SUBFOLDER, folderId, true);
    if (!sheetsFolderId) {
      sheetsFolderId = await createFolder(drive, SHEETS_SUBFOLDER, folderId);
    }
    await setUserPatientsFolderId(session.userId, sheetsFolderId);
  }

  // Resolve encryption key
  let encryptionKey: string;
  if (cachedKey && isValidEncryptionKey(cachedKey)) {
    encryptionKey = cachedKey;
  } else {
    encryptionKey = generateEncryptionKey();
    await setUserEncryptionKey(session.userId, encryptionKey);
  }

  return { drive, folderId, sheetsFolderId, encryptionKey };
}

function isValidEncryptionKey(key: string): boolean {
  try {
    const buf = Buffer.from(key, 'base64');
    return buf.length === 32;
  } catch {
    return false;
  }
}

// ============================================================
// FOLDER MANAGEMENT
// ============================================================

async function ensureDataFolder(drive: drive_v3.Drive): Promise<string> {
  const existing = await findFileByName(drive, DRIVE_FOLDER_NAME, undefined, true);
  if (existing) return existing;
  return createFolder(drive, DRIVE_FOLDER_NAME);
}

async function createFolder(drive: drive_v3.Drive, name: string, parentId?: string): Promise<string> {
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    },
    fields: 'id',
  });
  return res.data.id!;
}

// ============================================================
// LOW-LEVEL FILE OPERATIONS
// ============================================================

async function findFileByName(
  drive: drive_v3.Drive,
  name: string,
  folderId?: string,
  isFolder = false,
): Promise<string | null> {
  const mimeClause = isFolder
    ? "and mimeType = 'application/vnd.google-apps.folder'"
    : "and mimeType != 'application/vnd.google-apps.folder'";
  const parentClause = folderId ? `and '${folderId}' in parents` : '';

  const res = await drive.files.list({
    q: `name = '${name}' ${parentClause} ${mimeClause} and trashed = false`,
    fields: 'files(id)',
    pageSize: 1,
  });

  return res.data.files?.[0]?.id || null;
}

/**
 * Read a JSON file from Drive, decrypt, and parse.
 */
export async function readDriveFile<T>(
  ctx: DriveContext,
  fileName: string,
  parentFolderId?: string,
): Promise<T | null> {
  const fid = parentFolderId || ctx.folderId;
  const fileId = await findFileByName(ctx.drive, fileName, fid);
  if (!fileId) return null;

  const res = await ctx.drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'text' },
  );

  const raw = res.data as string;
  if (!raw || raw.trim() === '') return null;

  const decrypted = decryptValue(raw, ctx.encryptionKey);
  return JSON.parse(decrypted) as T;
}

/**
 * Write a JSON file to Drive — encrypt, then create or update.
 */
export async function writeDriveFile(
  ctx: DriveContext,
  fileName: string,
  data: unknown,
  parentFolderId?: string,
): Promise<string> {
  const fid = parentFolderId || ctx.folderId;
  const json = JSON.stringify(data, null, 0);
  const encrypted = encryptValue(json, ctx.encryptionKey);

  const existingId = await findFileByName(ctx.drive, fileName, fid);

  if (existingId) {
    await ctx.drive.files.update({
      fileId: existingId,
      media: {
        mimeType: 'application/json',
        body: Readable.from([encrypted]),
      },
    });
    return existingId;
  }

  const res = await ctx.drive.files.create({
    requestBody: {
      name: fileName,
      mimeType: 'application/json',
      parents: [fid],
    },
    media: {
      mimeType: 'application/json',
      body: Readable.from([encrypted]),
    },
    fields: 'id',
  });
  return res.data.id!;
}

export async function deleteDriveFile(
  ctx: DriveContext,
  fileName: string,
  parentFolderId?: string,
): Promise<void> {
  const fid = parentFolderId || ctx.folderId;
  const fileId = await findFileByName(ctx.drive, fileName, fid);
  if (fileId) {
    await ctx.drive.files.delete({ fileId });
  }
}

// ============================================================
// FILENAME HASHING (no PHI in file names)
// ============================================================

export function hashSheetName(sheetName: string): string {
  return crypto.createHash('sha256').update(sheetName).digest('hex').substring(0, 16);
}

function sheetFileName(sheetName: string): string {
  return `${hashSheetName(sheetName)}.json`;
}

// ============================================================
// HIGH-LEVEL: MASTER INDEX
// ============================================================

export async function getMasterIndex(ctx: DriveContext): Promise<MasterIndexFile | null> {
  return readDriveFile<MasterIndexFile>(ctx, MASTER_INDEX_FILE);
}

export async function saveMasterIndex(ctx: DriveContext, data: MasterIndexFile): Promise<void> {
  data.lastModified = new Date().toISOString();
  await writeDriveFile(ctx, MASTER_INDEX_FILE, data);
}

function emptyMasterIndex(): MasterIndexFile {
  return {
    version: 1,
    lastModified: new Date().toISOString(),
    sheets: [],
    fileMap: {},
  };
}

// ============================================================
// HIGH-LEVEL: DATE SHEET CRUD
// ============================================================

export async function getDateSheetFromDrive(
  ctx: DriveContext,
  sheetName: string,
): Promise<DateSheetFile | null> {
  return readDriveFile<DateSheetFile>(ctx, sheetFileName(sheetName), ctx.sheetsFolderId);
}

export async function saveDateSheetToDrive(
  ctx: DriveContext,
  data: DateSheetFile,
): Promise<void> {
  data.lastModified = new Date().toISOString();
  await writeDriveFile(ctx, sheetFileName(data.sheetName), data, ctx.sheetsFolderId);
}

function emptyDateSheet(sheetName: string): DateSheetFile {
  return {
    version: 1,
    sheetName,
    lastModified: new Date().toISOString(),
    patients: [],
  };
}

export async function getOrCreateDateSheetInDrive(
  ctx: DriveContext,
  sheetName: string,
): Promise<DateSheetFile> {
  const existing = await getDateSheetFromDrive(ctx, sheetName);
  if (existing) return existing;

  const newSheet = emptyDateSheet(sheetName);
  await saveDateSheetToDrive(ctx, newSheet);

  // Update master index
  let index = await getMasterIndex(ctx) || emptyMasterIndex();
  if (!index.sheets.includes(sheetName)) {
    index.sheets.push(sheetName);
    index.fileMap[hashSheetName(sheetName)] = sheetName;
    await saveMasterIndex(ctx, index);
  }

  return newSheet;
}

// ============================================================
// HIGH-LEVEL: PATIENT CRUD
// ============================================================

/** Convert flat Patient (from Sheets) to PatientFields for Drive storage */
export function patientToFields(p: Patient): PatientFields {
  return {
    patientNum: p.patientNum,
    timestamp: p.timestamp,
    name: p.name,
    age: p.age,
    gender: p.gender,
    birthday: p.birthday,
    hcn: p.hcn,
    mrn: p.mrn,
    diagnosis: p.diagnosis,
    icd9: p.icd9,
    icd10: p.icd10,
    visitProcedure: p.visitProcedure,
    procCode: p.procCode,
    fee: p.fee,
    unit: p.unit,
    total: p.total,
    comments: p.comments,
    triageVitals: p.triageVitals,
    transcript: p.transcript,
    additional: p.additional,
    ddx: p.ddx,
    investigations: p.investigations,
    hpi: p.hpi,
    objective: p.objective,
    assessmentPlan: p.assessmentPlan,
    referral: p.referral,
    pastDocs: p.pastDocs,
    synopsis: p.synopsis,
    management: p.management,
    evidence: p.evidence,
    apNotes: p.apNotes,
    clinicalQA: p.clinicalQA,
    education: p.education,
    encounterNotes: p.encounterNotes,
    admission: p.admission,
    profile: p.profile,
  };
}

/** Convert Drive PatientFields back to Patient-like object */
export function fieldsToPatient(file: EDPatientFile): Patient {
  const d = file.data;
  return {
    rowIndex: file.rowIndex,
    sheetName: file.sheetName,
    ...d,
    hasOutput: !!(d.hpi || d.objective || d.assessmentPlan),
    status: d.hpi ? 'processed' : d.transcript ? 'pending' : 'new',
  };
}

export async function getPatientFromDrive(
  ctx: DriveContext,
  rowIndex: number,
  sheetName: string,
): Promise<Patient | null> {
  const dateSheet = await getDateSheetFromDrive(ctx, sheetName);
  if (!dateSheet) return null;

  const patientFile = dateSheet.patients.find(p => p.rowIndex === rowIndex);
  if (!patientFile) return null;

  return fieldsToPatient(patientFile);
}

export async function getPatientsFromDrive(
  ctx: DriveContext,
  sheetName: string,
): Promise<Patient[]> {
  const dateSheet = await getDateSheetFromDrive(ctx, sheetName);
  if (!dateSheet) return [];
  return dateSheet.patients.map(fieldsToPatient);
}

export async function addPatientToDrive(
  ctx: DriveContext,
  sheetName: string,
  patient: Patient,
): Promise<void> {
  const dateSheet = await getOrCreateDateSheetInDrive(ctx, sheetName);

  dateSheet.patients.push({
    version: 1,
    patientId: `${patient.name || 'patient'}_${patient.mrn || Date.now()}`,
    lastModified: new Date().toISOString(),
    sheetName,
    rowIndex: patient.rowIndex,
    data: patientToFields(patient),
  });

  await saveDateSheetToDrive(ctx, dateSheet);
}

export async function updatePatientInDrive(
  ctx: DriveContext,
  sheetName: string,
  rowIndex: number,
  fields: Partial<PatientFields>,
): Promise<void> {
  const dateSheet = await getDateSheetFromDrive(ctx, sheetName);
  if (!dateSheet) return;

  const idx = dateSheet.patients.findIndex(p => p.rowIndex === rowIndex);
  if (idx === -1) return;

  dateSheet.patients[idx].data = { ...dateSheet.patients[idx].data, ...fields };
  dateSheet.patients[idx].lastModified = new Date().toISOString();
  await saveDateSheetToDrive(ctx, dateSheet);
}

export async function deletePatientFromDrive(
  ctx: DriveContext,
  sheetName: string,
  rowIndex: number,
): Promise<void> {
  const dateSheet = await getDateSheetFromDrive(ctx, sheetName);
  if (!dateSheet) return;

  dateSheet.patients = dateSheet.patients.filter(p => p.rowIndex !== rowIndex);
  await saveDateSheetToDrive(ctx, dateSheet);
}

// ============================================================
// HIGH-LEVEL: DATE SHEETS LIST
// ============================================================

export async function getDateSheetsFromDrive(ctx: DriveContext): Promise<string[]> {
  const index = await getMasterIndex(ctx);
  if (!index) return [];
  // Sort most recent first
  return [...index.sheets].sort().reverse();
}

// ============================================================
// HIGH-LEVEL: SHIFT TIMES
// ============================================================

export async function getShiftTimesFromDrive(
  ctx: DriveContext,
  sheetName: string,
): Promise<ShiftTimesData | null> {
  const dateSheet = await getDateSheetFromDrive(ctx, sheetName);
  return dateSheet?.shiftTimes || null;
}

export async function setShiftTimesInDrive(
  ctx: DriveContext,
  sheetName: string,
  times: ShiftTimesData,
): Promise<void> {
  const dateSheet = await getOrCreateDateSheetInDrive(ctx, sheetName);
  dateSheet.shiftTimes = times;
  await saveDateSheetToDrive(ctx, dateSheet);
}
