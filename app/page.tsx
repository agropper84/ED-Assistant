'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Patient } from '@/lib/google-sheets';
import { PatientCard } from '@/components/PatientCard';
import { ParseModal } from '@/components/ParseModal';
import { Plus, RefreshCw, Loader2 } from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showParseModal, setShowParseModal] = useState(false);

  const fetchPatients = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const res = await fetch('/api/patients');
      const data = await res.json();
      setPatients(data.patients || []);
    } catch (error) {
      console.error('Failed to fetch patients:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchPatients();
  }, []);

  const handleSavePatient = async (data: any) => {
    try {
      const res = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (res.ok) {
        const { rowIndex } = await res.json();
        fetchPatients();
        router.push(`/patient/${rowIndex}`);
      }
    } catch (error) {
      console.error('Failed to save patient:', error);
    }
  };

  // Group patients by status
  const pendingPatients = patients.filter(p => p.status === 'pending');
  const processedPatients = patients.filter(p => p.status === 'processed');
  const newPatients = patients.filter(p => p.status === 'new');

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <header className="bg-blue-600 text-white px-4 py-4 sticky top-0 z-40">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <h1 className="text-xl font-bold">ED Documentation</h1>
          <button
            onClick={() => fetchPatients(true)}
            disabled={refreshing}
            className="p-2 hover:bg-blue-500 rounded-full transition-colors"
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : patients.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">No patients yet</p>
            <button
              onClick={() => setShowParseModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg"
            >
              <Plus className="w-4 h-4" />
              Add First Patient
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Ready to Process */}
            {pendingPatients.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-amber-700 uppercase tracking-wide mb-2">
                  Ready to Process ({pendingPatients.length})
                </h2>
                <div className="space-y-2">
                  {pendingPatients.map((patient) => (
                    <PatientCard
                      key={patient.rowIndex}
                      patient={patient}
                      onClick={() => router.push(`/patient/${patient.rowIndex}`)}
                    />
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
                      onClick={() => router.push(`/patient/${patient.rowIndex}`)}
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
                      onClick={() => router.push(`/patient/${patient.rowIndex}`)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      {/* FAB - Add Patient */}
      <button
        onClick={() => setShowParseModal(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-blue-700 transition-colors"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Parse Modal */}
      <ParseModal
        isOpen={showParseModal}
        onClose={() => setShowParseModal(false)}
        onSave={handleSavePatient}
      />
    </div>
  );
}
