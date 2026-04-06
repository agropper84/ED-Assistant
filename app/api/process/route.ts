import { NextRequest, NextResponse } from 'next/server';
import { processEncounter, streamProcessEncounter, parseClaudeResponse, ProcessedNote } from '@/lib/claude';
import { getSheetsContext, getPatient, updatePatientFields, saveBillingRows, getStyleGuideFromSheet, upsertDiagnosisCode } from '@/lib/google-sheets';
import { getAutoBilling, BillingItem } from '@/lib/billing';
import { withApiHandler, parseBody } from '@/lib/api-handler';
import { processSchema } from '@/lib/schemas';
import type { PromptTemplates } from '@/lib/settings';

export const maxDuration = 60;

export const POST = withApiHandler(
  { rateLimit: { limit: 10, window: 60 }, auditEvent: 'generate.process' },
  async (request: NextRequest) => {
    const { rowIndex, sheetName, modifications, styleGuidance, settings, promptTemplates, stream: useStream } = await parseBody(request, processSchema);
    const ctx = await getSheetsContext();

    const patient = await getPatient(ctx, rowIndex, sheetName);
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    let existingOutput: ProcessedNote | undefined;
    if (modifications && patient.hasOutput) {
      existingOutput = {
        ddx: patient.ddx,
        investigations: patient.investigations,
        management: patient.management,
        evidence: patient.evidence,
        hpi: patient.hpi,
        objective: patient.objective,
        assessmentPlan: patient.assessmentPlan,
        diagnosis: patient.diagnosis,
        icd9: patient.icd9,
        icd10: patient.icd10,
      };
    }

    // Build style guidance server-side if not provided by client
    let effectiveStyleGuidance = styleGuidance;
    let styleExamples: Record<string, string[]> = {};
    let customGuidance = '';
    if (!effectiveStyleGuidance) {
      try {
        const guide = await getStyleGuideFromSheet(ctx);
        const hasExamples = Object.values(guide.examples).some(arr => arr.length > 0);
        if (hasExamples || guide.customGuidance || guide.extractedFeatures.length > 0) {
          styleExamples = guide.examples as Record<string, string[]>;
          customGuidance = guide.customGuidance || '';
          const parts: string[] = [];
          if (guide.customGuidance) {
            parts.push(`Charting guidance from the physician:\n${guide.customGuidance}`);
          }
          if (guide.extractedFeatures.length > 0) {
            parts.push(`Key style features: ${guide.extractedFeatures.join(', ')}`);
          }
          for (const [section, examples] of Object.entries(guide.examples)) {
            if (examples.length > 0) {
              parts.push(`${section.toUpperCase()} style examples:\n${examples.map((e: string, i: number) => `Example ${i + 1}:\n${e}`).join('\n\n')}`);
            }
          }
          effectiveStyleGuidance = parts.join('\n\n');
        }
      } catch (err) {
        console.error('Failed to load style guide from sheet:', err);
      }
    }

    const patientData = {
      name: patient.name,
      age: patient.age,
      gender: patient.gender,
      birthday: patient.birthday,
      triageVitals: patient.triageVitals,
      transcript: [patient.transcript, patient.encounterNotes].filter(Boolean).join('\n\n--- ENCOUNTER NOTES ---\n'),
      additional: patient.additional,
      pastDocs: patient.pastDocs,
    };

    const processOptions = {
      modifications,
      existingOutput,
      styleGuidance: effectiveStyleGuidance,
      styleExamples,
      customGuidance,
      settings,
      promptTemplates: promptTemplates as unknown as PromptTemplates | undefined,
    };

    // --- Streaming path ---
    if (useStream) {
      const readable = await streamProcessEncounter(patientData, processOptions, async (fullText) => {
        // Save after streaming completes
        try {
          const result = parseClaudeResponse(fullText);
          const fieldsToUpdate: Record<string, string> = {
            ddx: result.ddx,
            investigations: result.investigations,
            management: result.management,
            evidence: result.evidence,
            hpi: result.hpi,
            objective: result.objective,
            assessmentPlan: result.assessmentPlan,
            diagnosis: result.diagnosis,
            icd9: result.icd9,
            icd10: result.icd10,
          };
          await updatePatientFields(ctx, rowIndex, fieldsToUpdate, sheetName);

          if (result.diagnosis?.trim()) {
            upsertDiagnosisCode(ctx, {
              diagnosis: result.diagnosis,
              icd9: result.icd9,
              icd10: result.icd10,
            }).catch(() => {});
          }
        } catch (e) {
          console.error('Failed to save streamed result:', e);
        }
      });

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Transfer-Encoding': 'chunked',
        },
      });
    }

    // --- Non-streaming path ---
    const result = await processEncounter(patientData, processOptions);

    const fieldsToUpdate: Record<string, string> = {
      ddx: result.ddx,
      investigations: result.investigations,
      management: result.management,
      evidence: result.evidence,
      hpi: result.hpi,
      objective: result.objective,
      assessmentPlan: result.assessmentPlan,
      diagnosis: result.diagnosis,
      icd9: result.icd9,
      icd10: result.icd10,
    };

    await updatePatientFields(ctx, rowIndex, fieldsToUpdate, sheetName);

    if (result.diagnosis?.trim()) {
      upsertDiagnosisCode(ctx, {
        diagnosis: result.diagnosis,
        icd9: result.icd9,
        icd10: result.icd10,
      }).catch(err => console.error('Failed to upsert diagnosis code:', err));
    }

    // Auto-assign billing if not already set
    if (!modifications && !patient.procCode) {
      const timestamp = patient.timestamp || '';
      let isWeekend = false;
      if (sheetName) {
        try {
          const d = new Date(sheetName);
          if (!isNaN(d.getTime())) {
            const day = d.getDay();
            isWeekend = day === 0 || day === 6;
          }
        } catch {}
      }

      const autoItems = getAutoBilling(timestamp, isWeekend);
      const billingItems: BillingItem[] = [
        ...autoItems,
        { code: '1100', description: 'ED Visit', fee: '50.90', unit: '1', category: 'visitType' },
      ];

      await saveBillingRows(ctx, rowIndex, billingItems, sheetName);
    }

    return NextResponse.json({ success: true, result });
  }
);
