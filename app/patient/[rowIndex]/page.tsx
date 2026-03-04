'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Patient } from '@/lib/google-sheets';
import { 
  ArrowLeft, Loader2, Play, Copy, Check, 
  User, Calendar, CreditCard, FileText,
  ChevronDown, ChevronUp
} from 'lucide-react';

export default function PatientPage() {
  const router = useRouter();
  const params = useParams();
  const rowIndex = params.rowIndex as string;

  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['hpi', 'objective', 'assessmentPlan'])
  );

  useEffect(() => {
    fetchPatient();
  }, [rowIndex]);

  const fetchPatient = async () => {
    try {
      const res = await fetch(`/api/patients/${rowIndex}`);
      const data = await res.json();
      setPatient(data.patient);
    } catch (error) {
      console.error('Failed to fetch patient:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProcess = async () => {
    setProcessing(true);
    try {
      const res = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowIndex: parseInt(rowIndex) }),
      });
      
      if (res.ok) {
        await fetchPatient();
      }
    } catch (error) {
      console.error('Failed to process:', error);
    } finally {
      setProcessing(false);
    }
  };

  const copyToClipboard = async (text: string, section: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(section);
    setTimeout(() => setCopied(null), 2000);
  };

  const copyFullNote = async () => {
    if (!patient) return;
    const fullNote = `HPI:\n${patient.hpi}\n\nOBJECTIVE:\n${patient.objective}\n\nASSESSMENT & PLAN:\n${patient.assessmentPlan}`;
    await copyToClipboard(fullNote, 'full');
  };

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Patient not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <header className="bg-blue-600 text-white px-4 py-4 sticky top-0 z-40">
        <div className="flex items-center gap-3 max-w-2xl mx-auto">
          <button
            onClick={() => router.push('/')}
            className="p-2 hover:bg-blue-500 rounded-full -ml-2"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold truncate">{patient.name || 'Unknown'}</h1>
            <p className="text-blue-100 text-sm">
              {patient.age && `${patient.age} `}
              {patient.gender && `${patient.gender} `}
              {patient.timestamp && `• ${patient.timestamp}`}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* Patient Info Card */}
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-gray-600">DOB:</span>
              <span className="font-medium">{patient.birthday || '—'}</span>
            </div>
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-gray-400" />
              <span className="text-gray-600">HCN:</span>
              <span className="font-medium">{patient.hcn || '—'}</span>
            </div>
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-gray-400" />
              <span className="text-gray-600">MRN:</span>
              <span className="font-medium">{patient.mrn || '—'}</span>
            </div>
            {patient.diagnosis && (
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-400" />
                <span className="text-gray-600">Dx:</span>
                <span className="font-medium">{patient.diagnosis}</span>
              </div>
            )}
          </div>
        </div>

        {/* Process Button */}
        {!patient.hasOutput && (
          <button
            onClick={handleProcess}
            disabled={processing}
            className="w-full py-4 bg-green-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {processing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                Generate Encounter Note
              </>
            )}
          </button>
        )}

        {/* Output Sections */}
        {patient.hasOutput && (
          <>
            {/* Copy All Button */}
            <button
              onClick={copyFullNote}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium flex items-center justify-center gap-2"
            >
              {copied === 'full' ? (
                <>
                  <Check className="w-5 h-5" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-5 h-5" />
                  Copy Full Note
                </>
              )}
            </button>

            {/* HPI Section */}
            <OutputSection
              title="HPI"
              content={patient.hpi}
              expanded={expandedSections.has('hpi')}
              onToggle={() => toggleSection('hpi')}
              onCopy={() => copyToClipboard(patient.hpi, 'hpi')}
              copied={copied === 'hpi'}
            />

            {/* Objective Section */}
            <OutputSection
              title="Objective"
              content={patient.objective}
              expanded={expandedSections.has('objective')}
              onToggle={() => toggleSection('objective')}
              onCopy={() => copyToClipboard(patient.objective, 'objective')}
              copied={copied === 'objective'}
            />

            {/* Assessment & Plan Section */}
            <OutputSection
              title="Assessment & Plan"
              content={patient.assessmentPlan}
              expanded={expandedSections.has('assessmentPlan')}
              onToggle={() => toggleSection('assessmentPlan')}
              onCopy={() => copyToClipboard(patient.assessmentPlan, 'assessmentPlan')}
              copied={copied === 'assessmentPlan'}
            />

            {/* DDx Section (collapsed by default) */}
            <OutputSection
              title="Differential Diagnosis"
              content={patient.ddx}
              expanded={expandedSections.has('ddx')}
              onToggle={() => toggleSection('ddx')}
              onCopy={() => copyToClipboard(patient.ddx, 'ddx')}
              copied={copied === 'ddx'}
            />
          </>
        )}

        {/* Input Data (Triage, Transcript) */}
        {(patient.triageVitals || patient.transcript) && (
          <div className="mt-6 pt-6 border-t">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Source Data
            </h3>
            
            {patient.triageVitals && (
              <OutputSection
                title="Triage Notes"
                content={patient.triageVitals}
                expanded={expandedSections.has('triage')}
                onToggle={() => toggleSection('triage')}
                onCopy={() => copyToClipboard(patient.triageVitals, 'triage')}
                copied={copied === 'triage'}
                variant="muted"
              />
            )}
            
            {patient.transcript && (
              <OutputSection
                title="Transcript"
                content={patient.transcript}
                expanded={expandedSections.has('transcript')}
                onToggle={() => toggleSection('transcript')}
                onCopy={() => copyToClipboard(patient.transcript, 'transcript')}
                copied={copied === 'transcript'}
                variant="muted"
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// Output Section Component
function OutputSection({
  title,
  content,
  expanded,
  onToggle,
  onCopy,
  copied,
  variant = 'default',
}: {
  title: string;
  content: string;
  expanded: boolean;
  onToggle: () => void;
  onCopy: () => void;
  copied: boolean;
  variant?: 'default' | 'muted';
}) {
  if (!content) return null;

  const bgColor = variant === 'muted' ? 'bg-gray-50' : 'bg-white';
  const borderColor = variant === 'muted' ? 'border-gray-200' : 'border-gray-100';

  return (
    <div className={`${bgColor} rounded-xl shadow-sm border ${borderColor} overflow-hidden`}>
      <div className="flex items-center justify-between p-4 cursor-pointer" onClick={onToggle}>
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCopy();
            }}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-600" />
            ) : (
              <Copy className="w-4 h-4 text-gray-400" />
            )}
          </button>
          {expanded ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-4">
          <p className="text-gray-700 whitespace-pre-wrap text-sm leading-relaxed">
            {content}
          </p>
        </div>
      )}
    </div>
  );
}
