/**
 * Patient data from ED_Physician_Billing_18-23_Aug_2026.xlsx
 * Source fields: name, birthdate, HCN, discharge problem, time seen by provider (rounded to nearest 15 min)
 * Run via browser console: paste this file, then run the fetch at the bottom
 */

const aug18 = [
  {
    "name": "Molloy, Scarlet",
    "timestamp": "04:15",
    "age": "36",
    "gender": "",
    "birthday": "1989-09-10",
    "hcn": "002429710",
    "diagnosis": "First trimester bleeding",
    "icd10": "O20.903",
    "comments": "Ectopic pregnancy (?)"
  },
  {
    "name": "Carlick, Yolanda Yvette",
    "timestamp": "06:00",
    "age": "45",
    "gender": "",
    "birthday": "1980-09-06",
    "hcn": "002558559",
    "diagnosis": "Back pain",
    "icd10": "M54.9",
    "comments": ""
  },
  {
    "name": "Douville, Cody Robert Charlie",
    "timestamp": "08:00",
    "age": "28",
    "gender": "",
    "birthday": "1997-10-03",
    "hcn": "002654705",
    "diagnosis": "Seizure",
    "icd10": "R56.88",
    "comments": ""
  },
  {
    "name": "Dawson, Karen Jacqueline",
    "timestamp": "08:45",
    "age": "50",
    "gender": "",
    "birthday": "1976-02-23",
    "hcn": "002258044",
    "diagnosis": "Alcohol abuse",
    "icd10": "F10.1",
    "comments": ""
  },
  {
    "name": "Efosa, Jennifer Oseyi",
    "timestamp": "08:45",
    "age": "28",
    "gender": "",
    "birthday": "1997-08-23",
    "hcn": "003176252",
    "diagnosis": "Insomnia",
    "icd10": "G47.0",
    "comments": ""
  },
  {
    "name": "Devellano, Benjamin Frances",
    "timestamp": "08:45",
    "age": "42",
    "gender": "",
    "birthday": "1983-11-18",
    "hcn": "002556025",
    "diagnosis": "Cellulitis",
    "icd10": "L03.9",
    "comments": ""
  },
  {
    "name": "Gostick, Lauren Dawne",
    "timestamp": "09:30",
    "age": "35",
    "gender": "",
    "birthday": "1990-11-15",
    "hcn": "003074408",
    "diagnosis": "Syncope",
    "icd10": "R55",
    "comments": ""
  },
  {
    "name": "Hajash, Aaren",
    "timestamp": "11:15",
    "age": "49",
    "gender": "",
    "birthday": "1977-07-12",
    "hcn": "002269991",
    "diagnosis": "",
    "icd10": "",
    "comments": ""
  },
  {
    "name": "Daniel, Kristin",
    "timestamp": "09:30",
    "age": "43",
    "gender": "",
    "birthday": "1983-01-19",
    "hcn": "002941912",
    "diagnosis": "Contusion",
    "icd10": "T14.0",
    "comments": ""
  },
  {
    "name": "Soucy, Devon",
    "timestamp": "08:00",
    "age": "38",
    "gender": "",
    "birthday": "1987-10-26",
    "hcn": "113379736",
    "diagnosis": "Laceration",
    "icd10": "T14.1",
    "comments": "partial amputation of RD2/3"
  },
  {
    "name": "Fisher, Nash Travis",
    "timestamp": "11:15",
    "age": "3",
    "gender": "",
    "birthday": "2023-01-10",
    "hcn": "003132255",
    "diagnosis": "Periorbital swelling",
    "icd10": "H57.8",
    "comments": ""
  },
  {
    "name": "Tanner, Jordan Sidney Adam",
    "timestamp": "11:15",
    "age": "19",
    "gender": "",
    "birthday": "2007-04-04",
    "hcn": "002807493",
    "diagnosis": "Otitis externa",
    "icd10": "H60.9",
    "comments": ""
  },
  {
    "name": "Chiasson, Brandon Lee",
    "timestamp": "10:15",
    "age": "19",
    "gender": "",
    "birthday": "2006-10-04",
    "hcn": "002799427",
    "diagnosis": "MVC (motor vehicle collision)",
    "icd10": "V89.2",
    "comments": ""
  },
  {
    "name": "O'Haver, Clarence Herb",
    "timestamp": "11:15",
    "age": "69",
    "gender": "",
    "birthday": "1957-03-23",
    "hcn": "002598365",
    "diagnosis": "Joint pain",
    "icd10": "M25.59",
    "comments": ""
  },
  {
    "name": "Barichello, Rebecca Freda Ann",
    "timestamp": "09:30",
    "age": "37",
    "gender": "",
    "birthday": "1988-11-18",
    "hcn": "002420636",
    "diagnosis": "Antepartum bleeding, first tri",
    "icd10": "O20.903",
    "comments": ""
  },
  {
    "name": "De Jager, Kelly",
    "timestamp": "11:15",
    "age": "49",
    "gender": "",
    "birthday": "1977-03-11",
    "hcn": "002778959",
    "diagnosis": "Chronic pain",
    "icd10": "R52.2",
    "comments": ""
  },
  {
    "name": "Allen, Erica Maria Ann Lynn",
    "timestamp": "11:45",
    "age": "34",
    "gender": "",
    "birthday": "1992-05-08",
    "hcn": "002892990",
    "diagnosis": "Asthma",
    "icd10": "J45.90",
    "comments": ""
  },
  {
    "name": "Patel, Jatin Dineshchandra",
    "timestamp": "11:45",
    "age": "34",
    "gender": "",
    "birthday": "1992-02-04",
    "hcn": "003059524",
    "diagnosis": "Pharyngitis",
    "icd10": "J02.9",
    "comments": ""
  },
  {
    "name": "Badley, Warren Allan",
    "timestamp": "11:45",
    "age": "47",
    "gender": "",
    "birthday": "1979-07-20",
    "hcn": "002117547",
    "diagnosis": "Fracture of toe",
    "icd10": "S92.500",
    "comments": ""
  },
  {
    "name": "Deweert, Theresa Mae",
    "timestamp": "12:30",
    "age": "38",
    "gender": "",
    "birthday": "1988-05-16",
    "hcn": "002380731",
    "diagnosis": "Edema",
    "icd10": "R60.9",
    "comments": ""
  },
  {
    "name": "Petty, Sharise Lynn",
    "timestamp": "12:30",
    "age": "35",
    "gender": "",
    "birthday": "1991-02-26",
    "hcn": "003186178",
    "diagnosis": "Ankle pain",
    "icd10": "M25.57",
    "comments": ""
  },
  {
    "name": "Russell, Adam Eric",
    "timestamp": "10:15",
    "age": "46",
    "gender": "",
    "birthday": "1980-03-29",
    "hcn": "002358091",
    "diagnosis": "Sacral fracture",
    "icd10": "S32.100",
    "comments": ""
  },
  {
    "name": "Santos, Maricel",
    "timestamp": "12:30",
    "age": "40",
    "gender": "",
    "birthday": "1986-04-10",
    "hcn": "003155926",
    "diagnosis": "Acute seborrheic dermatitis",
    "icd10": "L21.9",
    "comments": ""
  }
];

