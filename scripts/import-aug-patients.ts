/**
 * Patient data parsed from ED Physician Billing Aug 2026 PDF.
 * Run via: npx ts-node scripts/import-aug-patients.ts
 * Or paste the JSON into browser console with fetch('/api/bulk-import', ...)
 */

function calcAge(dob: string, visitDate: string): string {
  const [dd, mm, yyyy] = dob.split('/').map(Number);
  const birth = new Date(yyyy, mm - 1, dd);
  const visit = new Date(visitDate);
  let age = visit.getFullYear() - birth.getFullYear();
  const m = visit.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && visit.getDate() < birth.getDate())) age--;
  if (age < 2) {
    const months = (visit.getFullYear() - birth.getFullYear()) * 12 + visit.getMonth() - birth.getMonth();
    return `${months}mo`;
  }
  return String(age);
}

function formatDOB(dob: string): string {
  // Convert DD/MM/YYYY to YYYY-MM-DD
  const [dd, mm, yyyy] = dob.split('/');
  return `${yyyy}-${mm}-${dd}`;
}

function p(name: string, dob: string, hcn: string, time: string, diagnosis: string, icd10: string, comments = '', visitDate = '2026-08-18') {
  return {
    name,
    timestamp: time,
    age: calcAge(dob, visitDate),
    gender: '',
    birthday: formatDOB(dob),
    hcn,
    diagnosis,
    icd10,
    comments,
  };
}

const aug18 = [
  p('Molloy, Scarlet', '10/09/1989', '002429710', '0:35', 'First trimester bleeding', 'O20.903', 'Ectopic pregnancy (?)'),
  p('Carlick, Yolanda Yvette', '06/09/1980', '002558559', '1:16', 'Back pain', 'M54.9'),
  p('Douville, Cody Robert Charlie', '03/10/1997', '002654705', '2:45', 'Seizure', 'R56.88'),
  p('Dawson, Karen Jacqueline', '23/02/1976', '002258044', '2:52', 'Alcohol abuse', 'F10.1'),
  p('Efosa, Jennifer Oseyi', '23/08/1997', '003176252', '2:59', 'Insomnia', 'G47.0'),
  p('Devellano, Benjamin Frances', '18/11/1983', '002556025', '4:29', 'Cellulitis', 'L03.9'),
  p('Gostick, Lauren Dawne', '15/11/1990', '003074408', '5:49', 'Syncope', 'R55'),
  p('Hajash, Aaren', '12/07/1977', '002269991', '6:55', '', ''),
  p('Daniel, Kristin', '19/01/1983', '002941912', '7:11', 'Contusion', 'T14.0'),
  p('Soucy, Devon', '26/10/1987', '113379736', '7:46', 'Laceration', 'T14.1', 'partial amputation of RD2/3'),
  p('Fisher, Nash Travis', '10/01/2023', '003132255', '8:03', 'Periorbital swelling', 'H57.8'),
  p('Tanner, Jordan Sidney Adam', '04/04/2007', '002807493', '8:08', 'Otitis externa', 'H60.9'),
  p('Chiasson, Brandon Lee', '04/10/2006', '002799427', '8:17', 'MVC (motor vehicle collision)', 'V89.2'),
  p("O'Haver, Clarence Herb", '23/03/1957', '002598365', '8:19', 'Joint pain', 'M25.59'),
  p('Barichello, Rebecca Freda Ann', '18/11/1988', '002420636', '8:25', 'Antepartum bleeding, first tri', 'O20.903'),
  p('De Jager, Kelly', '11/03/1977', '002778959', '8:31', 'Chronic pain', 'R52.2'),
  p('Allen, Erica Maria Ann Lynn', '08/05/1992', '002892990', '8:33', 'Asthma', 'J45.90'),
  p('Patel, Jatin Dineshchandra', '04/02/1992', '003059524', '8:34', 'Pharyngitis', 'J02.9'),
  p('Badley, Warren Allan', '20/07/1979', '002117547', '8:49', 'Fracture of toe', 'S92.500'),
  p('Deweert, Theresa Mae', '16/05/1988', '002380731', '8:55', 'Edema', 'R60.9'),
  p('Petty, Sharise Lynn', '26/02/1991', '003186178', '9:17', 'Ankle pain', 'M25.57'),
  p('Russell, Adam Eric', '29/03/1980', '002358091', '9:49', 'Sacral fracture', 'S32.100'),
  p('Santos, Maricel', '10/04/1986', '003155926', '9:57', 'Acute seborrheic dermatitis', 'L21.9'),
];

