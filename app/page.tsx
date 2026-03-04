'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Patient } from '@/lib/google-sheets';
import { PatientCard } from '@/components/PatientCard';
import { ParseModal } from '@/components/ParseModal';
import { PatientDataModal } from '@/components/PatientDataModal';
import {
  Plus, RefreshCw, Loader2, ChevronLeft, ChevronRight,
  Calendar, Settings, CheckSquare, Square, Play, Clock
} from 'lucide-react';

function formatDateForSheet(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getMonth()];
  const day = date.getDate().toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${month} ${day}, ${year}`;
}

function formatDateDisplay(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  if (d.getTime() === today.getTime()) return 'Today';

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.getTime() === yesterday.getTime()) return 'Yesterday';

  return formatDateForSheet(date);
}

export default function HomePage() {
  const router = useRouter();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showParseModal, setShowParseModal] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);

  // Shift time state
  const [shiftStart, setShiftStart] = useState('');
  const [shiftEnd, setShiftEnd] = useState('');
  const [shiftHours, setShiftHours] = useState('');
  const [shiftFee, setShiftFee] = useState('');
  const [shiftTotal, setShiftTotal] = useState('');

  // Patient data modal
  const [dataModalPatient, setDataModalPatient] = useState<Patient | null>(null);

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<Patient | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Batch processing state
  const [batchMode, setBatchMode] = useState(false);
  const [selectedPatients, setSelectedPatients] = useState<Set<number>>(new Set());
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });

  const sheetName = formatDateForSheet(currentDate);
  const isToday = formatDateDisplay(currentDate) === 'Today';

  const fetchPatients = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const res = await fetch(`/api/patients?sheet=${encodeURIComponent(sheetName)}`);
      const data = await res.json();
      setPatients(data.patients || []);
      if (data.shiftTimes) {
        setShiftStart(data.shiftTimes.start || '');
        setShiftEnd(data.shiftTimes.end || '');
        setShiftHours(data.shiftTimes.hours || '');
        setShiftFee(data.shiftTimes.fee || '');
        setShiftTotal(data.shiftTimes.total || '');
      }
    } catch (error) {
      console.error('Failed to fetch patients:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchSheets = async () => {
    try {
      const res = await fetch('/api/patients?listSheets=1');
      const data = await res.json();
      setAvailableSheets(data.sheets || []);
    } catch (error) {
      console.error('Failed to fetch sheets:', error);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchPatients();
    fetchSheets();
  }, [sheetName]);

  const handleSavePatient = async (data: any) => {
    try {
      const res = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        const { rowIndex, sheetName: savedSheet } = await res.json();
        if (!isToday) {
          setCurrentDate(new Date());
        }
        fetchPatients();
        router.push(`/patient/${rowIndex}?sheet=${encodeURIComponent(savedSheet)}`);
      }
    } catch (error) {
      console.error('Failed to save patient:', error);
    }
  };

  const handleShiftTimeSave = async (overrides?: { start?: string; end?: string; fee?: string }) => {
    const s = overrides?.start ?? shiftStart;
    const e = overrides?.end ?? shiftEnd;
    const f = overrides?.fee ?? shiftFee;
    try {
      const res = await fetch('/api/patients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sheetName,
          shiftStart: s,
          shiftEnd: e,
          shiftFee: f,
        }),
      });
      const data = await res.json();
      if (data.shiftTimes) {
        setShiftHours(data.shiftTimes.hours || '');
        setShiftTotal(data.shiftTimes.total || '');
      }
    } catch (error) {
      console.error('Failed to save shift time:', error);
    }
  };

  const handleDeletePatient = async (patient: Patient) => {
    setDeleting(true);
    try {
      const sheetParam = `?sheet=${encodeURIComponent(patient.sheetName)}`;
      await fetch(`/api/patients/${patient.rowIndex}${sheetParam}`, {
        method: 'DELETE',
      });
      setDeleteConfirm(null);
      fetchPatients();
    } catch (error) {
      console.error('Failed to delete patient:', error);
    } finally {
      setDeleting(false);
    }
  };

  const goToPreviousDay = () => {
    const prev = new Date(currentDate);
    prev.setDate(prev.getDate() - 1);
    setCurrentDate(prev);
  };

  const goToNextDay = () => {
    const next = new Date(currentDate);
    next.setDate(next.getDate() + 1);
    setCurrentDate(next);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Batch processing
  const pendingPatients = patients.filter(p => p.status === 'pending');
  const processedPatients = patients.filter(p => p.status === 'processed');
  const newPatients = patients.filter(p => p.status === 'new');
  const hasPending = pendingPatients.length > 0;

  const togglePatientSelection = (rowIndex: number) => {
    const newSelected = new Set(selectedPatients);
    if (newSelected.has(rowIndex)) {
      newSelected.delete(rowIndex);
    } else {
      newSelected.add(rowIndex);
    }
    setSelectedPatients(newSelected);
  };

  const selectAll = () => {
    setSelectedPatients(new Set(pendingPatients.map(p => p.rowIndex)));
  };

  const handleBatchProcess = async () => {
    const toProcess = selectedPatients.size > 0
      ? pendingPatients.filter(p => selectedPatients.has(p.rowIndex))
      : pendingPatients;

    if (toProcess.length === 0) return;

    setBatchProcessing(true);
    setBatchProgress({ current: 0, total: toProcess.length });
    let failures = 0;

    for (let i = 0; i < toProcess.length; i++) {
      setBatchProgress({ current: i + 1, total: toProcess.length });
      try {
        const res = await fetch('/api/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rowIndex: toProcess[i].rowIndex, sheetName }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.error(`Failed to process ${toProcess[i].name}:`, err.detail || err.error);
          failures++;
        }
      } catch (error) {
        console.error(`Failed to process patient ${toProcess[i].name}:`, error);
        failures++;
      }
    }

    setBatchProcessing(false);
    setBatchMode(false);
    setSelectedPatients(new Set());
    fetchPatients();
    if (failures > 0) {
      alert(`${failures} of ${toProcess.length} patients failed to process. Check console for details.`);
    }
  };

  const exitBatchMode = () => {
    setBatchMode(false);
    setSelectedPatients(new Set());
  };

  const handlePatientClick = (patient: Patient) => {
    if (batchMode) return;
    setDataModalPatient(patient);
  };

  const navigateToPatient = (patient: Patient) => {
    setDataModalPatient(null);
    router.push(`/patient/${patient.rowIndex}?sheet=${encodeURIComponent(patient.sheetName)}`);
  };

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <header className="bg-blue-600 text-white px-4 py-4 sticky top-0 z-40">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <h1 className="text-xl font-bold">ED Documentation</h1>
          <div className="flex items-center gap-1">
            <button
              onClick={() => router.push('/settings')}
              className="p-2 hover:bg-blue-500 rounded-full transition-colors"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button
              onClick={() => fetchPatients(true)}
              disabled={refreshing}
              className="p-2 hover:bg-blue-500 rounded-full transition-colors"
            >
              <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Shift Times */}
      <div className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 py-2 space-y-2">
          <div className="flex items-center gap-3">
            <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="text-sm text-gray-500 flex-shrink-0">Shift:</span>
            <select
              value={shiftStart}
              onChange={(e) => { setShiftStart(e.target.value); handleShiftTimeSave({ start: e.target.value }); }}
              className="flex-1 p-1.5 border rounded-lg text-sm text-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              <option value="">Start</option>
              <option value="08:00">8:00 AM</option>
              <option value="11:00">11:00 AM</option>
              <option value="13:00">1:00 PM</option>
              <option value="18:00">6:00 PM</option>
              <option value="23:00">11:00 PM</option>
            </select>
            <span className="text-gray-400">—</span>
            <select
              value={shiftEnd}
              onChange={(e) => { setShiftEnd(e.target.value); handleShiftTimeSave({ end: e.target.value }); }}
              className="flex-1 p-1.5 border rounded-lg text-sm text-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              <option value="">End</option>
              <option value="15:00">3:00 PM</option>
              <option value="18:00">6:00 PM</option>
              <option value="21:00">9:00 PM</option>
              <option value="01:00">1:00 AM</option>
              <option value="08:00">8:00 AM</option>
            </select>
          </div>
          {(shiftHours || shiftFee) && (
            <div className="flex items-center gap-3 pl-7">
              {shiftHours && (
                <span className="text-sm text-gray-600">
                  <span className="text-gray-400">Hours:</span> {shiftHours}h
                </span>
              )}
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-400">Fee:</span>
                <input
                  type="text"
                  value={shiftFee}
                  onChange={(e) => setShiftFee(e.target.value)}
                  onBlur={() => handleShiftTimeSave({ fee: shiftFee })}
                  placeholder="$/hr"
                  className="w-16 p-1 border rounded text-sm text-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              {shiftTotal && (
                <span className="text-sm font-semibold text-green-700">
                  Total: ${shiftTotal}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Date Navigation */}
      <div className="bg-white border-b sticky top-[60px] z-30">
        <div className="flex items-center justify-between max-w-2xl mx-auto px-4 py-2">
          <button
            onClick={goToPreviousDay}
            className="p-2 hover:bg-gray-100 rounded-full"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <button
            onClick={goToToday}
            className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 rounded-lg"
          >
            <Calendar className="w-4 h-4 text-gray-500" />
            <span className="font-medium text-gray-900">{formatDateDisplay(currentDate)}</span>
            {!isToday && (
              <span className="text-xs text-blue-600 font-medium ml-1">Go to today</span>
            )}
          </button>
          <button
            onClick={goToNextDay}
            disabled={isToday}
            className="p-2 hover:bg-gray-100 rounded-full disabled:opacity-30"
          >
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Batch Processing Bar */}
      {batchMode && (
        <div className="bg-amber-50 border-b border-amber-200 sticky top-[108px] z-20">
          <div className="flex items-center justify-between max-w-2xl mx-auto px-4 py-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium text-amber-800">
                {selectedPatients.size > 0
                  ? `${selectedPatients.size} selected`
                  : 'Select patients'}
              </span>
              <button
                onClick={selectAll}
                className="text-amber-600 underline text-xs"
              >
                Select All
              </button>
            </div>
            <div className="flex items-center gap-2">
              {batchProcessing ? (
                <span className="text-sm text-amber-700 flex items-center gap-1">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {batchProgress.current}/{batchProgress.total}
                </span>
              ) : (
                <>
                  <button
                    onClick={handleBatchProcess}
                    disabled={batchProcessing}
                    className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-sm font-medium flex items-center gap-1"
                  >
                    <Play className="w-3.5 h-3.5" />
                    {selectedPatients.size > 0 ? 'Process Selected' : 'Process All'}
                  </button>
                  <button
                    onClick={exitBatchMode}
                    className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : patients.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">
              {isToday ? 'No patients yet today' : `No patients on ${sheetName}`}
            </p>
            {isToday && (
              <button
                onClick={() => setShowParseModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg"
              >
                <Plus className="w-4 h-4" />
                Add First Patient
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Batch Process Button */}
            {hasPending && !batchMode && (
              <button
                onClick={() => setBatchMode(true)}
                className="w-full py-3 bg-amber-100 text-amber-800 rounded-xl font-medium flex items-center justify-center gap-2 border border-amber-200"
              >
                <Play className="w-4 h-4" />
                Batch Process ({pendingPatients.length} pending)
              </button>
            )}

            {/* Ready to Process */}
            {pendingPatients.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-amber-700 uppercase tracking-wide mb-2">
                  Ready to Process ({pendingPatients.length})
                </h2>
                <div className="space-y-2">
                  {pendingPatients.map((patient) => (
                    <div key={patient.rowIndex} className="flex items-center gap-2">
                      {batchMode && (
                        <button
                          onClick={() => togglePatientSelection(patient.rowIndex)}
                          className="flex-shrink-0 p-1"
                        >
                          {selectedPatients.has(patient.rowIndex) ? (
                            <CheckSquare className="w-5 h-5 text-amber-600" />
                          ) : (
                            <Square className="w-5 h-5 text-gray-400" />
                          )}
                        </button>
                      )}
                      <div className="flex-1">
                        <PatientCard
                          patient={patient}
                          onClick={() => handlePatientClick(patient)}
                          onDelete={() => setDeleteConfirm(patient)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* New */}
            {newPatients.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-blue-700 uppercase tracking-wide mb-2">
                  New ({newPatients.length})
                </h2>
                <div className="space-y-2">
                  {newPatients.map((patient) => (
                    <PatientCard
                      key={patient.rowIndex}
                      patient={patient}
                      onClick={() => handlePatientClick(patient)}
                      onDelete={() => setDeleteConfirm(patient)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Processed */}
            {processedPatients.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-green-700 uppercase tracking-wide mb-2">
                  Processed ({processedPatients.length})
                </h2>
                <div className="space-y-2">
                  {processedPatients.map((patient) => (
                    <PatientCard
                      key={patient.rowIndex}
                      patient={patient}
                      onClick={() => handlePatientClick(patient)}
                      onDelete={() => setDeleteConfirm(patient)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      {/* FAB - Add Patient (only on today) */}
      {isToday && (
        <button
          onClick={() => setShowParseModal(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {/* Parse Modal */}
      <ParseModal
        isOpen={showParseModal}
        onClose={() => setShowParseModal(false)}
        onSave={handleSavePatient}
      />

      {/* Patient Data Entry Modal */}
      <PatientDataModal
        patient={dataModalPatient}
        isOpen={!!dataModalPatient}
        onClose={() => setDataModalPatient(null)}
        onSaved={() => fetchPatients()}
        onNavigate={() => dataModalPatient && navigateToPatient(dataModalPatient)}
      />

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4">
            <h3 className="text-lg font-semibold">Delete Patient?</h3>
            <p className="text-sm text-gray-600">
              Remove <strong>{deleteConfirm.name || 'this patient'}</strong> from the list? This clears all data for this row.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handleDeletePatient(deleteConfirm)}
                disabled={deleting}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Delete
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-lg font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