const aug19 = [
  {
    "name": "Mai, Brittany Adriana",
    "timestamp": "18:00",
    "age": "40",
    "gender": "",
    "birthday": "1985-09-07",
    "hcn": "002976934",
    "diagnosis": "Foreign body",
    "icd10": "",
    "comments": ""
  },
  {
    "name": "Hobbis, Jennifer Kristine",
    "timestamp": "18:00",
    "age": "50",
    "gender": "",
    "birthday": "1976-03-10",
    "hcn": "002536233",
    "diagnosis": "Prescription refill",
    "icd10": "Z76.0",
    "comments": ""
  },
  {
    "name": "Noseworthy, Trevor",
    "timestamp": "18:15",
    "age": "42",
    "gender": "",
    "birthday": "1984-07-19",
    "hcn": "003115516",
    "diagnosis": "Abdominal pain",
    "icd10": "R10.4",
    "comments": "?Appendicitis"
  },
  {
    "name": "Wolfe, Shane Percy",
    "timestamp": "18:00",
    "age": "48",
    "gender": "",
    "birthday": "1977-10-03",
    "hcn": "003116332",
    "diagnosis": "Alcohol intoxication",
    "icd10": "F10.0",
    "comments": ""
  },
  {
    "name": "Maynard, Myles Nicholas",
    "timestamp": "18:45",
    "age": "4",
    "gender": "",
    "birthday": "2022-06-22",
    "hcn": "9695618729",
    "diagnosis": "Laceration",
    "icd10": "T14.1",
    "comments": ""
  },
  {
    "name": "Williams, Chantelle Marie",
    "timestamp": "18:45",
    "age": "37",
    "gender": "",
    "birthday": "1988-09-21",
    "hcn": "002824910",
    "diagnosis": "Seizure",
    "icd10": "R56.88",
    "comments": "Seizure/etoh withdrawal"
  },
  {
    "name": "MacDougall, Bryson Roin Joseph",
    "timestamp": "18:45",
    "age": "13",
    "gender": "",
    "birthday": "2013-03-10",
    "hcn": "002928422",
    "diagnosis": "Pharyngitis",
    "icd10": "J02.9",
    "comments": ""
  },
  {
    "name": "Neumann, Riley Rebecca Marie",
    "timestamp": "19:30",
    "age": "7",
    "gender": "",
    "birthday": "2019-02-26",
    "hcn": "003047487",
    "diagnosis": "",
    "icd10": "",
    "comments": ""
  },
  {
    "name": "Robinson, Ethan Thomas",
    "timestamp": "20:00",
    "age": "30",
    "gender": "",
    "birthday": "1996-07-15",
    "hcn": "002622629",
    "diagnosis": "Haematemesis",
    "icd10": "K92.0",
    "comments": ""
  },
  {
    "name": "Anderson, Jasper Alexander",
    "timestamp": "18:45",
    "age": "9",
    "gender": "",
    "birthday": "2016-10-21",
    "hcn": "003000395",
    "diagnosis": "Fracture of radius and ulna",
    "icd10": "S52.700",
    "comments": ""
  },
  {
    "name": "Jackson, Fred Sr.",
    "timestamp": "21:00",
    "age": "81",
    "gender": "",
    "birthday": "1945-06-14",
    "hcn": "002216638",
    "diagnosis": "Epistaxis",
    "icd10": "R04.0",
    "comments": ""
  },
  {
    "name": "Belcourt, Kevin",
    "timestamp": "19:30",
    "age": "64",
    "gender": "",
    "birthday": "1961-09-13",
    "hcn": "002710283",
    "diagnosis": "Motor vehicle accident",
    "icd10": "V89.2",
    "comments": ""
  },
  {
    "name": "Maruskie, Brooke",
    "timestamp": "19:30",
    "age": "51",
    "gender": "",
    "birthday": "1974-08-31",
    "hcn": "",
    "diagnosis": "Motor vehicle accident",
    "icd10": "V89.2",
    "comments": ""
  },
  {
    "name": "Shruti, Shruti",
    "timestamp": "20:45",
    "age": "31",
    "gender": "",
    "birthday": "1995-07-10",
    "hcn": "003216660",
    "diagnosis": "Abscess",
    "icd10": "L02.9",
    "comments": ""
  },
  {
    "name": "Beaudoin, Clyde",
    "timestamp": "20:45",
    "age": "75",
    "gender": "",
    "birthday": "1951-03-05",
    "hcn": "002596336",
    "diagnosis": "Hypertension",
    "icd10": "I10.0",
    "comments": ""
  },
  {
    "name": "Evans, Ardeth Austin",
    "timestamp": "21:00",
    "age": "47",
    "gender": "",
    "birthday": "1978-11-28",
    "hcn": "002999662",
    "diagnosis": "Cellulitis",
    "icd10": "L03.9",
    "comments": ""
  },
  {
    "name": "Fletcher, Joanna Margaret",
    "timestamp": "22:30",
    "age": "51",
    "gender": "",
    "birthday": "1974-09-05",
    "hcn": "002059376",
    "diagnosis": "UTI (urinary tract infection)",
    "icd10": "N39.0",
    "comments": ""
  },
  {
    "name": "Thornton, Kimberley Anne",
    "timestamp": "22:30",
    "age": "47",
    "gender": "",
    "birthday": "1978-11-06",
    "hcn": "9864295264",
    "diagnosis": "Encounter for removal of sutur",
    "icd10": "Z48.0",
    "comments": ""
  },
  {
    "name": "Wagner, Byron Robert",
    "timestamp": "22:30",
    "age": "44",
    "gender": "",
    "birthday": "1982-05-21",
    "hcn": "002718864",
    "diagnosis": "Pharyngitis",
    "icd10": "J02.9",
    "comments": ""
  },
  {
    "name": "Ellis, Roger Albert",
    "timestamp": "22:30",
    "age": "77",
    "gender": "",
    "birthday": "1948-12-02",
    "hcn": "002231165",
    "diagnosis": "Upper respiratory infection",
    "icd10": "J06.9",
    "comments": ""
  }
];

