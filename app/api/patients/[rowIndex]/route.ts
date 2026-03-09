import { NextRequest, NextResponse } from 'next/server';
import { getSheetsContext, getPatient, updatePatientFields, clearPatientRow, saveBillingRows, upsertDiagnosisCode } from '@/lib/google-sheets';

// GET /api/patients/[rowIndex]?sheet=Mar+03,+2026
export async function GET(
  request: NextRequest,
  { params }: { params: { rowIndex: string } }
) {
  try {
    const ctx = await getSheetsContext();
    const rowIndex = parseInt(params.rowIndex);
    const sheetName = request.nextUrl.searchParams.get('sheet') || undefined;
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
    const ctx = await getSheetsContext();
    const rowIndex = parseInt(params.rowIndex);
    const body = await request.json();
    const { _sheetName, _billingItems, _upsertDiagnosis, ...fields } = body;

    if (_billingItems) {
      // Multi-row billing save
      await saveBillingRows(ctx, rowIndex, _billingItems, _sheetName || undefined);
      // Also save non-billing fields (like comments)
      const nonBillingFields = { ...fields };
      delete nonBillingFields.visitProcedure;
      delete nonBillingFields.procCode;
      delete nonBillingFields.fee;
      delete nonBillingFields.unit;
      delete nonBillingFields.total;
      if (Object.keys(nonBillingFields).length > 0) {
        await updatePatientFields(ctx, rowIndex, nonBillingFields, _sheetName || undefined);
      }
    } else {
      await updatePatientFields(ctx, rowIndex, fields, _sheetName || undefined);
    }

    // Upsert diagnosis→ICD mapping to registry if requested
    if (_upsertDiagnosis && _upsertDiagnosis.diagnosis?.trim()) {
      upsertDiagnosisCode(ctx, {
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
    const ctx = await getSheetsContext();
    const rowIndex = parseInt(params.rowIndex);
    const sheetName = request.nextUrl.searchParams.get('sheet') || undefined;

    await clearPatientRow(ctx, rowIndex, sheetName);

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