const aug19 = [
  p('Mai, Brittany Adriana', '07/09/1985', '002976934', '14:47', 'Foreign body', '', '', '2026-08-19'),
  p('Hobbis, Jennifer Kristine', '10/03/1976', '002536233', '16:57', 'Prescription refill', 'Z76.0', '', '2026-08-19'),
  p('Noseworthy, Trevor', '19/07/1984', '003115516', '17:08', 'Abdominal pain', 'R10.4', '?Appendicitis', '2026-08-19'),
  p('Wolfe, Shane Percy', '03/10/1977', '003116332', '17:15', 'Alcohol intoxication', 'F10.0', '', '2026-08-19'),
  p('Maynard, Myles Nicholas', '22/06/2022', '9695618729', '17:34', 'Laceration', 'T14.1', '', '2026-08-19'),
  p('Williams, Chantelle Marie', '21/09/1988', '002824910', '17:38', 'Seizure', 'R56.88', 'Seizure/etoh withdrawal', '2026-08-19'),
  p('MacDougall, Bryson Roin Joseph', '10/03/2013', '002928422', '17:39', 'Pharyngitis', 'J02.9', '', '2026-08-19'),
  p('Neumann, Riley Rebecca Marie', '26/02/2019', '003047487', '17:57', '', '', '', '2026-08-19'),
  p('Robinson, Ethan Thomas', '15/07/1996', '002622629', '18:05', 'Haematemesis', 'K92.0', '', '2026-08-19'),
  p('Anderson, Jasper Alexander', '21/10/2016', '003000395', '18:18', 'Fracture of radius and ulna', 'S52.700', '', '2026-08-19'),
  p('Jackson, Fred Sr.', '14/06/1945', '002216638', '18:52', 'Epistaxis', 'R04.0', '', '2026-08-19'),
  p('Belcourt, Kevin', '13/09/1961', '002710283', '19:20', 'Motor vehicle accident', 'V89.2', '', '2026-08-19'),
  p('Maruskie, Brooke', '31/08/1974', '', '19:25', 'Motor vehicle accident', 'V89.2', '', '2026-08-19'),
  p('Shruti, Shruti', '10/07/1995', '003216660', '19:33', 'Abscess', 'L02.9', '', '2026-08-19'),
  p('Beaudoin, Clyde', '05/03/1951', '002596336', '19:55', 'Hypertension', 'I10.0', '', '2026-08-19'),
  p('Evans, Ardeth Austin', '28/11/1978', '002999662', '20:43', 'Cellulitis', 'L03.9', '', '2026-08-19'),
  p('Fletcher, Joanna Margaret', '05/09/1974', '002059376', '21:20', 'UTI (urinary tract infection)', 'N39.0', '', '2026-08-19'),
  p('Thornton, Kimberley Anne', '06/11/1978', '9864295264', '21:37', 'Encounter for removal of sutures', 'Z48.0', '', '2026-08-19'),
  p('Wagner, Byron Robert', '21/05/1982', '002718864', '21:56', 'Pharyngitis', 'J02.9', '', '2026-08-19'),
  p('Ellis, Roger Albert', '02/12/1948', '002231165', '22:15', 'Upper respiratory infection', 'J06.9', '', '2026-08-19'),
];

