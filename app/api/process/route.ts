import { NextRequest, NextResponse } from 'next/server';
import { processEncounter, streamProcessEncounter, parseClaudeResponse, ProcessedNote } from '@/lib/claude';
import { getDataContext, getPatient, updatePatientFields } from '@/lib/data-layer';
import { saveBillingRows, getStyleGuideFromSheet, upsertDiagnosisCode, getBillingConfig } from '@/lib/google-sheets';
import { getSmartBilling } from '@/lib/billing';
import { withApiHandler, parseBody } from '@/lib/api-handler';
import { processSchema } from '@/lib/schemas';
import type { PromptTemplates } from '@/lib/settings';

export const maxDuration = 60;

export const POST = withApiHandler(
  { rateLimit: { limit: 10, window: 60 }, auditEvent: 'generate.process' },
  async (request: NextRequest) => {
    const { rowIndex, sheetName, modifications, styleGuidance, settings, promptTemplates, stream: useStream, noteStyle, noteStyleInstructions, customInstructions } = await parseBody(request, processSchema);
    const ctx = await getDataContext();

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
        const guide = await getStyleGuideFromSheet(ctx.sheets);
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

    // Core-only mode: skip DDX/investigations/management/evidence to save cost
    // Only generate those when explicitly requested via individual icon buttons
    const coreOnly = !modifications;

    const processOptions = {
      modifications,
      existingOutput,
      styleGuidance: effectiveStyleGuidance,
      styleExamples,
      customGuidance,
      settings,
      promptTemplates: promptTemplates as unknown as PromptTemplates | undefined,
      noteStyle: noteStyle as 'standard' | 'comprehensive' | 'complete-exam' | undefined,
      noteStyleInstructions,
      customInstructions,
      coreOnly,
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
            upsertDiagnosisCode(ctx.sheets, {
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
      hpi: result.hpi,
      objective: result.objective,
      assessmentPlan: result.assessmentPlan,
      diagnosis: result.diagnosis,
      icd9: result.icd9,
      icd10: result.icd10,
      ...(coreOnly ? {} : {
        ddx: result.ddx,
        investigations: result.investigations,
        management: result.management,
        evidence: result.evidence,
      }),
    };

    await updatePatientFields(ctx, rowIndex, fieldsToUpdate, sheetName);

    if (result.diagnosis?.trim()) {
      upsertDiagnosisCode(ctx.sheets, {
        diagnosis: result.diagnosis,
        icd9: result.icd9,
        icd10: result.icd10,
      }).catch(err => console.error('Failed to upsert diagnosis code:', err));
    }

    // Auto-assign smart billing (Yukon only) if not already set
    if (!modifications && !patient.procCode) {
      try {
        const billingConfig = await getBillingConfig(ctx.sheets);
        const region = billingConfig.billingRegion || 'yukon';

        if (region === 'yukon') {
          const timestamp = patient.timestamp || '';
          let isWeekend = false;
          if (sheetName) {
            try {
              const d = new Date(sheetName);
              if (!isNaN(d.getTime())) {
                isWeekend = d.getDay() === 0 || d.getDay() === 6;
              }
            } catch {}
          }

          const billingItems = getSmartBilling(result, timestamp, isWeekend, noteStyle === 'complete-exam');

          // Write billing to Drive JSON (source of truth)
          const { serializeBillingItems } = await import('@/lib/billing');
          const serialized = serializeBillingItems(billingItems);
          await updatePatientFields(ctx, rowIndex, {
            visitProcedure: serialized.visitProcedure,
            procCode: serialized.procCode,
            fee: serialized.fee,
            unit: serialized.unit,
            total: serialized.total,
          }, sheetName);

          // Mirror to Sheets (fire-and-forget)
          saveBillingRows(ctx.sheets, rowIndex, billingItems, sheetName).catch(() => {});
        }
      } catch (e) {
        console.error('Auto-billing failed:', e);
      }
    }

    return NextResponse.json({ success: true, result });
  }
);
