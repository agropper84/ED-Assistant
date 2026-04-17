/**
 * Zod validation schemas for all API route inputs.
 * Runtime safety for medical data — validates before processing.
 */

import { z } from 'zod';

// --- Common fields ---

const rowIndex = z.number().int().min(0);
const sheetName = z.string().min(1).max(200);

// --- /api/process ---

export const processSchema = z.object({
  rowIndex,
  sheetName,
  modifications: z.string().optional(),
  styleGuidance: z.string().optional(),
  noteStyle: z.enum(['standard', 'comprehensive', 'complete-exam']).optional(),
  noteStyleInstructions: z.string().max(5000).optional(),
  customInstructions: z.string().max(2000).optional(),
  settings: z.object({
    model: z.string().optional(),
    maxTokens: z.number().int().min(100).max(16384).optional(),
    temperature: z.number().min(0).max(1).optional(),
  }).optional(),
  promptTemplates: z.record(z.string(), z.string()).optional(),
  stream: z.boolean().optional(),
});

// --- /api/analysis ---

export const analysisSchema = z.object({
  rowIndex,
  sheetName,
  section: z.enum(['management', 'evidence', 'ddx-investigations', 'management-evidence']).optional(),
  educationMode: z.boolean().optional(),
});

// --- /api/clinical-question ---

export const clinicalQuestionSchema = z.object({
  rowIndex,
  sheetName,
  question: z.string().min(1).max(5000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
    ts: z.string().optional(),
  })).optional(),
  useOpenEvidence: z.boolean().optional(),
});

// --- /api/edit-text ---

export const editTextSchema = z.object({
  text: z.string().min(1).max(10000),
  operation: z.enum(['expand', 'shorten']),
  hint: z.string().max(2000).optional(),
  context: z.string().max(10000).optional(),
  expandInstructions: z.string().max(2000).optional(),
  shortenInstructions: z.string().max(2000).optional(),
});

// --- /api/medicalize ---

export const medicalizeSchema = z.object({
  text: z.string().max(20000),
  context: z.string().max(10000).optional(),
  mode: z.enum(['dictation', 'encounter']).optional(),
});

// --- /api/referral ---

export const referralSchema = z.object({
  rowIndex,
  sheetName,
  specialty: z.string().min(1).max(200),
  urgency: z.string().min(1).max(100),
  reason: z.string().min(1).max(2000),
  customInstructions: z.string().max(5000).optional(),
});

// --- /api/admission ---

export const admissionSchema = z.object({
  rowIndex,
  sheetName,
  service: z.string().min(1).max(200),
  reason: z.string().min(1).max(2000),
  acuity: z.string().min(1).max(100),
  customInstructions: z.string().max(5000).optional(),
});

// --- /api/synopsis ---

export const synopsisSchema = z.object({
  rowIndex,
  sheetName,
});

// --- /api/education ---

export const educationSchema = z.object({
  rowIndex,
  sheetName,
  sources: z.string().max(500).optional(),
});

// --- /api/regenerate-section ---

export const regenerateSectionSchema = z.object({
  rowIndex,
  sheetName,
  section: z.enum(['hpi', 'objective', 'assessmentPlan']),
  updates: z.string().max(5000).optional(),
});

// --- /api/icd-lookup ---

export const icdLookupSchema = z.object({
  diagnosis: z.string().min(1).max(500),
});

// --- /api/patients ---

export const patientsSchema = z.object({
  sheetName: sheetName.optional(),
  action: z.enum(['list', 'add', 'update', 'delete', 'merge']).optional(),
  rowIndex: rowIndex.optional(),
  data: z.record(z.string(), z.string()).optional(),
});

// --- /api/billing-codes ---

export const billingCodesSchema = z.object({
  query: z.string().max(200).optional(),
  region: z.string().max(50).optional(),
});

// --- /api/transcribe ---

export const transcribeSchema = z.object({
  audioUrl: z.string().url().optional(),
  language: z.string().max(10).optional(),
  prompt: z.string().max(1000).optional(),
});