const aug20 = [
  p('Dawson, Valerie Blanche', '30/12/1960', '002012615', '11:47', 'Nausea & vomiting', 'R11.3', '', '2026-08-20'),
  p('Christensen, Paul Cameron', '04/06/1965', '002060754', '11:57', 'Abdominal pain', 'R10.4', '', '2026-08-20'),
  p('Beauchemin, Roger', '15/02/1960', '002417491', '13:03', 'Altered level of consciousness', 'R41.88', 'Altered LOC/Fever', '2026-08-20'),
  p('Mahilum, Vianna Arabette', '03/02/2018', '003027406', '13:17', 'Upper respiratory infection', 'J06.9', '', '2026-08-20'),
  p('Mahilum, Ivony', '02/02/1983', '002604619', '13:19', 'Upper respiratory infection', 'J06.9', '', '2026-08-20'),
  p('Porter, Deborah Lucille', '28/08/1961', '002196129', '13:30', 'Alcohol intoxication', 'F10.0', '', '2026-08-20'),
  p('Cote, Emilio Atlas', '13/08/2025', '003200474', '13:32', 'Fever', 'R50.9', '', '2026-08-20'),
  p('Birnie, Jessi Boyd', '01/06/1980', '002191450', '13:48', 'Bizarre behavior', 'R46.2', '', '2026-08-20'),
  p('Whalen, Daniel Curtis', '15/01/1998', '002659837', '13:55', 'Opiate overdose', 'T40.6', '', '2026-08-20'),
  p('Low, Douglas James Jr.', '06/02/1964', '002259521', '13:56', 'Blood in faeces', 'K92.1', '', '2026-08-20'),
  p('Blake, Louis Kirk', '06/09/1970', '002115855', '14:06', 'Back pain', 'M54.9', '', '2026-08-20'),
  p('Cornell-Allison, Brooklyn Nadia', '01/04/2010', '002863868', '14:30', 'Abdominal pain', 'R10.4', '', '2026-08-20'),
  p('Thompson, Nathaniel Benjamin', '13/07/1992', '650194810', '14:34', 'Chest wall contusion', 'S20.2', '', '2026-08-20'),
  p('Benoit Cardinal, Andrea', '04/10/1983', '002919439', '14:47', 'Chest pain', 'R07.4', '', '2026-08-20'),
  p('Kaur, Husanpreet', '27/11/1994', '003055241', '14:50', 'Acute hip pain', 'M25.55', '', '2026-08-20'),
  p('Davinder Singh, Davinder Singh', '21/11/1993', '003149259', '14:52', 'Acute chest wall pain', 'R07.3', '', '2026-08-20'),
  p('Brown, Rosalie Joy', '08/12/1950', '002045821', '15:52', 'Back pain', 'M54.9', '', '2026-08-20'),
];

const aug21 = [
  p('Dennis, Jerilee', '02/08/1986', '002308831', '9:51', 'Acute alcoholic hepatitis', 'K70.1', '', '2026-08-21'),
  p('Mchugh, Evynn Nevaeh Joy', '19/11/2015', '002983203', '10:14', 'Parapneumonic effusion', 'J18.9', '', '2026-08-21'),
  p('Nichols, Murray Alexander', '16/01/1948', '002079754', '10:25', 'Behavioral and psychological symptoms', 'F03', 'BPSD/Delirium', '2026-08-21'),
  p('Forde, Janice Carol', '14/11/1947', '002452654', '10:26', 'Fracture, hip', 'S72.090', 'L trochanteric #', '2026-08-21'),
  p('Cooper, Shanon Louise', '13/01/1949', '002011609', '10:41', 'Acute leg pain', 'M79.61', '', '2026-08-21'),
  p('Porco, Mila Josie Angela', '25/06/2022', '003119302', '10:55', 'Laceration', 'T14.1', '', '2026-08-21'),
  p('Simcoe, Natalia', '12/07/1934', '002854834', '11:01', 'Hallucination', 'R44.3', 'FTT/Hallucinations', '2026-08-21'),
  p('Jowett, Judith Lorraine', '26/01/1959', '003198496', '11:07', 'Chest pain', 'R07.4', '', '2026-08-21'),
  p('Villacorta-Jim, Luna Averie', '17/11/2016', '003002326', '11:07', 'Abdominal pain', 'R10.4', '', '2026-08-21'),
  p('Angel, Amie Arlette', '25/03/1987', '002998102', '11:12', 'Chest pain', 'R07.4', '', '2026-08-21'),
  p('Dick, Jody Lynn', '18/03/1987', '002333888', '11:46', 'Back pain\nAlcoholic gastritis', 'M54.9\nK29.2', '', '2026-08-21'),
  p('Baker, Elizabeth Ann', '30/03/1960', '002183580', '12:49', 'Cellulitis', 'L03.9', '', '2026-08-21'),
  p('Cecco, Cassius Rocco Kostas', '16/05/2026', '003216652', '13:54', 'Head injury', 'S09.9', '', '2026-08-21'),
  p('Yu, Inwoo', '09/08/2002', '003204534', '14:00', 'Otalgia', 'H92.0', '', '2026-08-21'),
  p('Frair, Jennifer Lynne', '01/10/1957', '002089290', '14:13', 'Contusion', 'T14.0', '', '2026-08-21'),
];

