/**
 * JSON File Type Definitions for Google Drive Storage
 *
 * These types define the structure of encrypted JSON files stored in the
 * user's Google Drive as the primary database.
 */

import type { Patient } from './google-sheets';

// --- Patient File (one per patient, stored in patients/ subfolder) ---

export interface EDPatientFile {
  version: 1;
  patientId: string;        // e.g. "SMITH_12345" or rowIndex-based key
  lastModified: string;     // ISO timestamp
  sheetName: string;        // The date sheet this patient belongs to (e.g. "Mar 03, 2026")
  rowIndex: number;         // Original row index for backward compat
  data: PatientFields;      // All patient fields (flat structure matching Sheets columns)
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

// --- Constants ---

export const DRIVE_FOLDER_NAME = 'ED Assistant Data';
export const SHEETS_SUBFOLDER = 'sheets';
export const MASTER_INDEX_FILE = 'master_index.json';
