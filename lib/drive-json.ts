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
  StyleGuideFile, BillingCodeEntry, DiagnosisCodeEntry, ParseFormatEntry, UserPhrasesFile,
} from './types-json';
import {
  DRIVE_FOLDER_NAME, SHEETS_SUBFOLDER, MASTER_INDEX_FILE,
  STYLE_GUIDE_FILE, BILLING_CODES_FILE, DIAGNOSIS_CODES_FILE, PARSE_FORMATS_FILE, USER_PHRASES_FILE,
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

/**
 * Build a DriveContext for a specific userId (for bearer-token auth).
 * Uses refresh token stored in KV instead of session cookies.
 */
export async function getDriveContextForUser(userId: string): Promise<DriveContext> {
  const { getUserRefreshToken } = await import('./kv');
  const refreshToken = await getUserRefreshToken(userId);
  if (!refreshToken) throw new Error('No refresh token for user');

  const newCreds = await refreshAccessToken(refreshToken);
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: newCreds.access_token,
    refresh_token: refreshToken,
  });

  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  const [cachedFolderId, cachedSheetsFolderId, cachedKey] = await Promise.all([
    getUserDriveFolderId(userId),
    getUserPatientsFolderId(userId),
    getUserEncryptionKey(userId),
  ]);

  let folderId = cachedFolderId;
  if (!folderId) {
    folderId = await ensureDataFolder(drive);
    await setUserDriveFolderId(userId, folderId);
  }

  let sheetsFolderId = cachedSheetsFolderId;
  if (!sheetsFolderId) {
    sheetsFolderId = await findFileByName(drive, SHEETS_SUBFOLDER, folderId, true);
    if (!sheetsFolderId) {
      sheetsFolderId = await createFolder(drive, SHEETS_SUBFOLDER, folderId);
    }
    await setUserPatientsFolderId(userId, sheetsFolderId);
  }

  let encryptionKey: string;
  if (cachedKey && isValidEncryptionKey(cachedKey)) {
    encryptionKey = cachedKey;
  } else {
    encryptionKey = generateEncryptionKey();
    await setUserEncryptionKey(userId, encryptionKey);
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
    room: p.room,
  };
}

/** Convert Drive PatientFields back to Patient-like object */
export function fieldsToPatient(file: EDPatientFile): Patient {
  const d = file.data;
  return {
    rowIndex: file.rowIndex,
    sheetName: file.sheetName,
    ...d,
    room: d.room || '',
    hasOutput: !!(d.hpi || d.objective || d.assessmentPlan),
    status: d.hpi ? 'processed' : d.transcript ? 'pending' : 'new',
  };
}

/**
 * Find a patient in a Drive date sheet.
 * Searches by rowIndex first, then by name. Within a date sheet, name is the
 * stable identifier — rowIndex is a Sheets artifact that can drift.
 */
export async function getPatientFromDrive(
  ctx: DriveContext,
  rowIndex: number,
  sheetName: string,
  patientName?: string,
): Promise<Patient | null> {
  const dateSheet = await getDateSheetFromDrive(ctx, sheetName);
  if (!dateSheet) return null;

  const file = findPatientInSheet(dateSheet, rowIndex, patientName);
  if (!file) return null;

  return fieldsToPatient(file);
}

/**
 * Core patient lookup within a date sheet. Used by all read/write functions.
 * Returns the EDPatientFile (mutable reference into the dateSheet.patients array).
 */
function findPatientInSheet(
  dateSheet: DateSheetFile,
  rowIndex: number,
  patientName?: string,
): EDPatientFile | undefined {
  // 1. Exact rowIndex match
  let file = dateSheet.patients.find(p => Number(p.rowIndex) === Number(rowIndex));
  if (file) return file;

  // 2. Name match (stable identifier within a date sheet)
  if (patientName) {
    file = dateSheet.patients.find(p => p.data.name === patientName);
    if (file) return file;
  }

  // 3. Single patient fallback
  if (dateSheet.patients.length === 1) {
    return dateSheet.patients[0];
  }

  return undefined;
}