const aug20 = [
  {
    "name": "Dawson, Valerie Blanche",
    "timestamp": "13:15",
    "age": "65",
    "gender": "",
    "birthday": "1960-12-30",
    "hcn": "002012615",
    "diagnosis": "Nausea & vomiting",
    "icd10": "R11.3",
    "comments": ""
  },
  {
    "name": "Christensen, Paul Cameron",
    "timestamp": "13:30",
    "age": "61",
    "gender": "",
    "birthday": "1965-06-04",
    "hcn": "002060754",
    "diagnosis": "Abdominal pain",
    "icd10": "R10.4",
    "comments": ""
  },
  {
    "name": "Beauchemin, Roger",
    "timestamp": "13:15",
    "age": "66",
    "gender": "",
    "birthday": "1960-02-15",
    "hcn": "002417491",
    "diagnosis": "Altered level of consciousness",
    "icd10": "R41.88",
    "comments": "Altered LOC/Fever"
  },
  {
    "name": "Mahilum, Vianna Arabette",
    "timestamp": "14:00",
    "age": "8",
    "gender": "",
    "birthday": "2018-02-03",
    "hcn": "003027406",
    "diagnosis": "Upper respiratory infection",
    "icd10": "J06.9",
    "comments": ""
  },
  {
    "name": "Mahilum, Ivony",
    "timestamp": "13:45",
    "age": "43",
    "gender": "",
    "birthday": "1983-02-02",
    "hcn": "002604619",
    "diagnosis": "Upper respiratory infection",
    "icd10": "J06.9",
    "comments": ""
  },
  {
    "name": "Porter, Deborah Lucille",
    "timestamp": "13:45",
    "age": "64",
    "gender": "",
    "birthday": "1961-08-28",
    "hcn": "002196129",
    "diagnosis": "Alcohol intoxication",
    "icd10": "F10.0",
    "comments": ""
  },
  {
    "name": "Cote, Emilio Atlas",
    "timestamp": "14:15",
    "age": "12mo",
    "gender": "",
    "birthday": "2025-08-13",
    "hcn": "003200474",
    "diagnosis": "Fever",
    "icd10": "R50.9",
    "comments": ""
  },
  {
    "name": "Birnie, Jessi Boyd",
    "timestamp": "16:30",
    "age": "46",
    "gender": "",
    "birthday": "1980-06-01",
    "hcn": "002191450",
    "diagnosis": "Bizarre behavior",
    "icd10": "R46.2",
    "comments": ""
  },
  {
    "name": "Whalen, Daniel Curtis",
    "timestamp": "14:15",
    "age": "28",
    "gender": "",
    "birthday": "1998-01-15",
    "hcn": "002659837",
    "diagnosis": "Opiate overdose",
    "icd10": "T40.6",
    "comments": ""
  },
  {
    "name": "Low, Douglas James Jr.",
    "timestamp": "15:15",
    "age": "62",
    "gender": "",
    "birthday": "1964-02-06",
    "hcn": "002259521",
    "diagnosis": "Blood in faeces",
    "icd10": "K92.1",
    "comments": ""
  },
  {
    "name": "Blake, Louis Kirk",
    "timestamp": "15:15",
    "age": "55",
    "gender": "",
    "birthday": "1970-09-06",
    "hcn": "002115855",
    "diagnosis": "Back pain",
    "icd10": "M54.9",
    "comments": ""
  },
  {
    "name": "Cornell-Allison, Brooklyn Nadia",
    "timestamp": "15:45",
    "age": "16",
    "gender": "",
    "birthday": "2010-04-01",
    "hcn": "002863868",
    "diagnosis": "Abdominal pain",
    "icd10": "R10.4",
    "comments": ""
  },
  {
    "name": "Thompson, Nathaniel Benjamin",
    "timestamp": "15:45",
    "age": "34",
    "gender": "",
    "birthday": "1992-07-13",
    "hcn": "650194810",
    "diagnosis": "Chest wall contusion",
    "icd10": "S20.2",
    "comments": ""
  },
  {
    "name": "Benoit Cardinal, Andrea",
    "timestamp": "17:30",
    "age": "42",
    "gender": "",
    "birthday": "1983-10-04",
    "hcn": "002919439",
    "diagnosis": "Chest pain",
    "icd10": "R07.4",
    "comments": ""
  },
  {
    "name": "Kaur, Husanpreet",
    "timestamp": "16:00",
    "age": "31",
    "gender": "",
    "birthday": "1994-11-27",
    "hcn": "003055241",
    "diagnosis": "Acute hip pain",
    "icd10": "M25.55",
    "comments": ""
  },
  {
    "name": "Davinder Singh, Davinder Singh",
    "timestamp": "15:45",
    "age": "32",
    "gender": "",
    "birthday": "1993-11-21",
    "hcn": "003149259",
    "diagnosis": "Acute chest wall pain",
    "icd10": "R07.3",
    "comments": ""
  },
  {
    "name": "Brown, Rosalie Joy",
    "timestamp": "17:30",
    "age": "75",
    "gender": "",
    "birthday": "1950-12-08",
    "hcn": "002045821",
    "diagnosis": "Back pain",
    "icd10": "M54.9",
    "comments": ""
  }
];

