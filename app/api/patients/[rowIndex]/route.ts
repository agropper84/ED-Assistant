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
    const patient = await getPatient(ctx, rowIndex, sheetName);

    if (!patient) {
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

    // Verify patient identity — use Sheets directly since rowIndex reflects
    // Sheets position (which shifts with billing continuation rows)
    if (_sheetName && _patientName) {
      const gs = await import('@/lib/google-sheets');
      const sheetsPatient = await gs.getPatient(ctx.sheets, rowIndex, _sheetName);
      if (sheetsPatient && sheetsPatient.name !== _patientName) {
        return NextResponse.json(
          { error: 'Patient identity mismatch — please close and reopen the chart.' },
          { status: 409 }
        );
      }
    }

    // Move patient to a different date sheet
    if (_moveToSheet) {
      const result = await movePatientToSheet(ctx.sheets, rowIndex, _sheetName || '', _moveToSheet);
      return NextResponse.json({ success: true, ...result });
    }

    if (_billingItems) {
      // Billing is Sheets-only — use the rowIndex directly (already synced to Sheets position)
      await saveBillingRows(ctx.sheets, rowIndex, _billingItems, _sheetName || undefined);

      // Save any non-billing fields (comments, etc.)
      const nonBillingFields = { ...fields };
      delete nonBillingFields.visitProcedure;
      delete nonBillingFields.procCode;
      delete nonBillingFields.fee;
      delete nonBillingFields.unit;
      delete nonBillingFields.total;
      if (Object.keys(nonBillingFields).length > 0) {
        await updatePatientFields(ctx, rowIndex, nonBillingFields, _sheetName || '');
      }
    } else {
      // Include patient name so Drive can find patient by name if rowIndex doesn't match
      const fieldsWithName = _patientName ? { ...fields, name: fields.name || _patientName } : fields;
      await updatePatientFields(ctx, rowIndex, fieldsWithName, _sheetName || undefined);
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