export async function getPatientsFromDrive(
  ctx: DriveContext,
  sheetName: string,
): Promise<Patient[]> {
  const dateSheet = await getDateSheetFromDrive(ctx, sheetName);
  if (!dateSheet) return [];

  // Auto-heal: merge any duplicate entries on read
  const hadDupes = dateSheet.patients.length;
  deduplicatePatients(dateSheet);
  if (dateSheet.patients.length < hadDupes) {
    // Save the cleaned-up data
    await saveDateSheetToDrive(ctx, dateSheet);
  }

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
  originalName?: string,
): Promise<void> {
  const dateSheet = await getOrCreateDateSheetInDrive(ctx, sheetName);

  // Deduplicate: if multiple entries share the same name, merge them first
  deduplicatePatients(dateSheet);

  // Find patient using all available identifiers
  const nameToSearch = originalName || (fields.name as string | undefined);
  let file = findPatientInSheet(dateSheet, rowIndex, nameToSearch);

  // Also try new name if original name didn't match
  if (!file && fields.name && fields.name !== nameToSearch) {
    file = findPatientInSheet(dateSheet, rowIndex, fields.name as string);
  }

  if (!file) {
    // Patient truly doesn't exist — create (only valid path for new patients)
    const name = originalName || (fields.name as string) || 'Unknown';
    console.log(`updatePatientInDrive: creating new patient (rowIndex=${rowIndex}, name=${name}, sheet=${sheetName})`);

    // Try to read full patient data from Sheets for legacy migration
    let fullData: Partial<PatientFields> = { ...fields };
    try {
      const gs = await import('./google-sheets');
      const { getSheetsContext } = await import('./google-sheets');
      const sheetsCtx = await getSheetsContext();
      const sheetsPatient = await gs.getPatient(sheetsCtx, rowIndex, sheetName);
      if (sheetsPatient) {
        const sheetsFields: Record<string, string> = {};
        for (const key of Object.keys(sheetsPatient)) {
          if (key !== 'rowIndex' && key !== 'sheetName' && key !== 'hasOutput' && key !== 'status') {
            const val = (sheetsPatient as any)[key];
            if (val) sheetsFields[key] = val;
          }
        }
        fullData = { ...sheetsFields, ...fields } as Partial<PatientFields>;
      }
    } catch (e) {
      console.warn('Could not read Sheets data for migration:', (e as Error).message);
    }

    dateSheet.patients.push({
      version: 1,
      patientId: `${name}_${Date.now()}`,
      lastModified: new Date().toISOString(),
      sheetName,
      rowIndex,
      data: fullData as PatientFields,
    });
    await saveDateSheetToDrive(ctx, dateSheet);
    return;
  }

  // Update existing patient — also fix rowIndex if it drifted
  if (Number(file.rowIndex) !== Number(rowIndex)) {
    console.log(`updatePatientInDrive: fixing rowIndex ${file.rowIndex} → ${rowIndex} for "${file.data.name}"`);
    file.rowIndex = rowIndex;
  }
  file.data = { ...file.data, ...fields };
  file.lastModified = new Date().toISOString();
  await saveDateSheetToDrive(ctx, dateSheet);
}

/**
 * Merge duplicate patient entries (same name) in a date sheet.
 * Keeps the entry with the most data, merges submissions from all copies.
 */
function deduplicatePatients(dateSheet: DateSheetFile): void {
  const byName = new Map<string, number[]>();
  for (let i = 0; i < dateSheet.patients.length; i++) {
    const name = dateSheet.patients[i].data.name;
    if (!name) continue;
    const indices = byName.get(name) || [];
    indices.push(i);
    byName.set(name, indices);
  }

  const toRemove: number[] = [];
  byName.forEach((indices, name) => {
    if (indices.length <= 1) return;
    console.warn(`deduplicatePatients: merging ${indices.length} entries for "${name}"`);

    // Pick the entry with the most data (most non-empty fields + most submissions)
    let bestIdx = indices[0];
    let bestScore = 0;
    for (const idx of indices) {
      const p = dateSheet.patients[idx];
      const fieldCount = Object.values(p.data).filter(v => v && String(v).trim()).length;
      const subCount = p.submissions?.length || 0;
      const score = fieldCount + subCount * 10; // Weight submissions heavily
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    }

    // Merge submissions and non-empty fields from all copies into the best one
    const best = dateSheet.patients[bestIdx];
    for (const idx of indices) {
      if (idx === bestIdx) continue;
      const other = dateSheet.patients[idx];

      // Merge submissions (deduplicate by id)
      if (other.submissions?.length) {
        if (!best.submissions) best.submissions = [];
        const existingIds = new Set(best.submissions.map(s => s.id));
        for (const sub of other.submissions) {
          if (!existingIds.has(sub.id)) {
            best.submissions.push(sub);
          }
        }
      }

      // Fill empty fields from the duplicate
      const bestData = best.data as unknown as Record<string, string>;
      const otherData = other.data as unknown as Record<string, string>;
      Object.keys(otherData).forEach(key => {
        if (otherData[key] && !bestData[key]) {
          bestData[key] = otherData[key];
        }
      });

      toRemove.push(idx);
    }
  });

  // Remove duplicates (reverse order to preserve indices)
  if (toRemove.length > 0) {
    for (const idx of toRemove.sort((a, b) => b - a)) {
      dateSheet.patients.splice(idx, 1);
    }
  }
}