const aug21 = [
  {
    "name": "Dennis, Jerilee",
    "timestamp": "11:15",
    "age": "40",
    "gender": "",
    "birthday": "1986-08-02",
    "hcn": "002308831",
    "diagnosis": "Acute alcoholic hepatitis",
    "icd10": "K70.1",
    "comments": ""
  },
  {
    "name": "Mchugh, Evynn Nevaeh Joy",
    "timestamp": "11:15",
    "age": "10",
    "gender": "",
    "birthday": "2015-11-19",
    "hcn": "002983203",
    "diagnosis": "Parapneumonic effusion",
    "icd10": "J18.9",
    "comments": ""
  },
  {
    "name": "Nichols, Murray Alexander",
    "timestamp": "11:15",
    "age": "78",
    "gender": "",
    "birthday": "1948-01-16",
    "hcn": "002079754",
    "diagnosis": "Behavioral and psychological s",
    "icd10": "F03",
    "comments": "BPSD/Delirium"
  },
  {
    "name": "Forde, Janice Carol",
    "timestamp": "11:15",
    "age": "78",
    "gender": "",
    "birthday": "1947-11-14",
    "hcn": "002452654",
    "diagnosis": "Fracture, hip",
    "icd10": "S72.090",
    "comments": "L trochanteric #"
  },
  {
    "name": "Cooper, Shanon Louise",
    "timestamp": "12:15",
    "age": "77",
    "gender": "",
    "birthday": "1949-01-13",
    "hcn": "002011609",
    "diagnosis": "Acute leg pain",
    "icd10": "M79.61",
    "comments": ""
  },
  {
    "name": "Porco, Mila Josie Angela",
    "timestamp": "15:45",
    "age": "4",
    "gender": "",
    "birthday": "2022-06-25",
    "hcn": "003119302",
    "diagnosis": "Laceration",
    "icd10": "T14.1",
    "comments": ""
  },
  {
    "name": "Simcoe, Natalia",
    "timestamp": "12:15",
    "age": "92",
    "gender": "",
    "birthday": "1934-07-12",
    "hcn": "002854834",
    "diagnosis": "Hallucination",
    "icd10": "R44.3",
    "comments": "FTT/Hallucinations"
  },
  {
    "name": "Jowett, Judith Lorraine",
    "timestamp": "12:15",
    "age": "67",
    "gender": "",
    "birthday": "1959-01-26",
    "hcn": "003198496",
    "diagnosis": "Chest pain",
    "icd10": "R07.4",
    "comments": ""
  },
  {
    "name": "Villacorta-Jim, Luna Averie",
    "timestamp": "13:30",
    "age": "9",
    "gender": "",
    "birthday": "2016-11-17",
    "hcn": "003002326",
    "diagnosis": "Abdominal pain",
    "icd10": "R10.4",
    "comments": ""
  },
  {
    "name": "Angel, Amie Arlette",
    "timestamp": "13:30",
    "age": "39",
    "gender": "",
    "birthday": "1987-03-25",
    "hcn": "002998102",
    "diagnosis": "Chest pain",
    "icd10": "R07.4",
    "comments": ""
  },
  {
    "name": "Dick, Jody Lynn",
    "timestamp": "12:15",
    "age": "39",
    "gender": "",
    "birthday": "1987-03-18",
    "hcn": "002333888",
    "diagnosis": "Back pain\nAlcoholic gastritis",
    "icd10": "M54.9\nK29.2",
    "comments": ""
  },
  {
    "name": "Baker, Elizabeth Ann",
    "timestamp": "13:30",
    "age": "66",
    "gender": "",
    "birthday": "1960-03-30",
    "hcn": "002183580",
    "diagnosis": "Cellulitis",
    "icd10": "L03.9",
    "comments": ""
  },
  {
    "name": "Cecco, Cassius Rocco Kostas",
    "timestamp": "15:45",
    "age": "3mo",
    "gender": "",
    "birthday": "2026-05-16",
    "hcn": "003216652",
    "diagnosis": "Head injury",
    "icd10": "S09.9",
    "comments": ""
  },
  {
    "name": "Yu, Inwoo",
    "timestamp": "15:45",
    "age": "24",
    "gender": "",
    "birthday": "2002-08-09",
    "hcn": "003204534",
    "diagnosis": "Otalgia",
    "icd10": "H92.0",
    "comments": ""
  },
  {
    "name": "Frair, Jennifer Lynne",
    "timestamp": "15:45",
    "age": "68",
    "gender": "",
    "birthday": "1957-10-01",
    "hcn": "002089290",
    "diagnosis": "Contusion",
    "icd10": "T14.0",
    "comments": ""
  }
];

