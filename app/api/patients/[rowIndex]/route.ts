import { NextRequest, NextResponse } from 'next/server';
import { saveBillingRows, upsertDiagnosisCode, movePatientToSheet } from '@/lib/google-sheets';
import { getDataContext, getPatient, updatePatientFields, clearPatient } from '@/lib/data-layer';

// GET /api/patients/[rowIndex]?sheet=Mar+03,+2026
export async function GET(
  request: NextRequest,
  { params }: { params: { rowIndex: string } }
) {
  try {
    const ctx = await getDataContext();
    const rowIndex = parseInt(params.rowIndex);
    const sheetName = request.nextUrl.searchParams.get('sheet') || '';
    const patientName = request.nextUrl.searchParams.get('name') || undefined;
    const patient = await getPatient(ctx, rowIndex, sheetName, patientName);

    if (!patient) {
      console.error(`GET patient: not found — rowIndex=${rowIndex}, name=${patientName}, sheet="${sheetName}", mode=${ctx.mode}, hasDrive=${!!ctx.drive}`);
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    return NextResponse.json({ patient });
  } catch (error: any) {
    console.error('Error fetching patient:', error);
    if (error?.message?.includes('Not approved')) {
      return NextResponse.json({ error: 'Not approved' }, { status: 403 });
    }
    if (error?.message?.includes('Not authenticated') || error?.message?.includes('re-login')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to fetch patient', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}

// PATCH /api/patients/[rowIndex] - Update patient fields
export async function PATCH(
  request: NextRequest,
  { params }: { params: { rowIndex: string } }
) {
  try {
    const ctx = await getDataContext();
    const rowIndex = parseInt(params.rowIndex);
    const body = await request.json();
    const { _sheetName, _billingItems, _upsertDiagnosis, _moveToSheet, _patientName, ...fields } = body;

    // Move patient to a different date sheet
    if (_moveToSheet) {
      const result = await movePatientToSheet(ctx.sheets, rowIndex, _sheetName || '', _moveToSheet);
      return NextResponse.json({ success: true, ...result });
    }

    if (_billingItems) {
      // Write billing to Drive JSON (source of truth) + Sheets mirror
      const { serializeBillingItems } = await import('@/lib/billing');
      const serialized = serializeBillingItems(_billingItems);
      const allFields: Record<string, string> = {
        ...fields,
        visitProcedure: serialized.visitProcedure,
        procCode: serialized.procCode,
        fee: serialized.fee,
        unit: serialized.unit,
        total: serialized.total,
      };
      await updatePatientFields(ctx, rowIndex, allFields, _sheetName || '', _patientName || undefined);

      // Mirror to Sheets (fire-and-forget — for viewing/export only)
      saveBillingRows(ctx.sheets, rowIndex, _billingItems, _sheetName || undefined).catch(() => {});
    } else {
      await updatePatientFields(ctx, rowIndex, fields, _sheetName || '', _patientName || undefined);
    }

    // Upsert diagnosis→ICD mapping to registry if requested
    if (_upsertDiagnosis && _upsertDiagnosis.diagnosis?.trim()) {
      upsertDiagnosisCode(ctx.sheets, {
        diagnosis: _upsertDiagnosis.diagnosis,
        icd9: _upsertDiagnosis.icd9 || '',
        icd10: _upsertDiagnosis.icd10 || '',
      }).catch(err => console.error('Failed to upsert diagnosis code:', err));
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating patient:', error);
    if (error?.message?.includes('Not approved')) {
      return NextResponse.json({ error: 'Not approved' }, { status: 403 });
    }
    if (error?.message?.includes('Not authenticated') || error?.message?.includes('re-login')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to update patient', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}

// DELETE /api/patients/[rowIndex]?sheet=Mar+03,+2026
export async function DELETE(
  request: NextRequest,
  { params }: { params: { rowIndex: string } }
) {
  try {
    const rowIndex = parseInt(params.rowIndex);
    const sheetName = request.nextUrl.searchParams.get('sheet') || '';

    // Delete from Drive + clear Sheets row
    const ctx = await getDataContext();
    await clearPatient(ctx, rowIndex, sheetName || '');

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting patient:', error);
    if (error?.message?.includes('Not approved')) {
      return NextResponse.json({ error: 'Not approved' }, { status: 403 });
    }
    if (error?.message?.includes('Not authenticated') || error?.message?.includes('re-login')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to delete patient', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}