export async function addSubmissionToDrive(
  ctx: DriveContext,
  sheetName: string,
  rowIndex: number,
  entry: import('./types-json').SubmissionEntry,
  patientName?: string,
): Promise<import('./types-json').SubmissionEntry[]> {
  const dateSheet = await getOrCreateDateSheetInDrive(ctx, sheetName);

  // Deduplicate first, then find patient
  deduplicatePatients(dateSheet);
  const patient = findPatientInSheet(dateSheet, rowIndex, patientName);

  if (!patient) {
    // Log available patients for debugging — never create duplicates here
    const available = dateSheet.patients.map(p => `"${p.data.name}"(row=${p.rowIndex})`).join(', ');
    throw new Error(
      `Cannot add submission: patient "${patientName || '?'}" not found in sheet "${sheetName}". ` +
      `Searched rowIndex=${rowIndex}. Available: [${available}]`
    );
  }

  // Fix rowIndex if it drifted
  if (Number(patient.rowIndex) !== Number(rowIndex)) {
    patient.rowIndex = rowIndex;
  }

  if (!patient.submissions) patient.submissions = [];
  patient.submissions.push(entry);

  // Build labeled content (title tells AI what the content represents)
  const labeledContent = entry.title
    ? `[${entry.title.toUpperCase()}]\n${entry.content}`
    : entry.content;

  // Append to the flat field for AI processing
  const field = entry.field as string;
  const data = patient.data as unknown as Record<string, string>;
  const existing = data[field] || '';
  data[field] = existing && labeledContent
    ? `${existing}\n\n${labeledContent}`
    : labeledContent || existing;

  patient.lastModified = new Date().toISOString();
  await saveDateSheetToDrive(ctx, dateSheet);
  return patient.submissions;
}

export async function deletePatientFromDrive(
  ctx: DriveContext,
  sheetName: string,
  rowIndex: number,
): Promise<void> {
  const dateSheet = await getDateSheetFromDrive(ctx, sheetName);
  if (!dateSheet) return;

  dateSheet.patients = dateSheet.patients.filter(p => Number(p.rowIndex) !== Number(rowIndex));
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

// ============================================================
// AUXILIARY DATA: STYLE GUIDE
// ============================================================

export async function getStyleGuideFromDrive(ctx: DriveContext): Promise<StyleGuideFile | null> {
  return readDriveFile<StyleGuideFile>(ctx, STYLE_GUIDE_FILE);
}

export async function saveStyleGuideToDrive(ctx: DriveContext, guide: StyleGuideFile): Promise<void> {
  guide.lastModified = new Date().toISOString();
  await writeDriveFile(ctx, STYLE_GUIDE_FILE, guide);
}

// ============================================================
// AUXILIARY DATA: BILLING CODES
// ============================================================

export async function getBillingCodesFromDrive(ctx: DriveContext): Promise<BillingCodeEntry[]> {
  const data = await readDriveFile<{ codes: BillingCodeEntry[] }>(ctx, BILLING_CODES_FILE);
  return data?.codes || [];
}

export async function saveBillingCodesToDrive(ctx: DriveContext, codes: BillingCodeEntry[]): Promise<void> {
  await writeDriveFile(ctx, BILLING_CODES_FILE, { version: 1, lastModified: new Date().toISOString(), codes });
}

// ============================================================
// AUXILIARY DATA: DIAGNOSIS CODES
// ============================================================

export async function getDiagnosisCodesFromDrive(ctx: DriveContext): Promise<DiagnosisCodeEntry[]> {
  const data = await readDriveFile<{ codes: DiagnosisCodeEntry[] }>(ctx, DIAGNOSIS_CODES_FILE);
  return data?.codes || [];
}

export async function saveDiagnosisCodesToDrive(ctx: DriveContext, codes: DiagnosisCodeEntry[]): Promise<void> {
  await writeDriveFile(ctx, DIAGNOSIS_CODES_FILE, { version: 1, lastModified: new Date().toISOString(), codes });
}

// ============================================================
// AUXILIARY DATA: PARSE FORMATS
// ============================================================

export async function getParseFormatsFromDrive(ctx: DriveContext): Promise<ParseFormatEntry[]> {
  const data = await readDriveFile<{ formats: ParseFormatEntry[] }>(ctx, PARSE_FORMATS_FILE);
  return data?.formats || [];
}

export async function saveParseFormatsToDrive(ctx: DriveContext, formats: ParseFormatEntry[]): Promise<void> {
  await writeDriveFile(ctx, PARSE_FORMATS_FILE, { version: 1, lastModified: new Date().toISOString(), formats });
}

// ============================================================
// AUXILIARY DATA: USER PHRASES
// ============================================================

export async function getUserPhrasesFromDrive(ctx: DriveContext): Promise<Array<{ phrase: string; count: number }>> {
  const data = await readDriveFile<UserPhrasesFile>(ctx, USER_PHRASES_FILE);
  return data?.phrases || [];
}

export async function saveUserPhrasesToDrive(ctx: DriveContext, phrases: Array<{ phrase: string; count: number }>): Promise<void> {
  await writeDriveFile(ctx, USER_PHRASES_FILE, { version: 1, lastModified: new Date().toISOString(), phrases });
}
