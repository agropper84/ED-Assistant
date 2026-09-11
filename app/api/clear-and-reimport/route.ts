import { NextRequest, NextResponse } from 'next/server';
import { getDataContext, getOrCreateDateSheet, getNextRowIndex, updatePatientFields } from '@/lib/data-layer';
import { emptyDateSheet, saveDateSheetToDrive } from '@/lib/drive-json';
import type { Patient } from '@/lib/google-sheets';

export const maxDuration = 300;

const CLEAR_DATES = [
  'Aug 18, 2026',
  'Aug 19, 2026',
  'Aug 20, 2026',
  'Aug 21, 2026',
  'Aug 22, 2026',
  'Aug 23, 2026',
];

interface ImportPatient {
  name: string;
  timestamp: string;
  age: string;
  gender: string;
  birthday: string;
  hcn: string;
  diagnosis: string;
  icd10: string;
  comments: string;
}

interface ImportDay {
  sheetName: string;
  patients: ImportPatient[];
}

// 95 patients, Aug 18-23 2026, extracted from ED_Physician_Billing_18-23_Aug_2026.xlsx
const IMPORT_DATA: { days: ImportDay[] } = {
  days: [
    {
      sheetName: 'Aug 18, 2026',
      patients: [
        { name: 'Scarlet Molloy', timestamp: '04:15', age: '36', gender: '', birthday: '1989-09-10', hcn: '002429710', diagnosis: 'First trimester bleeding', icd10: 'O20.903', comments: 'Ectopic pregnancy (?)' },
        { name: 'Yolanda Yvette Carlick', timestamp: '06:00', age: '45', gender: '', birthday: '1980-09-06', hcn: '002558559', diagnosis: 'Back pain', icd10: 'M54.9', comments: '' },
        { name: 'Cody Robert Charlie Douville', timestamp: '08:00', age: '28', gender: '', birthday: '1997-10-03', hcn: '002654705', diagnosis: 'Seizure', icd10: 'R56.88', comments: '' },
        { name: 'Karen Jacqueline Dawson', timestamp: '08:45', age: '50', gender: '', birthday: '1976-02-23', hcn: '002258044', diagnosis: 'Alcohol abuse', icd10: 'F10.1', comments: '' },
        { name: 'Jennifer Oseyi Efosa', timestamp: '08:45', age: '28', gender: '', birthday: '1997-08-23', hcn: '003176252', diagnosis: 'Insomnia', icd10: 'G47.0', comments: '' },
        { name: 'Benjamin Frances Devellano', timestamp: '08:45', age: '42', gender: '', birthday: '1983-11-18', hcn: '002556025', diagnosis: 'Cellulitis', icd10: 'L03.9', comments: '' },
        { name: 'Lauren Dawne Gostick', timestamp: '09:30', age: '35', gender: '', birthday: '1990-11-15', hcn: '003074408', diagnosis: 'Syncope', icd10: 'R55', comments: '' },
        { name: 'Aaren Hajash', timestamp: '11:15', age: '49', gender: '', birthday: '1977-07-12', hcn: '002269991', diagnosis: '', icd10: '', comments: '' },
        { name: 'Kristin Daniel', timestamp: '09:30', age: '43', gender: '', birthday: '1983-01-19', hcn: '002941912', diagnosis: 'Contusion', icd10: 'T14.0', comments: '' },
        { name: 'Devon Soucy', timestamp: '08:00', age: '38', gender: '', birthday: '1987-10-26', hcn: '113379736', diagnosis: 'Laceration', icd10: 'T14.1', comments: 'partial amputation of RD2/3' },
        { name: 'Nash Travis Fisher', timestamp: '11:15', age: '3', gender: '', birthday: '2023-01-10', hcn: '003132255', diagnosis: 'Periorbital swelling', icd10: 'H57.8', comments: '' },
        { name: 'Jordan Sidney Adam Tanner', timestamp: '11:15', age: '19', gender: '', birthday: '2007-04-04', hcn: '002807493', diagnosis: 'Otitis externa', icd10: 'H60.9', comments: '' },
        { name: 'Brandon Lee Chiasson', timestamp: '10:15', age: '19', gender: '', birthday: '2006-10-04', hcn: '002799427', diagnosis: 'MVC (motor vehicle collision)', icd10: 'V89.2', comments: '' },
        { name: "Clarence Herb O'Haver", timestamp: '11:15', age: '69', gender: '', birthday: '1957-03-23', hcn: '002598365', diagnosis: 'Joint pain', icd10: 'M25.59', comments: '' },
        { name: 'Rebecca Freda Ann Barichello', timestamp: '09:30', age: '37', gender: '', birthday: '1988-11-18', hcn: '002420636', diagnosis: 'Antepartum bleeding, first tri', icd10: 'O20.903', comments: '' },
        { name: 'Kelly De Jager', timestamp: '11:15', age: '49', gender: '', birthday: '1977-03-11', hcn: '002778959', diagnosis: 'Chronic pain', icd10: 'R52.2', comments: '' },
        { name: 'Erica Maria Ann Lynn Allen', timestamp: '11:45', age: '34', gender: '', birthday: '1992-05-08', hcn: '002892990', diagnosis: 'Asthma', icd10: 'J45.90', comments: '' },
        { name: 'Jatin Dineshchandra Patel', timestamp: '11:45', age: '34', gender: '', birthday: '1992-02-04', hcn: '003059524', diagnosis: 'Pharyngitis', icd10: 'J02.9', comments: '' },
        { name: 'Warren Allan Badley', timestamp: '11:45', age: '47', gender: '', birthday: '1979-07-20', hcn: '002117547', diagnosis: 'Fracture of toe', icd10: 'S92.500', comments: '' },
        { name: 'Theresa Mae Deweert', timestamp: '12:30', age: '38', gender: '', birthday: '1988-05-16', hcn: '002380731', diagnosis: 'Edema', icd10: 'R60.9', comments: '' },
        { name: 'Sharise Lynn Petty', timestamp: '12:30', age: '35', gender: '', birthday: '1991-02-26', hcn: '003186178', diagnosis: 'Ankle pain', icd10: 'M25.57', comments: '' },
        { name: 'Adam Eric Russell', timestamp: '10:15', age: '46', gender: '', birthday: '1980-03-29', hcn: '002358091', diagnosis: 'Sacral fracture', icd10: 'S32.100', comments: '' },
        { name: 'Maricel Santos', timestamp: '12:30', age: '40', gender: '', birthday: '1986-04-10', hcn: '003155926', diagnosis: 'Acute seborrheic dermatitis', icd10: 'L21.9', comments: '' },
      ],
    },
    {
      sheetName: 'Aug 19, 2026',
      patients: [
        { name: 'Brittany Adriana Mai', timestamp: '18:00', age: '40', gender: '', birthday: '1985-09-07', hcn: '002976934', diagnosis: 'Foreign body', icd10: '', comments: '' },
        { name: 'Jennifer Kristine Hobbis', timestamp: '18:00', age: '50', gender: '', birthday: '1976-03-10', hcn: '002536233', diagnosis: 'Prescription refill', icd10: 'Z76.0', comments: '' },
        { name: 'Trevor Noseworthy', timestamp: '18:15', age: '42', gender: '', birthday: '1984-07-19', hcn: '003115516', diagnosis: 'Abdominal pain', icd10: 'R10.4', comments: '?Appendicitis' },
        { name: 'Shane Percy Wolfe', timestamp: '18:00', age: '48', gender: '', birthday: '1977-10-03', hcn: '003116332', diagnosis: 'Alcohol intoxication', icd10: 'F10.0', comments: '' },
        { name: 'Myles Nicholas Maynard', timestamp: '18:45', age: '4', gender: '', birthday: '2022-06-22', hcn: '9695618729', diagnosis: 'Laceration', icd10: 'T14.1', comments: '' },
        { name: 'Chantelle Marie Williams', timestamp: '18:45', age: '37', gender: '', birthday: '1988-09-21', hcn: '002824910', diagnosis: 'Seizure', icd10: 'R56.88', comments: 'Seizure/etoh withdrawal' },
        { name: 'Bryson Roin Joseph MacDougall', timestamp: '18:45', age: '13', gender: '', birthday: '2013-03-10', hcn: '002928422', diagnosis: 'Pharyngitis', icd10: 'J02.9', comments: '' },
        { name: 'Riley Rebecca Marie Neumann', timestamp: '19:30', age: '7', gender: '', birthday: '2019-02-26', hcn: '003047487', diagnosis: '', icd10: '', comments: '' },
        { name: 'Ethan Thomas Robinson', timestamp: '20:00', age: '30', gender: '', birthday: '1996-07-15', hcn: '002622629', diagnosis: 'Haematemesis', icd10: 'K92.0', comments: '' },
        { name: 'Jasper Alexander Anderson', timestamp: '18:45', age: '9', gender: '', birthday: '2016-10-21', hcn: '003000395', diagnosis: 'Fracture of radius and ulna', icd10: 'S52.700', comments: '' },
        { name: 'Fred Sr. Jackson', timestamp: '21:00', age: '81', gender: '', birthday: '1945-06-14', hcn: '002216638', diagnosis: 'Epistaxis', icd10: 'R04.0', comments: '' },
        { name: 'Kevin Belcourt', timestamp: '19:30', age: '64', gender: '', birthday: '1961-09-13', hcn: '002710283', diagnosis: 'Motor vehicle accident', icd10: 'V89.2', comments: '' },
        { name: 'Brooke Maruskie', timestamp: '19:30', age: '51', gender: '', birthday: '1974-08-31', hcn: '', diagnosis: 'Motor vehicle accident', icd10: 'V89.2', comments: '' },
        { name: 'Shruti Shruti', timestamp: '20:45', age: '31', gender: '', birthday: '1995-07-10', hcn: '003216660', diagnosis: 'Abscess', icd10: 'L02.9', comments: '' },
        { name: 'Clyde Beaudoin', timestamp: '20:45', age: '75', gender: '', birthday: '1951-03-05', hcn: '002596336', diagnosis: 'Hypertension', icd10: 'I10.0', comments: '' },
        { name: 'Ardeth Austin Evans', timestamp: '21:00', age: '47', gender: '', birthday: '1978-11-28', hcn: '002999662', diagnosis: 'Cellulitis', icd10: 'L03.9', comments: '' },
        { name: 'Joanna Margaret Fletcher', timestamp: '22:30', age: '51', gender: '', birthday: '1974-09-05', hcn: '002059376', diagnosis: 'UTI (urinary tract infection)', icd10: 'N39.0', comments: '' },
        { name: 'Kimberley Anne Thornton', timestamp: '22:30', age: '47', gender: '', birthday: '1978-11-06', hcn: '9864295264', diagnosis: 'Encounter for removal of sutur', icd10: 'Z48.0', comments: '' },
        { name: 'Byron Robert Wagner', timestamp: '22:30', age: '44', gender: '', birthday: '1982-05-21', hcn: '002718864', diagnosis: 'Pharyngitis', icd10: 'J02.9', comments: '' },
        { name: 'Roger Albert Ellis', timestamp: '22:30', age: '77', gender: '', birthday: '1948-12-02', hcn: '002231165', diagnosis: 'Upper respiratory infection', icd10: 'J06.9', comments: '' },
      ],
    },
    {
      sheetName: 'Aug 20, 2026',
      patients: [
        { name: 'Valerie Blanche Dawson', timestamp: '13:15', age: '65', gender: '', birthday: '1960-12-30', hcn: '002012615', diagnosis: 'Nausea & vomiting', icd10: 'R11.3', comments: '' },
        { name: 'Paul Cameron Christensen', timestamp: '13:30', age: '61', gender: '', birthday: '1965-06-04', hcn: '002060754', diagnosis: 'Abdominal pain', icd10: 'R10.4', comments: '' },
        { name: 'Roger Beauchemin', timestamp: '13:15', age: '66', gender: '', birthday: '1960-02-15', hcn: '002417491', diagnosis: 'Altered level of consciousness', icd10: 'R41.88', comments: 'Altered LOC/Fever' },
        { name: 'Vianna Arabette Mahilum', timestamp: '14:00', age: '8', gender: '', birthday: '2018-02-03', hcn: '003027406', diagnosis: 'Upper respiratory infection', icd10: 'J06.9', comments: '' },
        { name: 'Ivony Mahilum', timestamp: '13:45', age: '43', gender: '', birthday: '1983-02-02', hcn: '002604619', diagnosis: 'Upper respiratory infection', icd10: 'J06.9', comments: '' },
        { name: 'Deborah Lucille Porter', timestamp: '13:45', age: '64', gender: '', birthday: '1961-08-28', hcn: '002196129', diagnosis: 'Alcohol intoxication', icd10: 'F10.0', comments: '' },
        { name: 'Emilio Atlas Cote', timestamp: '14:15', age: '12mo', gender: '', birthday: '2025-08-13', hcn: '003200474', diagnosis: 'Fever', icd10: 'R50.9', comments: '' },
        { name: 'Jessi Boyd Birnie', timestamp: '16:30', age: '46', gender: '', birthday: '1980-06-01', hcn: '002191450', diagnosis: 'Bizarre behavior', icd10: 'R46.2', comments: '' },
        { name: 'Daniel Curtis Whalen', timestamp: '14:15', age: '28', gender: '', birthday: '1998-01-15', hcn: '002659837', diagnosis: 'Opiate overdose', icd10: 'T40.6', comments: '' },
        { name: 'Douglas James Jr. Low', timestamp: '15:15', age: '62', gender: '', birthday: '1964-02-06', hcn: '002259521', diagnosis: 'Blood in faeces', icd10: 'K92.1', comments: '' },
        { name: 'Louis Kirk Blake', timestamp: '15:15', age: '55', gender: '', birthday: '1970-09-06', hcn: '002115855', diagnosis: 'Back pain', icd10: 'M54.9', comments: '' },
        { name: 'Brooklyn Nadia Cornell-Allison', timestamp: '15:45', age: '16', gender: '', birthday: '2010-04-01', hcn: '002863868', diagnosis: 'Abdominal pain', icd10: 'R10.4', comments: '' },
        { name: 'Nathaniel Benjamin Thompson', timestamp: '15:45', age: '34', gender: '', birthday: '1992-07-13', hcn: '650194810', diagnosis: 'Chest wall contusion', icd10: 'S20.2', comments: '' },
        { name: 'Andrea Benoit Cardinal', timestamp: '17:30', age: '42', gender: '', birthday: '1983-10-04', hcn: '002919439', diagnosis: 'Chest pain', icd10: 'R07.4', comments: '' },
        { name: 'Husanpreet Kaur', timestamp: '16:00', age: '31', gender: '', birthday: '1994-11-27', hcn: '003055241', diagnosis: 'Acute hip pain', icd10: 'M25.55', comments: '' },
        { name: 'Davinder Singh', timestamp: '15:45', age: '32', gender: '', birthday: '1993-11-21', hcn: '003149259', diagnosis: 'Acute chest wall pain', icd10: 'R07.3', comments: '' },
        { name: 'Rosalie Joy Brown', timestamp: '17:30', age: '75', gender: '', birthday: '1950-12-08', hcn: '002045821', diagnosis: 'Back pain', icd10: 'M54.9', comments: '' },
      ],
    },
    {
      sheetName: 'Aug 21, 2026',
      patients: [
        { name: 'Jerilee Dennis', timestamp: '11:15', age: '40', gender: '', birthday: '1986-08-02', hcn: '002308831', diagnosis: 'Acute alcoholic hepatitis', icd10: 'K70.1', comments: '' },
        { name: 'Evynn Nevaeh Joy Mchugh', timestamp: '11:15', age: '10', gender: '', birthday: '2015-11-19', hcn: '002983203', diagnosis: 'Parapneumonic effusion', icd10: 'J18.9', comments: '' },
        { name: 'Murray Alexander Nichols', timestamp: '11:15', age: '78', gender: '', birthday: '1948-01-16', hcn: '002079754', diagnosis: 'Behavioral and psychological symptoms of dementia', icd10: 'F03', comments: 'BPSD/Delirium' },
        { name: 'Janice Carol Forde', timestamp: '11:15', age: '78', gender: '', birthday: '1947-11-14', hcn: '002452654', diagnosis: 'Fracture, hip', icd10: 'S72.090', comments: 'L trochanteric #' },
        { name: 'Shanon Louise Cooper', timestamp: '12:15', age: '77', gender: '', birthday: '1949-01-13', hcn: '002011609', diagnosis: 'Acute leg pain', icd10: 'M79.61', comments: '' },
        { name: 'Mila Josie Angela Porco', timestamp: '15:45', age: '4', gender: '', birthday: '2022-06-25', hcn: '003119302', diagnosis: 'Laceration', icd10: 'T14.1', comments: '' },
        { name: 'Natalia Simcoe', timestamp: '12:15', age: '92', gender: '', birthday: '1934-07-12', hcn: '002854834', diagnosis: 'Hallucination', icd10: 'R44.3', comments: 'FTT/Hallucinations' },
        { name: 'Judith Lorraine Jowett', timestamp: '12:15', age: '67', gender: '', birthday: '1959-01-26', hcn: '003198496', diagnosis: 'Chest pain', icd10: 'R07.4', comments: '' },
        { name: 'Luna Averie Villacorta-Jim', timestamp: '13:30', age: '9', gender: '', birthday: '2016-11-17', hcn: '003002326', diagnosis: 'Abdominal pain', icd10: 'R10.4', comments: '' },
        { name: 'Amie Arlette Angel', timestamp: '13:30', age: '39', gender: '', birthday: '1987-03-25', hcn: '002998102', diagnosis: 'Chest pain', icd10: 'R07.4', comments: '' },
        { name: 'Jody Lynn Dick', timestamp: '12:15', age: '39', gender: '', birthday: '1987-03-18', hcn: '002333888', diagnosis: 'Back pain / Alcoholic gastritis', icd10: 'M54.9 / K29.2', comments: '' },
        { name: 'Elizabeth Ann Baker', timestamp: '13:30', age: '66', gender: '', birthday: '1960-03-30', hcn: '002183580', diagnosis: 'Cellulitis', icd10: 'L03.9', comments: '' },
        { name: 'Cassius Rocco Kostas Cecco', timestamp: '15:45', age: '3mo', gender: '', birthday: '2026-05-16', hcn: '003216652', diagnosis: 'Head injury', icd10: 'S09.9', comments: '' },
        { name: 'Inwoo Yu', timestamp: '15:45', age: '24', gender: '', birthday: '2002-08-09', hcn: '003204534', diagnosis: 'Otalgia', icd10: 'H92.0', comments: '' },
        { name: 'Jennifer Lynne Frair', timestamp: '15:45', age: '68', gender: '', birthday: '1957-10-01', hcn: '002089290', diagnosis: 'Contusion', icd10: 'T14.0', comments: '' },
      ],
    },
    {
      sheetName: 'Aug 22, 2026',
      patients: [
        { name: 'Leona Marie Arey', timestamp: '20:30', age: '41', gender: '', birthday: '1985-06-07', hcn: '003175841', diagnosis: 'Suicidal ideation', icd10: 'R45.8', comments: 'suicidal ideation (voluntary)' },
        { name: 'Gordon Daniel Ennis', timestamp: '23:00', age: '52', gender: '', birthday: '1973-12-24', hcn: '002214427', diagnosis: 'Subconjunctival haemorrhage', icd10: 'H11.3', comments: '' },
        { name: 'Reuben Edgar Ryan', timestamp: '23:15', age: '62', gender: '', birthday: '1964-03-13', hcn: '9015341754', diagnosis: 'Abscess', icd10: 'L02.9', comments: '' },
        { name: 'Mark Henry Penner', timestamp: '00:15', age: '51', gender: '', birthday: '1975-04-22', hcn: '002973378', diagnosis: 'Achilles bursitis', icd10: 'M76.6', comments: '' },
        { name: 'Deneese Faith Perey', timestamp: '00:15', age: '22', gender: '', birthday: '2003-12-11', hcn: '118686438', diagnosis: 'Minor head injury', icd10: 'S09.9', comments: '' },
        { name: 'Zacharius Hunter Peacock', timestamp: '00:15', age: '22', gender: '', birthday: '2003-12-11', hcn: '002754240', diagnosis: 'Contusion', icd10: 'T14.0', comments: '' },
        { name: 'Charlotte Amanda Reid', timestamp: '01:15', age: '11', gender: '', birthday: '2014-10-03', hcn: '003036282', diagnosis: 'Head injury', icd10: 'S09.9', comments: '' },
        { name: 'Santana Charlie', timestamp: '01:30', age: '34', gender: '', birthday: '1991-10-19', hcn: '002481653', diagnosis: 'Head injury', icd10: 'S09.9', comments: '' },
        { name: 'Ingrid Louise Isaac', timestamp: '23:00', age: '56', gender: '', birthday: '1970-03-16', hcn: '002724722', diagnosis: 'Abdominal pain', icd10: 'R10.4', comments: '' },
        { name: 'Clifford Andrew Mills', timestamp: '03:00', age: '66', gender: '', birthday: '1959-11-21', hcn: '002589745', diagnosis: 'Hematuria', icd10: 'R31.8', comments: 'Renal Tumour' },
        { name: 'Deanna Chiyo Peter-Profeit', timestamp: '03:00', age: '34', gender: '', birthday: '1991-09-25', hcn: '002496719', diagnosis: 'Ankle sprain', icd10: 'S93.49', comments: '' },
        { name: 'Thalina Grace Andersen', timestamp: '03:00', age: '15', gender: '', birthday: '2011-01-03', hcn: '003057197', diagnosis: 'Laceration', icd10: 'T14.1', comments: '' },
        { name: 'Abraham Angus Alexie', timestamp: '01:15', age: '81', gender: '', birthday: '1944-12-03', hcn: '002907889', diagnosis: 'Altered level of consciousness', icd10: 'R41.88', comments: '' },
      ],
    },
    {
      sheetName: 'Aug 23, 2026',
      patients: [
        { name: 'Cheryl May Washpan', timestamp: '01:45', age: '28', gender: '', birthday: '1997-10-27', hcn: '002655538', diagnosis: 'Abdominal pain', icd10: 'R10.4', comments: 'Abdominal pain' },
        { name: 'Ethan Jace Tungol', timestamp: '03:00', age: '3', gender: '', birthday: '2023-05-22', hcn: '003190139', diagnosis: '', icd10: '', comments: '' },
        { name: 'Omar Sonko', timestamp: '02:45', age: '42', gender: '', birthday: '1983-12-04', hcn: '', diagnosis: 'Assault', icd10: 'Y09', comments: 'Bilateral hand lacerations' },
        { name: 'Dieu Donne Mugisha', timestamp: '04:45', age: '35', gender: '', birthday: '1991-03-21', hcn: '747061171', diagnosis: 'Laceration', icd10: 'T14.1', comments: '' },
        { name: 'Isiah Timothy Hynick', timestamp: '04:30', age: '26', gender: '', birthday: '2000-08-07', hcn: '0010902872', diagnosis: 'Assault', icd10: 'Y09', comments: '' },
        { name: 'Katie Mcleod-Wierda', timestamp: '06:00', age: '18', gender: '', birthday: '2007-09-19', hcn: '002816775', diagnosis: 'Assault', icd10: 'Y09', comments: '' },
        { name: 'Kris Elizabeth Bruneau', timestamp: '07:30', age: '59', gender: '', birthday: '1967-03-18', hcn: '002457844', diagnosis: 'Insomnia', icd10: 'G47.0', comments: '' },
      ],
    },
  ],
};

