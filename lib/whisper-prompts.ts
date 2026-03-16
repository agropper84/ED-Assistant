// Shared Whisper prompts for medical transcription
// Used by: /api/transcribe, /api/shortcuts/upload, /api/split-transcript

// Comprehensive ED medical terminology for Whisper bias
const ED_TERMS = [
  // Vitals & Assessment
  'vitals', 'SpO2', 'GCS', 'LOC', 'ROS', 'HPI', 'PMH', 'PSH', 'FHx', 'SHx',
  'mmHg', 'mg', 'mL', 'mcg', 'kg', 'bpm', 'breaths per minute',

  // Cardiac
  'STEMI', 'NSTEMI', 'afib', 'atrial fibrillation', 'atrial flutter',
  'SVT', 'VT', 'VF', 'PEA', 'asystole', 'troponin', 'BNP', 'NT-proBNP',
  'EKG', 'ECG', 'ST elevation', 'ST depression', 'QTc', 'PR interval',
  'sinus rhythm', 'sinus tachycardia', 'sinus bradycardia',
  'tachycardia', 'bradycardia', 'palpitations', 'syncope', 'presyncope',
  'cardiomegaly', 'pericarditis', 'tamponade', 'endocarditis',
  'aortic dissection', 'aortic aneurysm', 'CHF', 'heart failure',
  'JVD', 'jugular venous distension', 'S3', 'S4', 'murmur',
  'nitroglycerin', 'heparin', 'enoxaparin', 'Lovenox', 'aspirin',
  'clopidogrel', 'Plavix', 'ticagrelor', 'Brilinta', 'amiodarone',
  'diltiazem', 'metoprolol', 'atenolol', 'lisinopril', 'losartan',
  'amlodipine', 'hydralazine', 'furosemide', 'Lasix', 'digoxin',

  // Pulmonary
  'dyspnea', 'tachypnea', 'wheezing', 'rales', 'rhonchi', 'crackles',
  'stridor', 'pneumothorax', 'hemothorax', 'pleural effusion', 'empyema',
  'pneumonia', 'COPD', 'asthma', 'bronchitis', 'bronchospasm',
  'PE', 'pulmonary embolism', 'DVT', 'deep vein thrombosis',
  'D-dimer', 'CTA', 'CTPA', 'CXR', 'chest X-ray',
  'intubation', 'extubation', 'BiPAP', 'CPAP', 'high-flow nasal cannula',
  'nebulizer', 'albuterol', 'ipratropium', 'Atrovent', 'prednisone',
  'methylprednisolone', 'Solu-Medrol', 'dexamethasone',
  'bilateral breath sounds', 'diminished breath sounds', 'accessory muscles',

  // Neuro
  'CVA', 'TIA', 'stroke', 'hemorrhagic', 'ischemic', 'thrombolysis',
  'tPA', 'alteplase', 'tenecteplase', 'NIH Stroke Scale', 'NIHSS',
  'AMS', 'altered mental status', 'obtunded', 'lethargic', 'oriented',
  'seizure', 'status epilepticus', 'postictal', 'meningitis', 'encephalitis',
  'subarachnoid hemorrhage', 'subdural hematoma', 'epidural hematoma',
  'concussion', 'midline shift', 'herniation', 'cranial nerves',
  'pupils', 'PERRL', 'PERRLA', 'photophobic', 'nystagmus',
  'Kernig', 'Brudzinski', 'Babinski', 'pronator drift',
  'levetiracetam', 'Keppra', 'phenytoin', 'Dilantin', 'lorazepam',
  'midazolam', 'diazepam', 'Valium',

  // GI
  'appendicitis', 'cholecystitis', 'cholelithiasis', 'choledocholithiasis',
  'pancreatitis', 'diverticulitis', 'diverticulosis', 'SBO', 'small bowel obstruction',
  'large bowel obstruction', 'ileus', 'volvulus', 'intussusception',
  'GI bleed', 'upper GI bleed', 'lower GI bleed', 'hematemesis', 'melena',
  'hematochezia', 'GERD', 'gastritis', 'peptic ulcer', 'perforated viscus',
  'peritonitis', 'ascites', 'hepatitis', 'cirrhosis', 'varices',
  'Murphy sign', 'McBurney point', 'Rovsing sign', 'rebound tenderness',
  'guarding', 'rigidity', 'distension', 'borborygmi', 'hyperactive bowel sounds',
  'ondansetron', 'Zofran', 'metoclopramide', 'Reglan', 'pantoprazole',
  'Protonix', 'omeprazole', 'Prilosec', 'sucralfate',

  // Renal / GU
  'pyelonephritis', 'UTI', 'urinary tract infection', 'nephrolithiasis',
  'renal colic', 'hydronephrosis', 'hematuria', 'pyuria', 'dysuria',
  'urinary retention', 'Foley catheter', 'BUN', 'creatinine', 'GFR',
  'AKI', 'acute kidney injury', 'CKD', 'rhabdomyolysis', 'CK',
  'testicular torsion', 'epididymitis', 'orchitis',

  // MSK / Trauma
  'laceration', 'abrasion', 'contusion', 'ecchymosis', 'hematoma',
  'fracture', 'dislocation', 'subluxation', 'sprain', 'strain',
  'compartment syndrome', 'fasciotomy', 'splint', 'reduction',
  'clavicle', 'humerus', 'radius', 'ulna', 'scaphoid', 'femur',
  'tibia', 'fibula', 'patella', 'malleolus', 'calcaneus', 'metatarsal',
  'C-spine', 'cervical spine', 'thoracic', 'lumbar', 'sacral',
  'Ottawa ankle rules', 'Ottawa knee rules', 'Canadian C-spine rules',
  'NEXUS', 'FAST exam', 'eFAST', 'Morison pouch',

  // Skin / Soft Tissue
  'abscess', 'cellulitis', 'erysipelas', 'necrotizing fasciitis',
  'MRSA', 'MSSA', 'wound', 'debridement', 'I&D', 'incision and drainage',
  'sutures', 'staples', 'Steri-Strips', 'Dermabond',
  'erythema', 'induration', 'fluctuance', 'purulence', 'crepitus',

  // Infectious Disease
  'sepsis', 'septic shock', 'bacteremia', 'SIRS', 'qSOFA',
  'blood cultures', 'lactate', 'procalcitonin',
  'vancomycin', 'piperacillin-tazobactam', 'Zosyn', 'ceftriaxone',
  'Rocephin', 'cefazolin', 'Ancef', 'azithromycin', 'Zithromax',
  'ciprofloxacin', 'levofloxacin', 'Levaquin', 'metronidazole',
  'Flagyl', 'clindamycin', 'trimethoprim-sulfamethoxazole', 'Bactrim',
  'amoxicillin-clavulanate', 'Augmentin', 'doxycycline',
  'fluconazole', 'Diflucan', 'acyclovir', 'oseltamivir', 'Tamiflu',

  // ENT / HEENT
  'HEENT', 'peritonsillar abscess', 'PTA', 'pharyngitis', 'epiglottitis',
  'epistaxis', 'rhinosinusitis', 'otitis media', 'otitis externa',
  'TM', 'tympanic membrane', 'hearing loss', 'vertigo', 'BPPV',
  'Dix-Hallpike', 'Epley maneuver', 'meclizine', 'Antivert',
  'oropharynx', 'uvula', 'tonsillar', 'lymphadenopathy',
  'normocephalic', 'atraumatic', 'midline trachea', 'thyromegaly',

  // Eyes
  'visual acuity', 'slit lamp', 'fluorescein', 'IOP', 'intraocular pressure',
  'conjunctivitis', 'corneal abrasion', 'corneal ulcer', 'hyphema',
  'retinal detachment', 'globe rupture', 'iritis', 'uveitis',
  'erythromycin ointment', 'timolol', 'tetracaine', 'proparacaine',

  // Psych / Tox
  'suicidal ideation', 'SI', 'HI', 'homicidal ideation',
  'overdose', 'ingestion', 'toxidrome', 'acetaminophen', 'Tylenol',
  'salicylate', 'N-acetylcysteine', 'NAC', 'Mucomyst',
  'naloxone', 'Narcan', 'flumazenil', 'activated charcoal',
  'benzodiazepine', 'opioid', 'ethanol', 'methanol', 'ethylene glycol',
  'anion gap', 'osmolar gap',
  'haloperidol', 'Haldol', 'olanzapine', 'Zyprexa', 'ketamine',

  // Procedures
  'central line', 'arterial line', 'chest tube', 'thoracostomy',
  'thoracentesis', 'paracentesis', 'lumbar puncture', 'LP',
  'procedural sedation', 'conscious sedation', 'rapid sequence intubation', 'RSI',
  'cricothyrotomy', 'tracheostomy', 'cardioversion', 'defibrillation',
  'pericardiocentesis', 'joint aspiration', 'arthrocentesis',
  'nerve block', 'digital block', 'hematoma block', 'ring block',
  'lidocaine', 'bupivacaine', 'Marcaine', 'ropivacaine',
  'propofol', 'etomidate', 'succinylcholine', 'rocuronium',
  'fentanyl', 'morphine', 'hydromorphone', 'Dilaudid', 'ketorolac', 'Toradol',

  // Labs
  'CBC', 'BMP', 'CMP', 'ABG', 'VBG', 'PT', 'INR', 'PTT', 'aPTT',
  'WBC', 'hemoglobin', 'hematocrit', 'platelets', 'MCV',
  'sodium', 'potassium', 'chloride', 'bicarbonate', 'CO2',
  'glucose', 'calcium', 'magnesium', 'phosphorus',
  'AST', 'ALT', 'alkaline phosphatase', 'bilirubin', 'albumin',
  'lipase', 'amylase', 'ESR', 'CRP', 'urinalysis', 'UA',
  'urine drug screen', 'UDS', 'blood gas', 'lactic acid',
  'TSH', 'T3', 'T4', 'beta-hCG', 'type and screen', 'crossmatch',

  // Imaging
  'CT', 'CT scan', 'MRI', 'X-ray', 'XR', 'ultrasound', 'US',
  'CT head', 'CT abdomen pelvis', 'CT angiogram', 'CTA chest',
  'point-of-care ultrasound', 'POCUS',

  // Routes & Dosing
  'IV', 'IM', 'PO', 'SQ', 'subcutaneous', 'sublingual', 'SL',
  'PRN', 'prn', 'BID', 'TID', 'QID', 'daily', 'q4h', 'q6h', 'q8h',
  'bolus', 'infusion', 'drip', 'titrate', 'taper',
  'normal saline', 'NS', 'lactated Ringer', 'LR', 'D5W',

  // Disposition
  'admission', 'discharge', 'AMA', 'against medical advice',
  'observation', 'transfer', 'consult', 'follow-up',
  'return precautions', 'discharge instructions',
].join(', ');

/** Whisper prompt for physician dictation (single speaker).
 * Whisper works best when the prompt looks like a transcript sample
 * in the expected style, not just a keyword list. We combine both. */
export const DICTATION_WHISPER_PROMPT =
  `Patient presents with chest pain, troponin negative, ECG showing sinus tachycardia. Started on IV normal saline bolus, ordered CTA chest to rule out PE. D-dimer elevated at 1.2. CVA tenderness noted on exam. SpO2 94% on room air, started high-flow nasal cannula. Medical terminology: ${ED_TERMS}`;

/** Whisper prompt for doctor-patient encounter recording (two speakers) */
export const ENCOUNTER_WHISPER_PROMPT =
  `Dr: What brings you in today? Pt: I've been having this chest pain since yesterday. Dr: Can you describe the pain? Is it sharp or pressure-like? Pt: It's more like pressure, right in the middle. Dr: Any shortness of breath, nausea, diaphoresis? Let me check your vitals. BP 145/90, heart rate 98, SpO2 96% on room air. Medical terminology: ${ED_TERMS}`;

/** Whisper prompt for device API (watch app, shortcuts) */
export const DEVICE_WHISPER_PROMPT = DICTATION_WHISPER_PROMPT;
