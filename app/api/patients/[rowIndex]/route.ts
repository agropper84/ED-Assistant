import { NextRequest, NextResponse } from 'next/server';
import { getPatient, updatePatientFields, clearPatientRow, saveBillingRows } from '@/lib/google-sheets';

// GET /api/patients/[rowIndex]?sheet=Mar+03,+2026
export async function GET(
  request: NextRequest,
  { params }: { params: { rowIndex: string } }
) {
  try {
    const rowIndex = parseInt(params.rowIndex);
    const sheetName = request.nextUrl.searchParams.get('sheet') || undefined;
    const patient = await getPatient(rowIndex, sheetName);

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    return NextResponse.json({ patient });
  } catch (error: any) {
    console.error('Error fetching patient:', error);
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
    const rowIndex = parseInt(params.rowIndex);
    const body = await request.json();
    const { _sheetName, _billingItems, ...fields } = body;

    if (_billingItems) {
      // Multi-row billing save
      await saveBillingRows(rowIndex, _billingItems, _sheetName || undefined);
      // Also save non-billing fields (like comments)
      const nonBillingFields = { ...fields };
      delete nonBillingFields.visitProcedure;
      delete nonBillingFields.procCode;
      delete nonBillingFields.fee;
      delete nonBillingFields.unit;
      delete nonBillingFields.total;
      if (Object.keys(nonBillingFields).length > 0) {
        await updatePatientFields(rowIndex, nonBillingFields, _sheetName || undefined);
      }
    } else {
      await updatePatientFields(rowIndex, fields, _sheetName || undefined);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating patient:', error);
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
    const sheetName = request.nextUrl.searchParams.get('sheet') || undefined;

    await clearPatientRow(rowIndex, sheetName);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting patient:', error);
    return NextResponse.json(
      { error: 'Failed to delete patient', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}
