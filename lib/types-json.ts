/**
 * JSON File Type Definitions for Google Drive Storage
 *
 * These types define the structure of encrypted JSON files stored in the
 * user's Google Drive as the primary database.
 */

import type { Patient } from './google-sheets';

// --- Submission Entry (per-section clinical data submissions) ---

export interface SubmissionEntry {
  id: string;
  field: string;            // 'triageVitals' | 'transcript' | 'encounterNotes' | 'additional' | 'pastDocs'
  content: string;
  submittedAt: string;      // ISO timestamp
  title?: string;           // Optional user-provided title
  date?: string;            // Optional user-provided date (e.g. "2026-04-13")
}

// --- Patient File (one per patient, stored in patients/ subfolder) ---

export interface EDPatientFile {
  version: 1;
  patientId: string;        // e.g. "SMITH_12345" or rowIndex-based key
  lastModified: string;     // ISO timestamp
  sheetName: string;        // The date sheet this patient belongs to (e.g. "Mar 03, 2026")
  rowIndex: number;         // Original row index for backward compat
  data: PatientFields;      // All patient fields (flat structure matching Sheets columns)
  submissions?: SubmissionEntry[]; // Per-section submission history
}

/** All patient data fields — matches the COLUMNS in google-sheets.ts */
export interface PatientFields {
  patientNum: string;
  timestamp: string;
  name: string;
  age: string;
  gender: string;
  birthday: string;
  hcn: string;
  mrn: string;
  diagnosis: string;
  icd9: string;
  icd10: string;
  visitProcedure: string;
  procCode: string;
  fee: string;
  unit: string;
  total: string;
  comments: string;
  triageVitals: string;
  transcript: string;
  additional: string;
  ddx: string;
  investigations: string;
  hpi: string;
  objective: string;
  assessmentPlan: string;
  referral: string;
  pastDocs: string;
  synopsis: string;
  management: string;
  evidence: string;
  apNotes: string;
  clinicalQA: string;
  education: string;
  encounterNotes: string;
  admission: string;
  profile: string;
}

// --- Date Sheet File (one per date/shift, contains all patients for that date) ---

export interface DateSheetFile {
  version: 1;
  sheetName: string;        // e.g. "Mar 03, 2026"
  lastModified: string;
  shiftTimes?: ShiftTimesData;
  patients: EDPatientFile[];
}

export interface ShiftTimesData {
  start: string;
  end: string;
  hours: string;
  feeType: string;
  code: string;
  fee: string;
  total: string;
}

// --- Master Index (list of all date sheets) ---

export interface MasterIndexFile {
  version: 1;
  lastModified: string;
  sheets: string[];          // List of date sheet names
  fileMap: Record<string, string>; // { hashedName: sheetName }
}

// --- Drive Context ---

export interface DriveContext {
  drive: import('googleapis').drive_v3.Drive;
  folderId: string;          // Drive folder ID for "ED Assistant Data"
  sheetsFolderId: string;    // Drive folder ID for sheets/ subfolder
  encryptionKey: string;     // Always required — mandatory encryption
}

// --- Data Layer Context ---

export type StorageMode = 'sheets' | 'dual' | 'drive';

export interface DataContext {
  drive?: DriveContext;
  sheets: import('./google-sheets').SheetsContext;
  mode: StorageMode;
}

// --- ID Generation ---

let _idCounter = 0;

export function generateId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 6);
  return `${prefix}_${ts}_${rand}_${++_idCounter}`;
}

// --- Auxiliary Data Files (stored as encrypted JSON in Drive root) ---

export interface StyleGuideFile {
  version: 1;
  lastModified: string;
  examples: {
    hpi: string[];
    objective: string[];
    assessmentPlan: string[];
    referral: string[];
    admission: string[];
  };
  extractedFeatures: string[];
  customGuidance: string;
}

export interface BillingCodeEntry {
  code: string;
  description: string;
  fee: string;
  group: string;
}

export interface DiagnosisCodeEntry {
  diagnosis: string;
  icd9: string;
  icd10: string;
  count: number;
}

export interface ParseFormatEntry {
  name: string;
  sampleText: string;
  fieldName: string;
  fieldAge: string;
  fieldGender: string;
  fieldDob: string;
  fieldMrn: string;
  fieldHcn: string;
  ageDobPattern: string;
  hcnPattern: string;
  mrnPattern: string;
  nameCleanup: string;
}

export interface UserPhrasesFile {
  version: 1;
  lastModified: string;
  phrases: Array<{ phrase: string; count: number }>;
}

// --- Constants ---

export const DRIVE_FOLDER_NAME = 'ED Assistant Data';
export const SHEETS_SUBFOLDER = 'sheets';
export const STYLE_GUIDE_FILE = 'style_guide.json';
export const BILLING_CODES_FILE = 'billing_codes.json';
export const DIAGNOSIS_CODES_FILE = 'diagnosis_codes.json';
export const PARSE_FORMATS_FILE = 'parse_formats.json';
export const USER_PHRASES_FILE = 'user_phrases.json';
export const MASTER_INDEX_FILE = 'master_index.json';