const aug22 = [
  p('Arey, Leona Marie', '07/06/1985', '003175841', '16:55', 'Suicidal ideation', 'R45.8', 'suicidal ideation (voluntary)', '2026-08-22'),
  p('Ennis, Gordon Daniel', '24/12/1973', '002214427', '17:20', 'Subconjunctival haemorrhage', 'H11.3', '', '2026-08-22'),
  p('Ryan, Reuben Edgar', '13/03/1964', '9015341754', '17:42', 'Abscess', 'L02.9', '', '2026-08-22'),
  p('Penner, Mark Henry', '22/04/1975', '002973378', '18:23', 'Achilles bursitis', 'M76.6', '', '2026-08-22'),
  p('Perey, Deneese Faith', '11/12/2003', '118686438', '19:03', 'Minor head injury', 'S09.9', '', '2026-08-22'),
  p('Peacock, Zacharius Hunter', '11/12/2003', '002754240', '19:34', 'Contusion', 'T14.0', '', '2026-08-22'),
  p('Reid, Charlotte Amanda', '03/10/2014', '003036282', '19:43', 'Head injury', 'S09.9', '', '2026-08-22'),
  p('Charlie, Santana', '19/10/1991', '002481653', '20:10', 'Head injury', 'S09.9', '', '2026-08-22'),
  p('Isaac, Ingrid Louise', '16/03/1970', '002724722', '21:32', 'Abdominal pain', 'R10.4', '', '2026-08-22'),
  p('Mills, Clifford Andrew', '21/11/1959', '002589745', '21:36', 'Hematuria', 'R31.8', 'Renal Tumour', '2026-08-22'),
  p('Peter-Profeit, Deanna Chiyo', '25/09/1991', '002496719', '21:40', 'Ankle sprain', 'S93.49', '', '2026-08-22'),
  p('Andersen, Thalina Grace', '03/01/2011', '003057197', '22:09', 'Laceration', 'T14.1', '', '2026-08-22'),
  p('Alexie, Abraham Angus', '03/12/1944', '002907889', '22:15', 'Altered level of consciousness', 'R41.88', '', '2026-08-22'),
];

const aug23 = [
  p('Washpan, Cheryl May', '27/10/1997', '002655538', '0:51', 'Abdominal pain', 'R10.4', 'Abdominal pain', '2026-08-23'),
  p('Tungol, Ethan Jace', '22/05/2023', '003190139', '1:57', '', '', '', '2026-08-23'),
  p('Sonko, Omar', '04/12/1983', '', '2:03', 'Assault', 'Y09', 'Bilateral hand lacerations', '2026-08-23'),
  p('Mugisha, Dieu Donne', '21/03/1991', '747061171', '4:00', 'Laceration', 'T14.1', '', '2026-08-23'),
  p('Hynick, Isiah Timothy', '07/08/2000', '0010902872', '4:03', 'Assault', 'Y09', '', '2026-08-23'),
  p('Mcleod-Wierda, Katie', '19/09/2007', '002816775', '4:43', 'Assault', 'Y09', '', '2026-08-23'),
  p('Bruneau, Kris Elizabeth', '18/03/1967', '002457844', '5:39', 'Insomnia', 'G47.0', '', '2026-08-23'),
];

export const IMPORT_DATA = {
  days: [
    { sheetName: 'Aug 18, 2026', patients: aug18 },
    { sheetName: 'Aug 19, 2026', patients: aug19 },
    { sheetName: 'Aug 20, 2026', patients: aug20 },
    { sheetName: 'Aug 21, 2026', patients: aug21 },
    { sheetName: 'Aug 22, 2026', patients: aug22 },
    { sheetName: 'Aug 23, 2026', patients: aug23 },
  ],
};

// Total: 23 + 20 + 17 + 15 + 13 + 7 = 95 patients
console.log('Total patients:', IMPORT_DATA.days.reduce((s, d) => s + d.patients.length, 0));
console.log(JSON.stringify(IMPORT_DATA));