function makePatient(p: ImportPatient, sheetName: string, rowIndex: number): Patient {
  return {
    rowIndex,
    sheetName,
    patientNum: '',
    timestamp: p.timestamp,
    name: p.name,
    age: p.age,
    gender: p.gender,
    birthday: p.birthday,
    hcn: p.hcn,
    mrn: '',
    diagnosis: p.diagnosis,
    icd9: '',
    icd10: p.icd10,
    visitProcedure: '',
    procCode: '',
    fee: '',
    unit: '',
    total: '',
    comments: p.comments || '',
    triageVitals: '',
    transcript: '',
    additional: '',
    ddx: '',
    investigations: '',
    hpi: '',
    objective: '',
    assessmentPlan: '',
    referral: '',
    pastDocs: '',
    synopsis: '',
    management: '',
    evidence: '',
    apNotes: '',
    clinicalQA: '',
    education: '',
    encounterNotes: '',
    admission: '',
    profile: '',
    room: '',
    audioBackup: '',
    status: 'new',
  } as Patient;
}

// POST /api/clear-and-reimport
// Force-clears Aug 18-23 in Drive + Sheets, then reimports 95 patients.
// The clear writes an empty sheet directly without reading first — this handles
// cases where the Drive file is unreadable (wrong encryption key from prior import).
export async function POST(_req: NextRequest) {
  try {
    const ctx = await getDataContext();
    const clearResults: string[] = [];
    const importResults: string[] = [];

    // ── Step 1: Force-clear ──────────────────────────────────────────────────
    // Write empty sheets directly — bypasses decryption so unreadable files get overwritten
    for (const sheetName of CLEAR_DATES) {
      try {
        if (ctx.drive) {
          const empty = emptyDateSheet(sheetName);
          await saveDateSheetToDrive(ctx.drive, empty);
          clearResults.push(`Drive ${sheetName}: force-cleared`);
        }

        // Clear Sheets rows 8-200
        const { sheets, spreadsheetId } = ctx.sheets;
        const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
        const sheetExists = spreadsheet.data.sheets?.some(
          (s: any) => s.properties?.title === sheetName
        );
        if (sheetExists) {
          await sheets.spreadsheets.values.clear({
            spreadsheetId,
            range: `'${sheetName}'!A8:AJ200`,
          });
          clearResults.push(`Sheets ${sheetName}: rows 8-200 cleared`);
        } else {
          clearResults.push(`Sheets ${sheetName}: sheet not found`);
        }
      } catch (e: any) {
        clearResults.push(`ERROR clearing ${sheetName}: ${e?.message}`);
      }
    }

    // ── Step 2: Reimport ─────────────────────────────────────────────────────
    let totalImported = 0;

    for (const day of IMPORT_DATA.days) {
      const { sheetName, patients } = day;
      if (!sheetName || !patients?.length) continue;

      await getOrCreateDateSheet(ctx, sheetName);

      for (const p of patients) {
        const rowIndex = await getNextRowIndex(ctx, sheetName);
        const patient = makePatient(p, sheetName, rowIndex);

        try {
          const fields: Record<string, string> = {};
          for (const [k, v] of Object.entries(patient)) {
            if (typeof v === 'string') fields[k] = v;
          }

          await updatePatientFields(ctx, rowIndex, fields, sheetName, patient.name);

          // Always write to Sheets for import reliability
          const gs = await import('@/lib/google-sheets');
          await gs.updatePatientFields(ctx.sheets, rowIndex, fields, sheetName);

          totalImported++;
        } catch (e: any) {
          console.error(`[clear-and-reimport] Failed ${p.name}:`, e?.message);
          importResults.push(`FAILED: ${p.name} - ${e?.message}`);
        }
      }

      importResults.push(`${sheetName}: ${patients.length} patients imported`);
    }

    console.log(`[clear-and-reimport] Done. Imported ${totalImported} patients.`);
    return NextResponse.json({
      success: true,
      totalImported,
      clearResults,
      importResults,
    });
  } catch (error: any) {
    console.error('[clear-and-reimport] Error:', error);
    return NextResponse.json({ error: error?.message || 'Failed' }, { status: 500 });
  }
}
