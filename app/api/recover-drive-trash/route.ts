import { NextResponse } from 'next/server';
import { getDriveContext } from '@/lib/drive-json';

export const maxDuration = 120;

/**
 * POST /api/recover-drive-trash
 * Recovers all files from Google Drive trash in the ED Assistant data folder.
 * Files were incorrectly deleted when decryption failed after Redis key wipe.
 */
export async function POST() {
  try {
    const ctx = await getDriveContext();

    // Search for trashed files owned by this user in any ED Assistant folder
    const trashedRes = await ctx.drive.files.list({
      q: `trashed = true and (name contains '.json')`,
      fields: 'files(id, name, parents, trashed, modifiedTime)',
      pageSize: 200,
    });

    const trashedFiles = trashedRes.data.files || [];
    console.log(`[recover] Found ${trashedFiles.length} trashed JSON files`);

    let recovered = 0;
    const details: string[] = [];

    for (const file of trashedFiles) {
      try {
        // Untrash the file
        await ctx.drive.files.update({
          fileId: file.id!,
          requestBody: { trashed: false },
        });
        recovered++;
        details.push(`${file.name} (${file.modifiedTime})`);
        console.log(`[recover] Restored: ${file.name} (${file.id})`);
      } catch (err: any) {
        console.error(`[recover] Failed to restore ${file.name}:`, err?.message);
        details.push(`FAILED: ${file.name} - ${err?.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Recovered ${recovered}/${trashedFiles.length} files from trash`,
      recovered,
      total: trashedFiles.length,
      details,
    });
  } catch (error: any) {
    console.error('[recover] Error:', error);
    if (error?.message?.includes('Not authenticated') || error?.message?.includes('re-login')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json({ error: error?.message || 'Recovery failed' }, { status: 500 });
  }
}