const aug22 = [
  {
    "name": "Arey, Leona Marie",
    "timestamp": "20:30",
    "age": "41",
    "gender": "",
    "birthday": "1985-06-07",
    "hcn": "003175841",
    "diagnosis": "Suicidal ideation",
    "icd10": "R45.8",
    "comments": "suicidal ideation (voluntary)"
  },
  {
    "name": "Ennis, Gordon Daniel",
    "timestamp": "23:00",
    "age": "52",
    "gender": "",
    "birthday": "1973-12-24",
    "hcn": "002214427",
    "diagnosis": "Subconjunctival haemorrhage",
    "icd10": "H11.3",
    "comments": ""
  },
  {
    "name": "Ryan, Reuben Edgar",
    "timestamp": "23:15",
    "age": "62",
    "gender": "",
    "birthday": "1964-03-13",
    "hcn": "9015341754",
    "diagnosis": "Abscess",
    "icd10": "L02.9",
    "comments": ""
  },
  {
    "name": "Penner, Mark Henry",
    "timestamp": "00:15",
    "age": "51",
    "gender": "",
    "birthday": "1975-04-22",
    "hcn": "002973378",
    "diagnosis": "Achilles bursitis",
    "icd10": "M76.6",
    "comments": ""
  },
  {
    "name": "Perey, Deneese Faith",
    "timestamp": "00:15",
    "age": "22",
    "gender": "",
    "birthday": "2003-12-11",
    "hcn": "118686438",
    "diagnosis": "Minor head injury",
    "icd10": "S09.9",
    "comments": ""
  },
  {
    "name": "Peacock, Zacharius Hunter",
    "timestamp": "00:15",
    "age": "22",
    "gender": "",
    "birthday": "2003-12-11",
    "hcn": "002754240",
    "diagnosis": "Contusion",
    "icd10": "T14.0",
    "comments": ""
  },
  {
    "name": "Reid, Charlotte Amanda",
    "timestamp": "01:15",
    "age": "11",
    "gender": "",
    "birthday": "2014-10-03",
    "hcn": "003036282",
    "diagnosis": "Head injury",
    "icd10": "S09.9",
    "comments": ""
  },
  {
    "name": "Charlie, Santana",
    "timestamp": "01:30",
    "age": "34",
    "gender": "",
    "birthday": "1991-10-19",
    "hcn": "002481653",
    "diagnosis": "Head injury",
    "icd10": "S09.9",
    "comments": ""
  },
  {
    "name": "Isaac, Ingrid Louise",
    "timestamp": "23:00",
    "age": "56",
    "gender": "",
    "birthday": "1970-03-16",
    "hcn": "002724722",
    "diagnosis": "Abdominal pain",
    "icd10": "R10.4",
    "comments": ""
  },
  {
    "name": "Mills, Clifford Andrew",
    "timestamp": "03:00",
    "age": "66",
    "gender": "",
    "birthday": "1959-11-21",
    "hcn": "002589745",
    "diagnosis": "Hematuria",
    "icd10": "R31.8",
    "comments": "Renal Tumour"
  },
  {
    "name": "Peter-Profeit, Deanna Chiyo",
    "timestamp": "03:00",
    "age": "34",
    "gender": "",
    "birthday": "1991-09-25",
    "hcn": "002496719",
    "diagnosis": "Ankle sprain",
    "icd10": "S93.49",
    "comments": ""
  },
  {
    "name": "Andersen, Thalina Grace",
    "timestamp": "03:00",
    "age": "15",
    "gender": "",
    "birthday": "2011-01-03",
    "hcn": "003057197",
    "diagnosis": "Laceration",
    "icd10": "T14.1",
    "comments": ""
  },
  {
    "name": "Alexie, Abraham Angus",
    "timestamp": "01:15",
    "age": "81",
    "gender": "",
    "birthday": "1944-12-03",
    "hcn": "002907889",
    "diagnosis": "Altered level of consciousness",
    "icd10": "R41.88",
    "comments": ""
  }
];

