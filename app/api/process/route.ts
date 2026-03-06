import { NextRequest, NextResponse } from 'next/server';
import { processEncounter, ProcessedNote } from '@/lib/claude';
import { getSheetsContext, getPatient, updatePatientFields, saveBillingRows, getStyleGuideFromSheet } from '@/lib/google-sheets';
import { getAutoBilling, BillingItem } from '@/lib/billing';

// Allow longer execution for Claude API calls
export const maxDuration = 60;

// POST /api/process - Process patient encounter with Claude
export async function POST(request: NextRequest) {
  try {
    const ctx = await getSheetsContext();
    const { rowIndex, sheetName, modifications, styleGuidance, settings } = await request.json();

    // Get patient data
    const patient = await getPatient(ctx, rowIndex, sheetName);
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    // Build existing output if modifications are requested
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
    if (!effectiveStyleGuidance) {
      try {
        const guide = await getStyleGuideFromSheet(ctx);
        const hasExamples = Object.values(guide.examples).some(arr => arr.length > 0);
        if (hasExamples || guide.customGuidance || guide.extractedFeatures.length > 0) {
          const parts: string[] = [];
          for (const [section, examples] of Object.entries(guide.examples)) {
            if (examples.length > 0) {
              parts.push(`${section.toUpperCase()} style examples:\n${examples.map((e: string, i: number) => `Example ${i + 1}:\n${e}`).join('\n\n')}`);
            }
          }
          if (guide.extractedFeatures.length > 0) {
            parts.push(`Detected style features: ${guide.extractedFeatures.join(', ')}`);
          }
          if (guide.customGuidance) {
            parts.push(`Charting guidance from the physician:\n${guide.customGuidance}`);
          }
          effectiveStyleGuidance = parts.join('\n\n');
        }
      } catch (err) {
        console.error('Failed to load style guide from sheet:', err);
      }
    }

    // Process with Claude
    const result = await processEncounter(
      {
        name: patient.name,
        age: patient.age,
        gender: patient.gender,
        birthday: patient.birthday,
        triageVitals: patient.triageVitals,
        transcript: patient.transcript,
        additional: patient.additional,
        pastDocs: patient.pastDocs,
      },
      {
        modifications,
        existingOutput,
        styleGuidance: effectiveStyleGuidance,
        settings,
      }
    );

    // Build fields to update: clinical notes + ICD codes + diagnosis
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

    // Update the sheet with clinical notes
    await updatePatientFields(ctx, rowIndex, fieldsToUpdate, sheetName);

    // Auto-assign billing if not already set (only on fresh processing, not modifications)
    if (!modifications && !patient.procCode) {
      // Determine time from patient timestamp
      const timestamp = patient.timestamp || '';

      // Detect weekend from sheet name (e.g. "Mar 03, 2026")
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

      // Build billing items: auto premium + default visit type
      const autoItems = getAutoBilling(timestamp, isWeekend);
      const billingItems: BillingItem[] = [
        ...autoItems,
        { code: '1100', description: 'ED Visit', fee: '50.90', unit: '1', category: 'visitType' },
      ];

      await saveBillingRows(ctx, rowIndex, billingItems, sheetName);
    }

    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    console.error('Error processing encounter:', error);
    if (error?.message?.includes('Not approved')) {
      return NextResponse.json({ error: 'Not approved' }, { status: 403 });
    }
    if (error?.message?.includes('Not authenticated') || error?.message?.includes('re-login')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to process encounter', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}