const aug23 = [
  {
    "name": "Washpan, Cheryl May",
    "timestamp": "01:45",
    "age": "28",
    "gender": "",
    "birthday": "1997-10-27",
    "hcn": "002655538",
    "diagnosis": "Abdominal pain",
    "icd10": "R10.4",
    "comments": "Abdominal pain"
  },
  {
    "name": "Tungol, Ethan Jace",
    "timestamp": "03:00",
    "age": "3",
    "gender": "",
    "birthday": "2023-05-22",
    "hcn": "003190139",
    "diagnosis": "",
    "icd10": "",
    "comments": ""
  },
  {
    "name": "Sonko, Omar",
    "timestamp": "02:45",
    "age": "42",
    "gender": "",
    "birthday": "1983-12-04",
    "hcn": "",
    "diagnosis": "Assault",
    "icd10": "Y09",
    "comments": "Bilateral hand lacerations"
  },
  {
    "name": "Mugisha, Dieu Donne",
    "timestamp": "04:45",
    "age": "35",
    "gender": "",
    "birthday": "1991-03-21",
    "hcn": "747061171",
    "diagnosis": "Laceration",
    "icd10": "T14.1",
    "comments": ""
  },
  {
    "name": "Hynick, Isiah Timothy",
    "timestamp": "04:30",
    "age": "26",
    "gender": "",
    "birthday": "2000-08-07",
    "hcn": "0010902872",
    "diagnosis": "Assault",
    "icd10": "Y09",
    "comments": ""
  },
  {
    "name": "Mcleod-Wierda, Katie",
    "timestamp": "06:00",
    "age": "18",
    "gender": "",
    "birthday": "2007-09-19",
    "hcn": "002816775",
    "diagnosis": "Assault",
    "icd10": "Y09",
    "comments": ""
  },
  {
    "name": "Bruneau, Kris Elizabeth",
    "timestamp": "07:30",
    "age": "59",
    "gender": "",
    "birthday": "1967-03-18",
    "hcn": "002457844",
    "diagnosis": "Insomnia",
    "icd10": "G47.0",
    "comments": ""
  }
];

export const IMPORT_DATA = {
  days: [
    { sheetName: "Aug 18, 2026", patients: aug18 },
    { sheetName: "Aug 19, 2026", patients: aug19 },
    { sheetName: "Aug 20, 2026", patients: aug20 },
    { sheetName: "Aug 21, 2026", patients: aug21 },
    { sheetName: "Aug 22, 2026", patients: aug22 },
    { sheetName: "Aug 23, 2026", patients: aug23 },
  ],
};

// Total: 23 + 20 + 17 + 15 + 13 + 7 = 95 patients
// To import, run in browser console while logged in:
// fetch("/api/bulk-import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(IMPORT_DATA) }).then(r => r.json()).then(console.log)
