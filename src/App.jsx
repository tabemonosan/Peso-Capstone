import { Fragment, useEffect, useState } from "react"
import { API_URL } from "./config"
import JobsView from "./components/JobsView"
import ReferralList from "./components/ReferralList"
import PesoReferralPanel from "./components/PesoReferralPanel"

const initialAccounts = [
  { email: "admin@peso.gov", password: "password123", role: "Admin" },
  { email: "employer@peso.gov", password: "password123", role: "Employer" },
  { email: "applicant@peso.gov", password: "password123", role: "Applicant" },
]

const navigationByRole = {
  Admin: [
    { id: "employers", label: "Employers" },
    { id: "applicants", label: "Applicants" },
    { id: "requests", label: "Employer Requests" },
    { id: "jobs", label: "Job Postings" },
    { id: "peso-referrals", label: "Reports" },
  ],
  Employer: [
    { id: "home", label: "Home" },
    { id: "dashboard", label: "Dashboard" },
    { id: "employer", label: "Job Postings" },
    { id: "referrals", label: "Reports" },
    { id: "reviews", label: "Reviews" },
    { id: "notify", label: "Notifications" },
  ],
  Applicant: [
    { id: "home", label: "Home" },
    { id: "jobs", label: "Jobs" },
    { id: "reputation", label: "Reviews" },
    { id: "notify", label: "Notifications" },
  ],
}

const availableSkills = [
  "Software Engineer",
  "Frontend Developer",
  "Backend Developer",
  "Full-Stack Developer",
  "Web Developer",
  "Mobile Developer",
  "DevOps Engineer",
  "Data Analyst",
  "Data Scientist",
  "Machine Learning Engineer",
  "Cybersecurity Analyst",
  "IT Support Specialist",
  "Network Engineer",
  "Database Administrator",
  "QA Engineer",
  "UI/UX Designer",
  "Product Manager",
  "Project Manager",
  "Business Analyst",
  "Accountant",
  "Financial Analyst",
  "Bookkeeper",
  "Human Resources Specialist",
  "Recruiter",
  "Sales Representative",
  "Account Manager",
  "Marketing Specialist",
  "Digital Marketing Specialist",
  "Social Media Manager",
  "Content Writer",
  "Copywriter",
  "Graphic Designer",
  "Video Editor",
  "Customer Service Representative",
  "Call Center Agent",
  "Virtual Assistant",
  "Administrative Assistant",
  "Executive Assistant",
  "Office Clerk",
  "Data Entry Specialist",
  "Operations Manager",
  "Supply Chain Specialist",
  "Logistics Coordinator",
  "Warehouse Associate",
  "Delivery Driver",
  "Professional Driver",
  "Security Guard",
  "Cashier",
  "Retail Associate",
  "Store Manager",
  "Chef",
  "Cook",
  "Baker",
  "Waiter / Waitress",
  "Barista",
  "Housekeeper",
  "Janitor",
  "Caregiver",
  "Nurse",
  "Medical Technologist",
  "Pharmacist",
  "Teacher",
  "Tutor",
  "Electrician",
  "Plumber",
  "Carpenter",
  "Welder",
  "Mechanic",
  "Construction Worker",
  "Civil Engineer",
  "Mechanical Engineer",
  "Electrical Engineer",
  "Architect",
  "Landscaper",
  "Farm Worker",
]

// Format a salary value as Philippine pesos: digits only, ? prefix, thousand separators
const formatPesoSalary = (value) => {
  const digits = String(value).replace(/[^0-9]/g, "")
  if (!digits) return ""
  return `\u20B1$1`
}

// Municipalities/Cities of Albay with their barangays
const albayLocations = {
  "Bacacay": [
    "Baclayon",
    "Banao",
    "Barangay 1 (Pob.)",
    "Barangay 10 (Pob.)",
    "Barangay 11 (Pob.)",
    "Barangay 12 (Pob.)",
    "Barangay 13 (Pob.)",
    "Barangay 14 (Pob.)",
    "Barangay 2 (Pob.)",
    "Barangay 3 (Pob.)",
    "Barangay 4 (Pob.)",
    "Barangay 5 (Pob.)",
    "Barangay 6 (Pob.)",
    "Barangay 7 (Pob.)",
    "Barangay 8 (Pob.)",
    "Barangay 9 (Pob.)",
    "Bariw",
    "Basud",
    "Bayandong",
    "Bonga",
    "Buang",
    "Busdac",
    "Cabasan",
    "Cagbulacao",
    "Cagraray",
    "Cajogutan",
    "Cawayan",
    "Damacan",
    "Gubat Ilawod",
    "Gubat Iraya",
    "Hindi",
    "Igang",
    "Langaton",
    "Manaet",
    "Mapulang Daga",
    "Mataas",
    "Misibis",
    "Nahapunan",
    "Namanday",
    "Namantao",
    "Napao",
    "Panarayon",
    "Pigcobohan",
    "Pili Ilawod",
    "Pili Iraya",
    "Pongco",
    "San Pablo",
    "San Pedro",
    "Sogod",
    "Sula",
    "Tambilagao",
    "Tambongon",
    "Tanagan",
    "Uson",
    "Vinisitahan-Basud",
    "Vinisitahan-Napao",
  ],
  "Camalig": [
    "Anoling",
    "Baligang",
    "Bantonan",
    "Barangay 1 (Pob.)",
    "Barangay 2 (Pob.)",
    "Barangay 3 (Pob.)",
    "Barangay 4 (Pob.)",
    "Barangay 5 (Pob.)",
    "Barangay 6 (Pob.)",
    "Barangay 7 (Pob.)",
    "Bariw",
    "Binanderahan",
    "Binitayan",
    "Bongabong",
    "Cabag\u2022an",
    "Cabraran Peque\u2022o",
    "Caguiba",
    "Calabidongan",
    "Comun",
    "Cotmon",
    "Del Rosario",
    "Gapo",
    "Gotob",
    "Ilawod",
    "Iluluan",
    "Libod",
    "Ligban",
    "Mabunga",
    "Magogon",
    "Manawan",
    "Maninila",
    "Mina",
    "Miti",
    "Palanog",
    "Panoypoy",
    "Pariaan",
    "Quinartilan",
    "Quirangay",
    "Quitinday",
    "Salugan",
    "Solong",
    "Sua",
    "Sumlang",
    "Tagaytay",
    "Tagoytoy",
    "Taladong",
    "Taloto",
    "Taplacon",
    "Tinago",
    "Tumpa",
  ],
  "Daraga": [
    "Alcala",
    "Alobo",
    "Anislag",
    "Bagumbayan",
    "Balinad",
    "Ba\u2022adero",
    "Ba\u2022ag",
    "Bascaran",
    "Bigao",
    "Binitayan",
    "Bongalon",
    "Budiao",
    "Burgos",
    "Busay",
    "Canarom",
    "Cullat",
    "Dela Paz",
    "Dinoronan",
    "Gabawan",
    "Gapo",
    "Ibaugan",
    "Ilawod Area Pob.",
    "Inarado",
    "Kidaco",
    "Kilicao",
    "Kimantong",
    "Kinawitan",
    "Kiwalo",
    "Lacag",
    "Mabini",
    "Malabog",
    "Malobago",
    "Maopi",
    "Market Area Pob.",
    "Maroroy",
    "Matnog",
    "Mayon",
    "Mi-isi",
    "Nabasan",
    "Namantao",
    "Pandan",
    "Pe\u2022afrancia",
    "Sagpon",
    "Salvacion",
    "San Rafael",
    "San Ramon",
    "San Roque",
    "San Vicente Grande",
    "San Vicente Peque\u2022o",
    "Sipi",
    "Tabon-tabon",
    "Tagas",
    "Talahib",
    "Villahermosa",
  ],
  "Guinobatan": [
    "Agpay",
    "Balite",
    "Banao",
    "Batbat",
    "Binogsacan Lower",
    "Binogsacan Upper",
    "Bololo",
    "Bubulusan",
    "Calzada",
    "Catomag",
    "Do\u2022a Mercedes",
    "Do\u2022a Tomasa",
    "Ilawod",
    "Inamnan Grande",
    "Inamnan Peque\u2022o",
    "Inascan",
    "Iraya",
    "Lomacao",
    "Maguiron",
    "Maipon",
    "Malabnig",
    "Malipo",
    "Malobago",
    "Maninila",
    "Mapaco",
    "Marcial O. Ra\u2022ola",
    "Masarawag",
    "Mauraro",
    "Minto",
    "Morera",
    "Muladbucad Grande",
    "Muladbucad Peque\u2022o",
    "Ongo",
    "Palanas",
    "Poblacion",
    "Pood",
    "Quibongbongan",
    "Quitago",
    "San Francisco",
    "San Jose",
    "San Rafael",
    "Sinungtan",
    "Tandarora",
    "Travesia",
  ],
  "Jovellar": [
    "Aurora Pob.",
    "Bagacay",
    "Bautista",
    "Cabraran",
    "Calzada Pob.",
    "Del Rosario",
    "Estrella",
    "Florista",
    "Mabini Pob.",
    "Magsaysay Pob",
    "Mamlad",
    "Maogog",
    "Mercado Pob.",
    "Plaza Pob.",
    "Quitinday Pob.",
    "Rizal Pob.",
    "Salvacion",
    "San Isidro",
    "San Roque",
    "San Vicente",
    "Sinagaran",
    "Villa Paz",
    "White Deer Pob.",
  ],
  "Legazpi City": [
    "Bgy. 1 - Em's Barrio (Pob.)",
    "Bgy. 10 - Cabugao",
    "Bgy. 11 - Maoyod Pob.",
    "Bgy. 12 - Tula-tula (Pob.)",
    "Bgy. 13 - Ilawod West Pob.",
    "Bgy. 14 - Ilawod Pob.",
    "Bgy. 15 - Ilawod East Pob.",
    "Bgy. 16 - Kawit-East Washington Drive (Pob.)",
    "Bgy. 17 - Rizal Street., Ilawod (Pob.)",
    "Bgy. 18 - Cabag\u2022an West (Pob.)",
    "Bgy. 19 - Cabag\u2022an",
    "Bgy. 2 - Em's Barrio South (Pob.)",
    "Bgy. 20 - Cabag\u2022an East (Pob.)",
    "Bgy. 21 - Binanuahan West (Pob.)",
    "Bgy. 22 - Binanuahan East (Pob.)",
    "Bgy. 23 - Imperial Court Subd. (Pob.)",
    "Bgy. 24 - Rizal Street",
    "Bgy. 25 - Lapu-lapu (Pob.)",
    "Bgy. 26 - Dinagaan (Pob.)",
    "Bgy. 27 - Victory Village South (Pob.)",
    "Bgy. 28 - Victory Village North (Pob.)",
    "Bgy. 29 - Sabang (Pob.)",
    "Bgy. 3 - Em's Barrio East (Pob.)",
    "Bgy. 30 - Pigcale (Pob.)",
    "Bgy. 31 - Centro-Baybay (Pob.)",
    "Bgy. 32 - San Roque",
    "Bgy. 33 - PNR-Pe\u2022aranda St.-Iraya (Pob.)",
    "Bgy. 34 - Oro Site-Magallanes St. (Pob.)",
    "Bgy. 35 - Tinago (Pob.)",
    "Bgy. 36 - Kapantawan (Pob.)",
    "Bgy. 37 - Bitano (Pob.)",
    "Bgy. 38 - Gogon",
    "Bgy. 39 - Bonot (Pob.)",
    "Bgy. 4 - Sagpon Pob.",
    "Bgy. 40 - Cruzada",
    "Bgy. 41 - Bogtong",
    "Bgy. 42 - Rawis",
    "Bgy. 43 - Tamaoyan",
    "Bgy. 44 - Pawa",
    "Bgy. 45 - Dita",
    "Bgy. 46 - San Joaquin",
    "Bgy. 47 - Arimbay",
    "Bgy. 48 - Bagong Abre",
    "Bgy. 49 - Bigaa",
    "Bgy. 5 - Sagmin Pob.",
    "Bgy. 50 - Padang",
    "Bgy. 51 - Buyuan",
    "Bgy. 52 - Matanag",
    "Bgy. 53 - Bonga",
    "Bgy. 54 - Mabinit",
    "Bgy. 55 - Estanza",
    "Bgy. 56 - Taysan",
    "Bgy. 57 - Dap-dap",
    "Bgy. 58 - Buragwis",
    "Bgy. 59 - Puro",
    "Bgy. 6 - Ba\u2022adero Pob.",
    "Bgy. 60 - Lamba",
    "Bgy. 61 - Maslog",
    "Bgy. 62 - Homapon",
    "Bgy. 63 - Mariawa",
    "Bgy. 64 - Bagacay",
    "Bgy. 65 - Imalnod",
    "Bgy. 66 - Banquerohan",
    "Bgy. 67 - Bariis",
    "Bgy. 68 - San Francisco",
    "Bgy. 69 - Buenavista",
    "Bgy. 7 - Ba\u2022o (Pob.)",
    "Bgy. 70 - Cagbacong",
    "Bgy. 8 - Bagumbayan (Pob.)",
    "Bgy. 9 - Pinaric (Pob.)",
  ],
  "Libon": [
    "Alongong",
    "Apud",
    "Bacolod",
    "Bariw",
    "Bonbon",
    "Buga",
    "Bulusan",
    "Burabod",
    "Caguscos",
    "East Carisac",
    "Harigue",
    "Libtong",
    "Linao",
    "Mabayawas",
    "Macabugos",
    "Magallang",
    "Malabiga",
    "Marayag",
    "Matara",
    "Molosbolos",
    "Natasan",
    "Ni\u2022o Jesus",
    "Nogpo",
    "Pantao",
    "Rawis",
    "Sagrada Familia",
    "Salvacion",
    "Sampongan",
    "San Agustin",
    "San Antonio",
    "San Isidro",
    "San Jose",
    "San Pascual",
    "San Ramon",
    "San Vicente",
    "Santa Cruz",
    "Talin-talin",
    "Tambo",
    "Villa Petrona",
    "West Carisac",
    "Zone I (Pob.)",
    "Zone II (Pob.)",
    "Zone III (Pob.)",
    "Zone IV (Pob.)",
    "Zone V (Pob.)",
    "Zone VI (Pob.)",
    "Zone VII (Pob.)",
  ],
  "Ligao City": [
    "Abella",
    "Allang",
    "Amtic",
    "Bacong",
    "Bagumbayan",
    "Balanac",
    "Baligang",
    "Barayong",
    "Basag",
    "Batang",
    "Bay",
    "Binanowan",
    "Binatagan (Pob.)",
    "Bobonsuran",
    "Bonga",
    "Busac",
    "Busay",
    "Cabarian",
    "Calzada (Pob.)",
    "Catburawan",
    "Cavasi",
    "Culliat",
    "Dunao",
    "Francia",
    "Guilid",
    "Herrera",
    "Layon",
    "Macalidong",
    "Mahaba",
    "Malama",
    "Maonon",
    "Nabonton",
    "Nasisi",
    "Oma-oma",
    "Palapas",
    "Pandan",
    "Paulba",
    "Paulog",
    "Pinamaniquian",
    "Pinit",
    "Ranao-ranao",
    "San Vicente",
    "Santa Cruz (Pob.)",
    "Tagpo",
    "Tambo",
    "Tandarura",
    "Tastas",
    "Tinago",
    "Tinampo",
    "Tiongson",
    "Tomolin",
    "Tuburan",
    "Tula-tula Grande",
    "Tula-tula Peque\u2022o",
    "Tupas",
  ],
  "Malilipot": [
    "Barangay I (Pob.)",
    "Barangay II (Pob.)",
    "Barangay III (Pob.)",
    "Barangay IV (Pob.)",
    "Barangay V (Pob.)",
    "Binitayan",
    "Calbayog",
    "Canaway",
    "Salvacion",
    "San Antonio Santicon (Pob.)",
    "San Antonio Sulong",
    "San Francisco",
    "San Isidro Ilawod",
    "San Isidro Iraya",
    "San Jose",
    "San Roque",
    "Santa Cruz",
    "Santa Teresa",
  ],
  "Malinao": [
    "Awang",
    "Bagatangki",
    "Bagumbayan",
    "Balading",
    "Balza",
    "Bariw",
    "Baybay",
    "Bulang",
    "Burabod",
    "Cabunturan",
    "Comun",
    "Diaro",
    "Estancia",
    "Jonop",
    "Labnig",
    "Libod",
    "Malolos",
    "Matalipni",
    "Ogob",
    "Pawa",
    "Payahan",
    "Poblacion",
    "Quinarabasahan",
    "Santa Elena",
    "Soa",
    "Sugcad",
    "Tagoytoy",
    "Tanawan",
    "Tuliw",
  ],
  "Manito": [
    "Balabagon",
    "Balasbas",
    "Bamban",
    "Buyo",
    "Cabacongan",
    "Cabit",
    "Cawayan",
    "Cawit",
    "Holugan",
    "It-Ba (Pob.)",
    "Malobago",
    "Manumbalay",
    "Nagotgot",
    "Pawa",
    "Tinapian",
  ],
  "Oas": [
    "Badbad",
    "Badian",
    "Bagsa",
    "Bagumbayan",
    "Balogo",
    "Banao",
    "Bangiawon",
    "Bogtong",
    "Bongoran",
    "Busac",
    "Cadawag",
    "Cagmanaba",
    "Calaguimit",
    "Calpi",
    "Calzada",
    "Camagong",
    "Casinagan",
    "Centro Poblacion",
    "Coliat",
    "Del Rosario",
    "Gumabao",
    "Ilaor Norte",
    "Ilaor Sur",
    "Iraya Norte",
    "Iraya Sur",
    "Manga",
    "Maporong",
    "Maramba",
    "Matambo",
    "Mayag",
    "Mayao",
    "Moroponros",
    "Nagas",
    "Obaliw-Rinas",
    "Pistola",
    "Ramay",
    "Rizal",
    "Saban",
    "San Agustin",
    "San Antonio",
    "San Isidro",
    "San Jose",
    "San Juan",
    "San Miguel",
    "San Pascual",
    "San Ramon",
    "San Vicente",
    "Tablon",
    "Talisay",
    "Talongog",
    "Tapel",
    "Tobgon",
    "Tobog",
  ],
  "Pio Duran": [
    "Agol",
    "Alabangpuro",
    "Banawan",
    "Barangay I (Pob.)",
    "Barangay II (Pob.)",
    "Barangay III (Pob.)",
    "Barangay IV (Pob.)",
    "Barangay V (Pob.)",
    "Basicao Coastal",
    "Basicao Interior",
    "Binodegahan",
    "Buenavista",
    "Buyo",
    "Caratagan",
    "Cuyaoyao",
    "Flores",
    "La Medalla",
    "Lawinon",
    "Macasitas",
    "Malapay",
    "Malidong",
    "Mamlad",
    "Marigondon",
    "Matanglad",
    "Nablangbulod",
    "Oringon",
    "Palapas",
    "Panganiran",
    "Rawis",
    "Salvacion",
    "Santo Cristo",
    "Sukip",
    "Tibabo",
  ],
  "Polangui": [
    "Agos",
    "Alnay",
    "Alomon",
    "Amoguis",
    "Anopol",
    "Apad",
    "Balaba",
    "Balangibang",
    "Balinad",
    "Basud",
    "Binagbangan",
    "Buyo",
    "Centro Occidental (Pob.)",
    "Centro Oriental (Pob.)",
    "Cepres",
    "Cotmon",
    "Cotnogan",
    "Danao",
    "Gabon",
    "Gamot",
    "Itaran",
    "Kinale",
    "Kinuartilan",
    "La Medalla",
    "La Purisima",
    "Lanigay",
    "Lidong",
    "Lourdes",
    "Magpanambo",
    "Magurang",
    "Matacon",
    "Maynaga",
    "Maysua",
    "Mendez",
    "Napo",
    "Pinagdapugan",
    "Ponso",
    "Salvacion",
    "San Roque",
    "Santa Cruz",
    "Santa Teresita",
    "Santicon",
    "Sugcad",
    "Ubaliw",
  ],
  "Rapu-Rapu": [
    "Bagaobawan",
    "Batan",
    "Bilbao",
    "Binosawan",
    "Bogtong",
    "Buenavista",
    "Buhatan",
    "Calanaga",
    "Caracaran",
    "Carogcog",
    "Dap-dap",
    "Gaba",
    "Galicia",
    "Guadalupe",
    "Hamorawon",
    "Lagundi",
    "Liguan",
    "Linao",
    "Malobago",
    "Mananao",
    "Mancao",
    "Manila",
    "Masaga",
    "Morocborocan",
    "Nagcalsot",
    "Pagcolbon",
    "Poblacion",
    "Sagrada",
    "San Ramon",
    "Santa Barbara",
    "Tinocawan",
    "Tinopan",
    "Viga",
    "Villahermosa",
  ],
  "Santo Domingo": [
    "Alimsog",
    "Bagong San Roque",
    "Buhatan",
    "Calayucay",
    "Del Rosario Pob.",
    "Fidel Surtida",
    "Lidong",
    "Market Site Pob.",
    "Nagsiya Pob.",
    "Pandayan Pob.",
    "Salvacion",
    "San Andres",
    "San Fernando",
    "San Francisco Pob.",
    "San Isidro",
    "San Juan Pob.",
    "San Pedro Pob.",
    "San Rafael Pob.",
    "San Roque",
    "San Vicente Pob.",
    "Santa Misericordia",
    "Santo Domingo Pob.",
    "Santo Ni\u2022o",
  ],
  "Tabaco City": [
    "Agnas",
    "Bacolod",
    "Bangkilingan",
    "Bantayan",
    "Baranghawon",
    "Basagan",
    "Basud (Pob.)",
    "Bog\u2022abong",
    "Bombon (Pob.)",
    "Bonot",
    "Buang",
    "Buhian",
    "Cabag\u2022an",
    "Cobo",
    "Comon",
    "Cormidal",
    "Divino Rostro (Pob.)",
    "Fatima",
    "Guinobat",
    "Hacienda",
    "Magapo",
    "Mariroc",
    "Matagbac",
    "Oras",
    "Oson",
    "Panal",
    "Pawa",
    "Pinagbobong",
    "Quinale Cabasan (Pob.)",
    "Quinastillojan",
    "Rawis",
    "Sagurong",
    "Salvacion",
    "San Antonio",
    "San Carlos",
    "San Isidro",
    "San Juan (Pob.)",
    "San Lorenzo",
    "San Ramon",
    "San Roque",
    "San Vicente",
    "Santo Cristo (Pob.)",
    "Sua-Igot",
    "Tabiguian",
    "Tagas",
    "Tayhi (Pob.)",
    "Visita",
  ],
  "Tiwi": [
    "Bagumbayan",
    "Bariis",
    "Baybay",
    "Belen",
    "Biyong",
    "Bolo",
    "Cale",
    "Cararayan",
    "Coro-coro",
    "Dap-dap",
    "Gajo",
    "Joroan",
    "Libjo",
    "Libtong",
    "Matalibong",
    "Maynonong",
    "Mayong",
    "Misibis",
    "Naga",
    "Nagas",
    "Oyama",
    "Putsan",
    "San Bernardo",
    "Sogod",
    "Tigbi (Pob.)",
  ],
}

const albayMunicipalities = Object.keys(albayLocations)

const normalizeSkills = (skills) => {
  if (Array.isArray(skills)) return skills.filter((skill) => typeof skill === 'string' && skill.trim()).map((skill) => skill.trim())
  if (typeof skills === 'string') return skills.split(',').map((skill) => skill.trim()).filter(Boolean)
  return []
}

function App() {
  const [activeRole, setActiveRole] = useState(() => typeof window !== "undefined" ? (localStorage.getItem('peso-active-role') || 'Applicant') : 'Applicant')
  const [activeView, setActiveView] = useState(() => typeof window !== "undefined" ? (localStorage.getItem('peso-active-view') || 'dashboard') : 'dashboard')
  const [currentUser, setCurrentUser] = useState(null)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [userAccounts, setUserAccounts] = useState(initialAccounts)
  const [formData, setFormData] = useState(() => ({
    email: typeof window !== "undefined" ? localStorage.getItem("peso-portal-remembered-email") || "" : "",
    password: "",
  }))
  const [rememberMe, setRememberMe] = useState(() =>
    typeof window !== "undefined" && Boolean(localStorage.getItem("peso-portal-remembered-email")),
  )
  const [showPassword, setShowPassword] = useState(false)
  const [showSignupPassword, setShowSignupPassword] = useState(false)
  const [showEmployerPasswords, setShowEmployerPasswords] = useState(false)
  const [adminSelectedRole, setAdminSelectedRole] = useState("Admin")
  const [profileData, setProfileData] = useState({
    name: "",
    location: "",
    skills: [],
    traits: "",
    summary: "",
    companyName: "",
    contactName: "",
    phone: "",
    website: "",
  })
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [resumeFile, setResumeFile] = useState(null)
  const [resumeInfo, setResumeInfo] = useState(null)
  const [nsrpVerificationInfo, setNsrpVerificationInfo] = useState(null)
  const [nsrpVerificationFile, setNsrpVerificationFile] = useState(null)
  const [nsrpVerificationUploading, setNsrpVerificationUploading] = useState(false)
  const [resumeUploading, setResumeUploading] = useState(false)

  const normalizeProfile = (userObj = {}, role) => {
    const base = userObj.profile || {}
    if (role === 'Employer') {
      return {
        name: base.name || '',
        location: base.location || '',
        skills: normalizeSkills(base.skills),
        traits: base.traits || '',
        summary: base.summary || '',
        companyName: userObj.companyName || base.companyName || '',
        contactName: userObj.contactName || base.contactName || '',
        phone: userObj.phone || base.phone || '',
        website: userObj.website || base.website || '',
        profileImage: base.profileImage || '',
        bannerImage: base.bannerImage || '',
      }
    }
    // Applicant/Admin default mapping
    return {
      name: base.name || '',
      location: base.location || '',
      skills: normalizeSkills(base.skills),
      traits: base.traits || '',
      summary: base.summary || '',
      companyName: base.companyName || '',
      contactName: base.contactName || '',
      phone: base.phone || '',
      website: base.website || '',
      profileImage: base.profileImage || '',
      bannerImage: base.bannerImage || '',
    }
  }

const toggleSkill = (selected, skill) => {
  const normalized = Array.isArray(selected) ? selected : []
  if (normalized.includes(skill)) {
    return normalized.filter((item) => item !== skill)
  }
  return [...normalized, skill]
}

// Tag-style skill/title picker: selected items as removable chips + "Add title" search input
function SkillTagPicker({ selected, onChange, disabled = false, theme = 'dark' }) {
  const [query, setQuery] = useState('')
  const normalized = Array.isArray(selected) ? selected : []
  const trimmed = query.trim()
  const suggestions = trimmed
    ? availableSkills.filter((skill) => skill.toLowerCase().includes(trimmed.toLowerCase()) && !normalized.includes(skill)).slice(0, 8)
    : []
  const inputCls = theme === 'dark'
    ? 'w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white'
    : 'w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-black'
  const suggestionCls = theme === 'dark'
    ? 'cursor-pointer px-3 py-2 text-sm text-slate-200 hover:bg-slate-700'
    : 'cursor-pointer px-3 py-2 text-sm text-black hover:bg-slate-100'
  const chipCls = theme === 'dark'
    ? 'inline-flex items-center gap-2 rounded-full border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-sm font-medium text-cyan-200'
    : 'inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-black'
  return (
    <div className="skill-tag-picker mt-2 space-y-2">
      {normalized.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {normalized.map((skill) => (
            <span key={skill} className={`skill-tag-chip ${chipCls}`}>
              {skill}
              {!disabled && (
                <button
                  type="button"
                  aria-label={`Remove ${skill}`}
                  onClick={() => onChange(normalized.filter((item) => item !== skill))}
                  className={`skill-tag-remove ${theme === 'dark' ? 'text-cyan-300 hover:text-white' : 'text-slate-500 hover:text-black'}`}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {!disabled && (
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Add title"
            className={`skill-tag-input ${inputCls}`}
          />
          {suggestions.length > 0 && (
            <div className={`skill-tag-suggestions absolute z-20 mt-1 w-full overflow-hidden rounded-xl border ${theme === 'dark' ? 'border-slate-700 bg-slate-900' : 'border-slate-300 bg-white'} shadow-lg`}>
              {suggestions.map((skill) => (
                <button
                  key={skill}
                  type="button"
                  onClick={() => {
                    onChange([...normalized, skill])
                    setQuery('')
                  }}
                  className={`skill-tag-suggestion block w-full text-left ${suggestionCls}`}
                >
                  {skill}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const sortJobsByMatch = (jobs, userSkills) => {
  const applicantSkills = normalizeSkills(userSkills)
  return jobs
    .map((job) => {
      const jobSkills = normalizeSkills(job.skills)
      const matchCount = applicantSkills.filter((skill) => jobSkills.includes(skill)).length
      return { job, matchCount }
    })
    .sort((a, b) => b.matchCount - a.matchCount || new Date(b.job.createdAt) - new Date(a.job.createdAt))
    .map(({ job }) => job)
}

const [authView, setAuthView] = useState("login")
  const [signupForm, setSignupForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    name: "",
  })
  const [employerRequestForm, setEmployerRequestForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    companyName: "",
    contactName: "",
    location: "",
    phone: "",
    message: "",
  })
  const [employerAddress, setEmployerAddress] = useState({
    street: "",
    subdivision: "",
    municipality: "",
    barangay: "",
    landmark: "",
  })
  const [requirementsFile, setRequirementsFile] = useState(null)
  const [employerRequests, setEmployerRequests] = useState([])
  const [adminUsers, setAdminUsers] = useState([])
  const [jobForm, setJobForm] = useState({
    title: "",
    company: "",
    location: "",
    description: "",
    requirements: "",
    salary: "",
    locationType: "",
    employmentType: "",
    skills: [],
  })
  const [showCreateJobPosting, setShowCreateJobPosting] = useState(false)
  const [employerJobStatusFilter, setEmployerJobStatusFilter] = useState('all')
  const [editingJob, setEditingJob] = useState(null)
  const [editingJobCanSave, setEditingJobCanSave] = useState(false)
  const [editingJobForm, setEditingJobForm] = useState({
    title: '',
    company: '',
    location: '',
    description: '',
    requirements: '',
    salary: '',
    locationType: '',
    employmentType: '',
    skills: [],
  })
  const [availableJobs, setAvailableJobs] = useState([])
  const [appliedJobs, setAppliedJobs] = useState([])
  const [pendingJobs, setPendingJobs] = useState([])
  const [notifications, setNotifications] = useState([])
  const [approvedJobs, setApprovedJobs] = useState([])
  const [declinedJobs, setDeclinedJobs] = useState([])
  const [referredApplicantIdsByJob, setReferredApplicantIdsByJob] = useState({})
  const [myJobs, setMyJobs] = useState([])
  const [jobSearchTerm, setJobSearchTerm] = useState('')
  const [adminJobSearchTerm, setAdminJobSearchTerm] = useState('')
  const [adminEmployerSearchTerm, setAdminEmployerSearchTerm] = useState('')
  const [adminEmployerStatusFilter, setAdminEmployerStatusFilter] = useState('all')
  const [adminJobStatusFilter, setAdminJobStatusFilter] = useState('all')
  const [jobSkillFilter, setJobSkillFilter] = useState('all')
  const [jobLocationFilter, setJobLocationFilter] = useState('all')
  const [jobLocationTypeFilter, setJobLocationTypeFilter] = useState('all')
  const [jobEmploymentTypeFilter, setJobEmploymentTypeFilter] = useState('all')
  const [jobLoading, setJobLoading] = useState(false)
  const [selectedJob, setSelectedJob] = useState(null)
  const [selectedNotification, setSelectedNotification] = useState(null)
  const [referralPrefill, setReferralPrefill] = useState({ jobId: '', applicantIds: [] })
  const [appMessage, setAppMessage] = useState(null)
  const [declineRequestTarget, setDeclineRequestTarget] = useState(null)
  const [declineReason, setDeclineReason] = useState('')
  const [declineJobTarget, setDeclineJobTarget] = useState(null)
  const [declineJobReason, setDeclineJobReason] = useState('')
  const [approveRequestTarget, setApproveRequestTarget] = useState(null)
  const [expandedDirectoryUserId, setExpandedDirectoryUserId] = useState(null)
  const [showVerificationModal, setShowVerificationModal] = useState(false)
  const [verificationEmail, setVerificationEmail] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [showSkillPrompt, setShowSkillPrompt] = useState(false)

  const applicantProfileInitials = (profileData.name || currentUser?.email || 'Applicant')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'A'

  const saveProfile = (nextProfile) => {
    const token = currentUser?.token || localStorage.getItem('peso-token')
    if (!token) return Promise.resolve({ ok: false })

    return fetch('${API_URL}/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ profile: nextProfile }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          alert(data.error)
          return { ok: false }
        }
        return { ok: true, data }
      })
      .catch((err) => {
        console.error(err)
        alert('Save failed')
        return { ok: false }
      })
  }

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('peso-active-role', activeRole)
      localStorage.setItem('peso-active-view', activeView)
    }
  }, [activeRole, activeView])

  useEffect(() => {
    if (activeRole === "Admin" && activeView === "records") {
      setActiveView("employers")
    }
  }, [activeRole, activeView])

  const getToken = () =>
    currentUser?.token || (typeof window !== "undefined" ? localStorage.getItem('peso-token') : null)

  const handleImageFile = (file, field) => {
    if (!file) return
    if (file.size > 2 * 1024 * 1024) return alert('Image must be under 2 MB')
    const reader = new FileReader()
    reader.onload = () => setProfileData((current) => ({ ...current, [field]: reader.result }))
    reader.readAsDataURL(file)
  }

  const handleViewResume = async () => {
    const token = getToken()
    if (!token) return alert('Not authenticated')
    const applicantId = currentUser?.id || currentUser?._id
    if (!applicantId) return alert('Applicant record not found')
    const preview = window.open('', '_blank')
    try {
      const response = await fetch(`${API_URL}/api/applicants/${applicantId}/resume`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) {
        preview?.close()
        const data = await response.json().catch(() => null)
        return alert(data?.error || 'Resume could not be opened')
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      if (preview) preview.location.href = url
      else window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      preview?.close()
      console.error(err)
      alert('Failed to open resume')
    }
  }

  const fetchEmployerRequests = () => {
    const token = getToken()
    if (!token) return

    fetch('${API_URL}/api/employer-requests', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setEmployerRequests(Array.isArray(data) ? data : []))
      .catch(() => setEmployerRequests([]))
  }

  const fetchNotifications = () => {
    const token = getToken()
    if (!token) return

    fetch('${API_URL}/api/notifications', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : []
        // Deduplicate by _id to guard against double-fetch (StrictMode / overlapping effects)
        const seen = new Set()
        const unique = list.filter((n) => {
          const id = String(n?._id || n?.id || '')
          if (!id || seen.has(id)) return false
          seen.add(id)
          return true
        })
        setNotifications(unique)
      })
      .catch(() => setNotifications([]))
  }

  const fetchJobs = () => {
    const token = getToken()
    if (!token) return

    const headers = { Authorization: `Bearer ${token}` }
    if (activeRole === "Applicant") {
      setJobLoading(true)
      const approvedRequest = fetch('${API_URL}/api/jobs?status=approved', { headers })
        .then((r) => r.json())
        .then((data) => setAvailableJobs(Array.isArray(data) ? sortJobsByMatch(data, profileData.skills) : []))
        .catch(() => setAvailableJobs([]))

      const appliedRequest = fetch('${API_URL}/api/jobs?status=applied', { headers })
        .then((r) => r.json())
        .then((data) => setAppliedJobs(Array.isArray(data) ? data : []))
        .catch(() => setAppliedJobs([]))

      Promise.all([approvedRequest, appliedRequest]).finally(() => setJobLoading(false))
      return
    }

    if (activeRole === "Employer") {
      setJobLoading(true)
      fetch('${API_URL}/api/jobs?status=mine', { headers })
        .then((r) => r.json())
        .then((data) => {
          const jobs = Array.isArray(data) ? data : []
          setMyJobs(jobs)
          setPendingJobs(jobs.filter((job) => job.status === 'pending'))
        })
        .catch(() => setMyJobs([]))
        .finally(() => setJobLoading(false))
      return
    }

    if (activeRole === "Admin") {
      setJobLoading(true)
      const pendingRequest = fetch('${API_URL}/api/jobs?status=pending', { headers })
        .then((r) => r.json())
        .then((data) => setPendingJobs(Array.isArray(data) ? data : []))
        .catch(() => setPendingJobs([]))

      const approvedRequest = fetch('${API_URL}/api/jobs?status=approved', { headers })
        .then((r) => r.json())
        .then((data) => setApprovedJobs(Array.isArray(data) ? data : []))
        .catch(() => setApprovedJobs([]))

      const declinedRequest = fetch('${API_URL}/api/jobs?status=declined', { headers })
        .then((r) => r.json())
        .then((data) => setDeclinedJobs(Array.isArray(data) ? data : []))
        .catch(() => setDeclinedJobs([]))

      Promise.all([pendingRequest, approvedRequest, declinedRequest]).finally(() => setJobLoading(false))
      fetchEmployerRequests()
      fetchAdminReferrals()
    }
  }

  const fetchAdminUsers = () => {
    const token = getToken()
    if (!token) return
    fetch('${API_URL}/api/admin/users', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setAdminUsers(Array.isArray(data) ? data : []))
      .catch(() => setAdminUsers([]))
  }

  const fetchAdminReferrals = () => {
    const token = getToken()
    if (!token) return

    fetch('${API_URL}/api/referrals/admin', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        const referredByJob = (Array.isArray(data) ? data : []).reduce((current, referral) => {
          const jobId = String(referral.jobId || '')
          const applicantId = String(referral.applicantId || '')
          if (!jobId || !applicantId) return current
          return {
            ...current,
            [jobId]: [...new Set([...(current[jobId] || []), applicantId])],
          }
        }, {})
        setReferredApplicantIdsByJob(referredByJob)
      })
      .catch(() => setReferredApplicantIdsByJob({}))
  }

  const handleCreateJob = (event) => {
    event.preventDefault()
    const token = getToken()
    if (!token) return alert('Not authenticated')
    const { title, company, description, skills } = jobForm
    const payload = { ...jobForm, company: company || profileData.companyName || '', location: jobForm.location || profileData.location || '' }
    if (!title || !payload.company || !description) return alert('Title, company, and description are required')
    if (!Array.isArray(skills) || skills.length === 0) return alert('Please select at least one skill for the job')

    fetch('${API_URL}/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) return alert(data.error)
        setJobForm({ title: '', company: '', location: '', description: '', requirements: '', salary: '', locationType: '', employmentType: '', skills: [] })
        setShowCreateJobPosting(false)
        fetchJobs()
        fetchNotifications()
        alert('Job request submitted for review')
      })
      .catch((err) => {
        console.error(err)
        alert('Failed to submit job request')
      })
  }

  const openEditJob = (job, canSave = true) => {
    setEditingJob(job)
    setEditingJobCanSave(canSave)
    setEditingJobForm({
      title: job.title || '',
      company: job.company || '',
      location: job.location || '',
      description: job.description || '',
      requirements: job.requirements || '',
      salary: job.salary || '',
      locationType: job.locationType || '',
      employmentType: job.employmentType || '',
      skills: Array.isArray(job.skills) ? job.skills : [],
    })
  }

  const handleSaveEditedJob = async (event) => {
    event.preventDefault()
    if (!editingJob || !editingJobCanSave) return
    if (!editingJobForm.title || !editingJobForm.company || !editingJobForm.description) {
      return alert('Title, company, and description are required')
    }
    if (!Array.isArray(editingJobForm.skills) || editingJobForm.skills.length === 0) {
      return alert('Please select at least one skill for the job')
    }
    if (!window.confirm('Save these changes to the approved job posting?')) return

    const token = getToken()
    if (!token) return alert('Not authenticated')

    try {
      const response = await fetch(`${API_URL}/api/jobs/${editingJob._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(editingJobForm),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || data?.error) throw new Error(data?.error || `Request failed: ${response.status}`)

      setEditingJob(null)
      fetchJobs()
      fetchNotifications()
      alert('Job posting updated successfully')
    } catch (err) {
      console.error(err)
      alert(err?.message || 'Failed to update job posting')
    }
  }

  const handleReviewJob = (jobId, status, options = {}) => {
    const token = getToken()
    if (!token) return alert('Not authenticated')
    const declineReasonValue = typeof options.reason === 'string' ? options.reason.trim() : ''
    if (status === 'declined' && !Object.prototype.hasOwnProperty.call(options, 'reason')) {
      const allKnownJobs = [...pendingJobs, ...approvedJobs, ...declinedJobs]
      const matchedJob = allKnownJobs.find((job) => String(job?._id) === String(jobId))
      setDeclineJobTarget(matchedJob || { _id: jobId, title: 'this job posting' })
      setDeclineJobReason('')
      setSelectedNotification(null)
      return
    }

    if (status === 'approved') {
      const allKnownJobs = [...pendingJobs, ...approvedJobs, ...declinedJobs]
      const matchedJob = allKnownJobs.find((job) => String(job?._id) === String(jobId))
      const jobTitle = matchedJob?.title || 'this job posting'
      if (!window.confirm(`Approve "${jobTitle}"? It will become visible to applicants.`)) return
    }

    fetch(`${API_URL}/api/jobs/${jobId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status, reason: status === 'declined' ? declineReasonValue : '' }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) return alert(data.error)
        fetchJobs()
        fetchNotifications()
        setSelectedNotification(null)
        if (status === 'declined') {
          setDeclineJobTarget(null)
          setDeclineJobReason('')
        }
        alert(`Job ${status}`)
      })
      .catch((err) => {
        console.error(err)
        alert('Failed to update job status')
      })
  }

  const handleBulkReviewJobs = async (jobIds, status) => {
    const token = getToken()
    if (!token) return alert('Not authenticated')
    const ids = Array.isArray(jobIds) ? jobIds : []
    if (ids.length === 0) return alert('Select at least one job posting first')
    if (!window.confirm(`${status === 'approved' ? 'Approve' : 'Decline'} ${ids.length} selected job posting${ids.length === 1 ? '' : 's'}?`)) return

    try {
      const results = await Promise.all(ids.map((jobId) =>
        fetch(`${API_URL}/api/jobs/${jobId}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status }),
        }).then((r) => r.json()),
      ))
      const failed = results.filter((r) => r && r.error)
      fetchJobs()
      fetchNotifications()
      if (failed.length > 0) {
        alert(`${ids.length - failed.length} job(s) ${status}; ${failed.length} failed`)
      } else {
        alert(`${ids.length} job posting${ids.length === 1 ? '' : 's'} ${status}`)
      }
    } catch (err) {
      console.error(err)
      alert('Failed to update job statuses')
    }
  }

  const handleApplyJob = async (jobId, applicationFile) => {
    const token = getToken()
    if (!token) {
      alert('Not authenticated')
      return false
    }
    if (!applicationFile) {
      alert('Please upload your completed NSRP form (PDF or DOCX)')
      return false
    }

    const payload = new FormData()
    payload.append('nsrp', applicationFile)

    try {
      const response = await fetch(`${API_URL}/api/jobs/${jobId}/apply`, {
      method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: payload,
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || data?.error) {
        alert(data?.error || 'Failed to apply')
        return false
      }
      fetchJobs()
      alert('Application submitted')
      return true
    } catch (err) {
      console.error(err)
      alert('Failed to apply')
      return false
    }
  }

  const handleSubmitEmployerRequest = async (event) => {
    event.preventDefault()
    const { email, password, confirmPassword, companyName, contactName } = employerRequestForm
    if (!email || !password || !companyName || !contactName) return alert('Please fill in required fields')
    if (password !== confirmPassword) return alert('Passwords do not match')
    if (!/^\d{11}$/.test(employerRequestForm.phone)) return alert('Phone number must contain exactly 11 digits')
    if (!employerAddress.municipality || !employerAddress.barangay) return alert('Please select your City/Municipality and Barangay')

    const addressParts = [
      employerAddress.street,
      employerAddress.subdivision,
      `Brgy. ${employerAddress.barangay}`,
      employerAddress.municipality,
      'Albay',
      employerAddress.landmark ? `Landmark: ${employerAddress.landmark}` : '',
    ].filter((part) => typeof part === 'string' && part.trim() !== '')
    const payload = { ...employerRequestForm, location: addressParts.join(', ') }

    try {
      const response = await fetch('${API_URL}/api/employer-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const contentType = response.headers.get('content-type') || ''
      const data = contentType.includes('application/json') ? await response.json() : null

      if (!response.ok) {
        const message = data?.error || `Request failed: ${response.status} ${response.statusText}`
        return alert(message)
      }

      setEmployerRequestForm({ email: '', password: '', confirmPassword: '', companyName: '', contactName: '', location: '', phone: '', message: '' })
      setEmployerAddress({ street: '', subdivision: '', municipality: '', barangay: '', landmark: '' })
      setAuthView('login')
      alert('Employer account created. You can now sign in and submit your NSRP registration form for review.')
    } catch (err) {
      console.error('Employer request submit failed:', err)
      alert(err?.message || 'Failed to submit employer request')
    }
  }

  const handleSubmitEmployerRequirements = async (event) => {
    event.preventDefault()
    const token = getToken()
    if (!token || !requirementsFile) return alert('Select the NSRP registration PDF first')

    const payload = new FormData()
    payload.append('requirements', requirementsFile)
    try {
      const response = await fetch('${API_URL}/api/employer-requirements', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: payload,
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) return alert(data?.error || 'Failed to submit requirements')
      setRequirementsFile(null)
      alert('NSRP registration form submitted for admin review.')
      const profileResponse = await fetch('${API_URL}/api/profile', { headers: { Authorization: `Bearer ${token}` } })
      const profile = await profileResponse.json().catch(() => null)
      if (profile && !profile.error) setCurrentUser((current) => ({ ...current, verificationStatus: profile.verificationStatus, verificationReason: profile.verificationReason }))
      fetchEmployerRequests()
    } catch (err) {
      alert(err?.message || 'Failed to submit requirements')
    }
  }

  const handleReviewApplicantVerification = (applicantId, status) => {
    const token = getToken()
    if (!token) return alert('Not authenticated')
    const reason = status === 'declined' ? (window.prompt('Reason for declining (optional)') || '') : ''
    fetch(`${API_URL}/api/applicants/${applicantId}/verification`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status, reason }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) return setAppMessage({ type: 'error', text: data.error })
        fetchAdminUsers()
        setAppMessage({ type: 'success', text: `Applicant ${status}.` })
      })
      .catch((err) => {
        console.error(err)
        setAppMessage({ type: 'error', text: err?.message || 'Failed to update applicant' })
      })
  }

  const handleReviewEmployerRequest = (requestId, status) => {
    const token = getToken()
    if (!token) return alert('Not authenticated')
    fetch(`${API_URL}/api/employer-requests/${requestId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status, reason: status === 'declined' ? declineReason.trim() : '' }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) return setAppMessage({ type: 'error', text: data.error })
        fetchEmployerRequests()
        fetchNotifications()
        setDeclineRequestTarget(null)
        setDeclineReason('')
        setAppMessage({ type: 'success', text: `Employer request ${status}.` })
      })
      .catch((err) => {
        console.error(err)
        setAppMessage({ type: 'error', text: err?.message || 'Failed to update employer request' })
      })
  }

  const handleDownloadRequirements = async (requestId, filename) => {
    const token = getToken()
    if (!token) return
    const response = await fetch(`${API_URL}/api/employer-requirements/${requestId}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) return alert('Requirements PDF could not be downloaded')
    const blob = await response.blob()
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = filename || 'nsrp-registration-form.pdf'
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const handleViewRequirements = async (requestId) => {
    const token = getToken()
    if (!token) return
    const preview = window.open('', '_blank')
    const response = await fetch(`${API_URL}/api/employer-requirements/${requestId}/view`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) {
      preview?.close()
      return alert('Requirements PDF could not be opened')
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    if (preview) preview.location.href = url
    else window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const handleViewApplicantResumeAdmin = async (applicantId) => {
    const token = getToken()
    if (!token) return alert('Not authenticated')
    const preview = window.open('', '_blank')
    try {
      const response = await fetch(`${API_URL}/api/applicants/${applicantId}/resume`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) {
        preview?.close()
        return alert('Resume could not be opened')
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      if (preview) preview.location.href = url
      else window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      preview?.close()
      alert('Resume could not be opened')
    }
  }

  const handleViewOwnRequirements = async () => {
    const token = getToken()
    if (!token) return
    const preview = window.open('', '_blank')
    const response = await fetch('${API_URL}/api/employer-requirements/current/view', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) {
      preview?.close()
      return alert('Your submitted PDF could not be opened')
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    if (preview) preview.location.href = url
    else window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const handleReferApplicantFromJob = async (jobId, applicantEmail, isReferred = false) => {
    const token = getToken()
    if (!token) {
      if (isReferred) return setAppMessage({ type: 'error', text: 'Not authenticated. Please sign in again.' })
      return alert('Not authenticated')
    }

    const applicant = adminUsers.find(
      (user) => user.role === 'Applicant' && String(user.email || '').toLowerCase() === String(applicantEmail || '').toLowerCase(),
    )

    if (!applicant) {
      fetchAdminUsers()
      if (isReferred) return setAppMessage({ type: 'error', text: 'Applicant record not found yet. Please try again in a moment.' })
      return alert('Applicant record not found yet. Please try again in a moment.')
    }

    const applicantId = String(applicant.id || applicant._id)
    const applicantName = applicant.profile?.name || applicant.email
    if (!window.confirm(`${isReferred ? 'Cancel referral for' : 'Refer'} ${applicantName}${isReferred ? '?' : ' to this job?'}`)) return

    try {
      const response = await fetch('${API_URL}/api/referrals', {
        method: isReferred ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jobId, applicantIds: [applicantId] }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || data?.error) throw new Error(data?.error || `Request failed: ${response.status}`)

      fetchJobs()
      fetchNotifications()
      if (isReferred) {
        setAppMessage({ type: 'success', text: 'Referral cancelled successfully.' })
      } else {
        alert(data?.createdCount === 0 ? 'Applicant was already referred' : 'Applicant referred successfully')
      }
    } catch (err) {
      console.error(err)
      if (isReferred) {
        setAppMessage({ type: 'error', text: err?.message || 'Failed to cancel referral.' })
      } else {
        alert(err?.message || 'Failed to create referral')
      }
    }
  }

  const handleBulkReferApplicants = async (jobId, applicantIdsArray) => {
    const token = getToken()
    if (!token) return alert('Not authenticated')
    if (!Array.isArray(applicantIdsArray) || applicantIdsArray.length === 0) return alert('Select at least one applicant to refer.')
    if (!window.confirm(`Refer ${applicantIdsArray.length} selected applicant${applicantIdsArray.length === 1 ? '' : 's'} to this job?`)) return

    try {
      const response = await fetch('${API_URL}/api/referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jobId, applicantIds: applicantIdsArray }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || data?.error) throw new Error(data?.error || `Request failed: ${response.status}`)
      fetchJobs()
      fetchNotifications()
      alert(data?.createdCount === 0 ? 'Selected applicants were already referred' : `Referred ${data?.createdCount} applicant${data?.createdCount === 1 ? '' : 's'} successfully`)
    } catch (err) {
      console.error(err)
      alert(err?.message || 'Failed to refer selected applicants')
    }
  }

  const isNewApplicationNotification = (notification) =>
    notification?.type === 'new_application' || notification?.kind === 'new_application'

  const markNotificationAsRead = async (notificationId) => {
    const token = getToken()
    if (!token || !notificationId) return

    try {
      const response = await fetch(`${API_URL}/api/notifications/${notificationId}/read`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        console.warn('Failed to mark notification as read:', payload?.error || response.status)
      }
    } catch (err) {
      console.warn('Failed to mark notification as read:', err?.message || err)
    }
  }

  const handleNotificationClick = async (notification) => {
    if (activeRole === 'Admin' && isNewApplicationNotification(notification)) {
      const notificationId = String(notification?._id || '')
      if (notificationId && !notificationId.startsWith('job-')) {
        await markNotificationAsRead(notificationId)
      }

      setNotifications((current) =>
        current.map((item) =>
          String(item._id) === String(notification._id) ? { ...item, read: true } : item,
        ),
      )

      setReferralPrefill({
        jobId: notification?.jobId ? String(notification.jobId) : '',
        applicantIds: notification?.applicantId ? [String(notification.applicantId)] : [],
      })
      setSelectedNotification(null)
      setActiveView('peso-referrals')
      return
    }

    setSelectedNotification(notification)
  }

  useEffect(() => {
    if (isLoggedIn) {
      fetchJobs()
      fetchNotifications()
    }
    if (isLoggedIn && activeRole === 'Employer' && currentUser?.verificationStatus && currentUser.verificationStatus !== 'approved' && !['home', 'dashboard', 'profile'].includes(activeView)) {
      setActiveView('home')
    }
    if (isLoggedIn && activeRole === 'Applicant' && currentUser?.verificationStatus && currentUser.verificationStatus !== 'approved' && !['home', 'profile'].includes(activeView)) {
      setActiveView('home')
    }
    if (isLoggedIn && activeRole === 'Admin' && ['records', 'employers', 'applicants', 'requests', 'jobs', 'peso-referrals'].includes(activeView)) fetchAdminUsers()
  }, [isLoggedIn, activeRole, activeView, currentUser?.verificationStatus, profileData.skills])

  useEffect(() => {
    if (isLoggedIn) {
      fetchNotifications()
    }
  }, [isLoggedIn, currentUser?.email])

  useEffect(() => {
    const token = localStorage.getItem('peso-token')
    if (!token) return

    fetch('${API_URL}/api/profile', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.error) {
          localStorage.removeItem('peso-token')
          return
        }
        const norm = normalizeProfile({ profile: data.profile, companyName: data.companyName, contactName: data.contactName, phone: data.phone }, data.role)
        setCurrentUser({ id: data.id, email: data.email, role: data.role, companyName: data.companyName, contactName: data.contactName, phone: data.phone, profile: data.profile, verificationStatus: data.verificationStatus, verificationReason: data.verificationReason, token })
        setActiveRole(data.role)
        setIsLoggedIn(true)
        setProfileData(norm)
        setResumeInfo(data.resumeFile || null)
        setNsrpVerificationInfo(data.nsrpVerificationFile || null)
      })
      .catch(() => {
        localStorage.removeItem('peso-token')
      })
  }, [])

  useEffect(() => {
    if (!isLoggedIn || activeRole !== 'Employer') return undefined

    const refreshEmployerVerification = () => {
      const token = getToken()
      if (!token) return
      fetch('${API_URL}/api/profile', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.error) return
          setCurrentUser((current) => ({
            ...current,
            verificationStatus: data.verificationStatus,
            verificationReason: data.verificationReason,
            requirementsFile: data.requirementsFile,
          }))
        })
        .catch(() => {})
    }

    refreshEmployerVerification()
    const intervalId = window.setInterval(refreshEmployerVerification, 5000)
    return () => window.clearInterval(intervalId)
  }, [isLoggedIn, activeRole])

  const handleLogin = (event) => {
    event.preventDefault()
    // call backend login
    fetch('${API_URL}/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: formData.email, password: formData.password }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) return alert(data.error)

        if (rememberMe) {
          localStorage.setItem('peso-portal-remembered-email', formData.email)
        } else {
          localStorage.removeItem('peso-portal-remembered-email')
        }

        if (data.token) localStorage.setItem('peso-token', data.token)

        setCurrentUser({ ...data.user, token: data.token })
        setActiveRole(data.user.role)
        const needsVerification = ['Employer', 'Applicant'].includes(data.user.role) && data.user.verificationStatus && data.user.verificationStatus !== 'approved'
        setActiveView(needsVerification ? 'home' : navigationByRole[data.user.role]?.[0]?.id || "dashboard")
        setIsLoggedIn(true)
        setProfileData(normalizeProfile(data.user, data.user.role))
        setResumeInfo(data.user.resumeFile || null)
        setNsrpVerificationInfo(data.user.nsrpVerificationFile || null)
      })
      .catch((err) => {
        console.error(err)
        alert('Login failed')
      })
  }

  const handleSignup = (event) => {
    event.preventDefault()
    if (signupForm.password !== signupForm.confirmPassword) {
      alert('Passwords do not match')
      return
    }
    // Call backend signup
    fetch('${API_URL}/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: signupForm.email,
        password: signupForm.password,
        name: signupForm.name,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) return alert(data.error)
        if (data.token) localStorage.setItem('peso-token', data.token)
        const applicantProfile = normalizeProfile(data.user, data.user.role || 'Applicant')
        setCurrentUser({ ...data.user, token: data.token, role: 'Applicant' })
        setActiveRole('Applicant')
        setActiveView('home')
        setIsLoggedIn(true)
        setProfileData(applicantProfile)
        setShowSkillPrompt(true)
        setAuthView("login")
      })
      .catch((err) => {
        console.error(err)
        alert('Signup failed')
      })
  }

  const handleLogout = () => {
    localStorage.removeItem("peso-portal-remembered-email")
    localStorage.removeItem('peso-token')
    setCurrentUser(null)
    setIsLoggedIn(false)
    setFormData({ email: "", password: "" })
    setRememberMe(false)
    setShowPassword(false)
    setActiveRole("Applicant")
    setActiveView("home")
  }

  const normalizedSearchTerm = jobSearchTerm.trim().toLowerCase()
  const locationFilterOptions = Array.from(
    new Set(
      availableJobs
        .map((job) => (job.location || '').trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b))

  const appliedJobIds = new Set(appliedJobs.map((job) => String(job._id)))

  const filteredApplicantJobs = availableJobs.filter((job) => {
    if (appliedJobIds.has(String(job._id))) return false
    const normalizedSkills = normalizeSkills(job.skills)
    const locationValue = (job.location || '').trim()
    const matchesSearch =
      !normalizedSearchTerm ||
      [job.title, job.company, job.description, job.requirements]
        .filter((value) => typeof value === 'string')
        .some((value) => value.toLowerCase().includes(normalizedSearchTerm))
    const matchesSkill = jobSkillFilter === 'all' || normalizedSkills.includes(jobSkillFilter)
    const matchesLocation = jobLocationFilter === 'all' || locationValue === jobLocationFilter
    const matchesLocationType = jobLocationTypeFilter === 'all' || (job.locationType || '') === jobLocationTypeFilter
    const matchesEmploymentType = jobEmploymentTypeFilter === 'all' || (job.employmentType || '') === jobEmploymentTypeFilter
    return matchesSearch && matchesSkill && matchesLocation && matchesLocationType && matchesEmploymentType
  })

  const normalizedAdminJobSearchTerm = adminJobSearchTerm.trim().toLowerCase()
  const matchesAdminJobSearch = (job) => {
    if (!normalizedAdminJobSearchTerm) return true
    return [job.title, job.company, job.location, job.description, job.requirements, job.createdBy]
      .filter((value) => typeof value === 'string')
      .some((value) => value.toLowerCase().includes(normalizedAdminJobSearchTerm))
  }
  const filteredPendingJobs = pendingJobs.filter((job) => (activeRole === 'Admin' ? matchesAdminJobSearch(job) : true))
  const filteredApprovedJobs = approvedJobs.filter((job) => (activeRole === 'Admin' ? matchesAdminJobSearch(job) : true))
  const filteredDeclinedJobs = declinedJobs.filter((job) => (activeRole === 'Admin' ? matchesAdminJobSearch(job) : true))
  const employerPendingJobs = myJobs.filter((job) => job.status === 'pending')
  const employerDeclinedJobs = myJobs.filter((job) => job.status === 'declined')
  const employerApprovedJobs = myJobs.filter((job) => job.status === 'approved')
  const filteredMyJobs = employerJobStatusFilter === 'all' ? myJobs : myJobs.filter((job) => (job.status || 'pending') === employerJobStatusFilter)
  const showPendingAdminSection = activeRole === 'Admin' && (adminJobStatusFilter === 'all' || adminJobStatusFilter === 'pending')
  const showApprovedAdminSection = activeRole === 'Admin' && (adminJobStatusFilter === 'all' || adminJobStatusFilter === 'approved')
  const showDeclinedAdminSection = activeRole === 'Admin' && (adminJobStatusFilter === 'all' || adminJobStatusFilter === 'declined')

  const selectedJobIsApplied = Boolean(selectedJob && (appliedJobIds.has(String(selectedJob._id)) || (selectedJob.applicants || []).some((applicant) => applicant.email === currentUser?.email)))
  const selectedNotificationId = selectedNotification?._id ? String(selectedNotification._id) : ''
  const selectedNotificationJobId = selectedNotification?.jobId || (selectedNotificationId.startsWith('job-pending-') ? selectedNotificationId.replace('job-pending-', '') : null)
  const selectedNotificationIsPending = selectedNotification?.status === 'pending' || (selectedNotification?.title || '').toLowerCase().includes('pending')
  const accountNeedsVerification = Boolean(
    currentUser?.verificationStatus && currentUser.verificationStatus !== 'approved',
  )

  if (!isLoggedIn) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo" aria-label="Public Employment Service Office">
            <img
              src="/peso-logo.png"
              alt="Public Employment Service Office logo"
              onError={(event) => { event.currentTarget.style.display = 'none' }}
            />
          </div>
          <div className="auth-heading">
            <h1>{authView === "signup" ? "Sign Up" : "Welcome back"}</h1>
            <p>Enter your PESO account credentials to continue.</p>
          </div>
          {authView === "login" ? (
            <form className="auth-form" onSubmit={handleLogin}>
              <div>
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
              <div>
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(event) => setFormData({ ...formData, password: event.target.value })}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="auth-password-toggle"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <div className="auth-options">
                <label className="auth-remember">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={() => setRememberMe((value) => !value)}
                  />
                  Remember me
                </label>
                <button
                  type="button"
                  className="auth-link"
                >
                  Forgot password?
                </button>
              </div>
              <button type="submit" className="auth-primary-button auth-signin-button">Sign in</button>

              <div className="auth-divider"><span>NEW TO PESO PORTAL?</span></div>
              <div className="auth-account-actions">
                <button
                  type="button"
                  onClick={() => setAuthView("signup")}
                  className="auth-secondary-button"
                >
                  Create an account (Applicant)
                </button>
                <button
                  type="button"
                  onClick={() => setAuthView("employer")}
                  className="auth-secondary-button"
                >
                  Connect with us (Employer)
                </button>
              </div>
            </form>
          ) : authView === "employer" ? (
            <form className="auth-form auth-detail-form" onSubmit={handleSubmitEmployerRequest}>
              <div>
                <label htmlFor="employer-email" className="block text-sm font-medium text-slate-200">
                  Email
                </label>
                <input
                  id="employer-email"
                  type="email"
                  value={employerRequestForm.email}
                  onChange={(e) => setEmployerRequestForm({ ...employerRequestForm, email: e.target.value })}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                  required
                />
              </div>
              <div>
                <label htmlFor="employer-password" className="block text-sm font-medium text-slate-200">
                  Password
                </label>
                <input
                  id="employer-password"
                  type={showEmployerPasswords ? "text" : "password"}
                  value={employerRequestForm.password}
                  onChange={(e) => setEmployerRequestForm({ ...employerRequestForm, password: e.target.value })}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                  required
                />
                <button
                  type="button"
                  aria-label={showEmployerPasswords ? "Hide passwords" : "Show passwords"}
                  onClick={() => setShowEmployerPasswords((value) => !value)}
                  className="auth-password-toggle"
                >
                  {showEmployerPasswords ? "?" : "?"}
                </button>
              </div>
              <div>
                <label htmlFor="employer-confirm-password" className="block text-sm font-medium text-slate-200">
                  Confirm Password
                </label>
                <input
                  id="employer-confirm-password"
                  type={showEmployerPasswords ? "text" : "password"}
                  value={employerRequestForm.confirmPassword}
                  onChange={(e) => setEmployerRequestForm({ ...employerRequestForm, confirmPassword: e.target.value })}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                  required
                />
                <button
                  type="button"
                  aria-label={showEmployerPasswords ? "Hide passwords" : "Show passwords"}
                  onClick={() => setShowEmployerPasswords((value) => !value)}
                  className="auth-password-toggle"
                >
                  {showEmployerPasswords ? "?" : "?"}
                </button>
              </div>
              <div>
                <label htmlFor="employer-company" className="block text-sm font-medium text-slate-200">
                  Company Name
                </label>
                <input
                  id="employer-company"
                  type="text"
                  value={employerRequestForm.companyName}
                  onChange={(e) => setEmployerRequestForm({ ...employerRequestForm, companyName: e.target.value })}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                  required
                />
              </div>
              <div>
                <label htmlFor="employer-contact" className="block text-sm font-medium text-slate-200">
                  Contact Name
                </label>
                <input
                  id="employer-contact"
                  type="text"
                  value={employerRequestForm.contactName}
                  onChange={(e) => setEmployerRequestForm({ ...employerRequestForm, contactName: e.target.value })}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                  required
                />
              </div>
              <div>
                <label htmlFor="employer-street" className="block text-sm font-medium text-slate-200">
                  House/Unit No. &amp; Street
                </label>
                <input
                  id="employer-street"
                  type="text"
                  value={employerAddress.street}
                  onChange={(e) => setEmployerAddress({ ...employerAddress, street: e.target.value })}
                  placeholder="e.g. Blk 2 Lot 5, Rizal St."
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label htmlFor="employer-subdivision" className="block text-sm font-medium text-slate-200">
                  Subdivision/Village/Building <span className="font-normal text-slate-400">(if applicable)</span>
                </label>
                <input
                  id="employer-subdivision"
                  type="text"
                  value={employerAddress.subdivision}
                  onChange={(e) => setEmployerAddress({ ...employerAddress, subdivision: e.target.value })}
                  placeholder="e.g. Greenview Subdivision"
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label htmlFor="employer-municipality" className="block text-sm font-medium text-slate-200">
                  City/Municipality
                </label>
                <select
                  id="employer-municipality"
                  value={employerAddress.municipality}
                  onChange={(e) => setEmployerAddress({ ...employerAddress, municipality: e.target.value, barangay: '' })}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                  required
                >
                  <option value="">Select city/municipality</option>
                  {albayMunicipalities.map((municipality) => (
                    <option key={municipality} value={municipality}>{municipality}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="employer-barangay" className="block text-sm font-medium text-slate-200">
                  Barangay
                </label>
                <select
                  id="employer-barangay"
                  value={employerAddress.barangay}
                  onChange={(e) => setEmployerAddress({ ...employerAddress, barangay: e.target.value })}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                  disabled={!employerAddress.municipality}
                  required
                >
                  <option value="">{employerAddress.municipality ? 'Select barangay' : 'Select city/municipality first'}</option>
                  {(albayLocations[employerAddress.municipality] || []).map((barangay) => (
                    <option key={barangay} value={barangay}>{barangay}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="employer-landmark" className="block text-sm font-medium text-slate-200">
                  Landmark
                </label>
                <input
                  id="employer-landmark"
                  type="text"
                  value={employerAddress.landmark}
                  onChange={(e) => setEmployerAddress({ ...employerAddress, landmark: e.target.value })}
                  placeholder="e.g. Near Brgy. Hall"
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label htmlFor="employer-phone" className="block text-sm font-medium text-slate-200">
                  Phone
                </label>
                <input
                  id="employer-phone"
                  type="tel"
                  inputMode="numeric"
                  maxLength={11}
                  pattern="[0-9]{11}"
                  value={employerRequestForm.phone}
                  onChange={(e) => setEmployerRequestForm({ ...employerRequestForm, phone: e.target.value.replace(/\D/g, '').slice(0, 11) })}
                  className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-black"
                />
              </div>
              <div>
                <label htmlFor="employer-message" className="block text-sm font-medium text-slate-200">
                  Message
                </label>
                <textarea
                  id="employer-message"
                  rows="3"
                  value={employerRequestForm.message}
                  onChange={(e) => setEmployerRequestForm({ ...employerRequestForm, message: e.target.value })}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                  placeholder="Tell us about your company or hiring needs."
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="auth-primary-button auth-account-submit">
                  Create employer account
                </button>
                <button
                  type="button"
                  onClick={() => setAuthView("login")}
                  className="auth-secondary-button"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <form className="auth-form auth-detail-form applicant-signup-form" onSubmit={handleSignup}>
              <div>
                <label htmlFor="signup-name" className="block text-sm font-medium text-slate-200">
                  Name
                </label>
                <input
                  id="signup-name"
                  type="text"
                  value={signupForm.name}
                  onChange={(e) => setSignupForm({ ...signupForm, name: e.target.value })}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label htmlFor="signup-email" className="block text-sm font-medium text-slate-200">
                  Email
                </label>
                <input
                  id="signup-email"
                  type="email"
                  value={signupForm.email}
                  onChange={(e) => setSignupForm({ ...signupForm, email: e.target.value })}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                  required
                />
              </div>
              <div>
                <label htmlFor="signup-password" className="block text-sm font-medium text-slate-200">
                  Password
                </label>
                <input
                  id="signup-password"
                  type={showSignupPassword ? "text" : "password"}
                  value={signupForm.password}
                  onChange={(e) => setSignupForm({ ...signupForm, password: e.target.value })}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                  required
                />
              </div>
              <div>
                <label htmlFor="signup-confirm-password" className="block text-sm font-medium text-slate-200">
                  Confirm password
                </label>
                <input
                  id="signup-confirm-password"
                  type={showSignupPassword ? "text" : "password"}
                  value={signupForm.confirmPassword}
                  onChange={(e) => setSignupForm({ ...signupForm, confirmPassword: e.target.value })}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                  required
                />
              </div>
              <button
                type="button"
                onClick={() => setShowSignupPassword((current) => !current)}
                className="text-sm font-medium text-slate-600 hover:text-black"
              >
                {showSignupPassword ? 'Hide password' : 'Show password'}
              </button>
              <div className="flex gap-2">
                <button type="submit" className="auth-primary-button auth-account-submit">
                  Create account
                </button>
                <button type="button" onClick={() => setAuthView("login")} className="auth-secondary-button">
                  Back to sign in
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    )
  }

  const navItems = navigationByRole[activeRole] || []
  const employerApproved = activeRole !== 'Employer' || !currentUser?.verificationStatus || currentUser.verificationStatus === 'approved'
  const applicantApproved = activeRole !== 'Applicant' || !currentUser?.verificationStatus || currentUser.verificationStatus === 'approved'
  const portalNavItems = navItems.filter((item) => {
    if (item.id === "profile") return false
    if (activeRole === 'Employer') return employerApproved || ['home', 'dashboard', 'profile'].includes(item.id)
    if (activeRole === 'Applicant') return applicantApproved || ['home', 'profile'].includes(item.id)
    return true
  })
  const showProfileTab = ["Applicant", "Employer"].includes(activeRole)

  return (
    <div className={`portal-shell portal-shell-${activeRole.toLowerCase()}`}>
      <header className="portal-header">
        <div className="portal-header-inner">
          <div className="portal-brand">
            <span className="portal-brand-fallback" aria-hidden="true">P</span>
            <img
              src="/peso-logo.png"
              alt="PESO logo"
              onLoad={(event) => { event.currentTarget.previousElementSibling.style.display = 'none' }}
              onError={(event) => { event.currentTarget.style.display = 'none' }}
            />
            <div>
              <p>PESO PORTAL</p>
              <h1>Online Employment Services Platform</h1>
            </div>
          </div>
          <div className="portal-header-actions flex items-center gap-3">
            {showProfileTab && (
              <button
                type="button"
                onClick={() => setActiveView("profile")}
                className={`portal-profile-button inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium transition-colors ${
                  activeView === "profile" ? "bg-cyan-500 text-slate-950" : "text-slate-200"
                }`}
              >
                <span className="portal-profile-icon inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-cyan-500 text-lg font-bold text-slate-950">
                  {profileData.profileImage ? (
                    <img src={profileData.profileImage} alt="Profile" className="h-full w-full object-cover" />
                  ) : (
                    (profileData.companyName || profileData.name || currentUser?.email || '?').trim().charAt(0).toUpperCase()
                  )}
                </span>
                <span>Profile</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="portal-logout"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="portal-layout">
        <aside className="portal-sidebar">
          <div className="portal-session">
            <p className="portal-eyebrow">Session</p>
            <p>Signed in as</p>
            <strong>{currentUser?.email}</strong>
            <span>Role</span>
            <strong>{activeRole}</strong>
          </div>

          <nav className="portal-nav" aria-label={`${activeRole} navigation`}>
            {portalNavItems.map((item, index) => (
              <button
                key={`${item.id}-${item.label}-${index}`}
                type="button"
                onClick={() => setActiveView(item.id)}
                className={`portal-nav-item ${
                  activeView === item.id ? "is-active" : ""
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <div className="portal-content">
          {accountNeedsVerification && (
            <div className="portal-verification-notice" role="status">
              <div>
                <strong>Account is unverified</strong>
                <span>Verification is required before all account features become available.</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setVerificationEmail(currentUser?.email || '')
                  setShowVerificationModal(true)
                }}
                className="portal-verify-button"
              >
                Verify now
              </button>
            </div>
          )}

          {showVerificationModal && (
            <div
              className="portal-verification-overlay"
              role="dialog"
              aria-modal="true"
              aria-labelledby="verify-email-title"
              onClick={() => setShowVerificationModal(false)}
            >
              <form
                className="portal-verification-modal"
                onSubmit={(event) => {
                  event.preventDefault()
                  setCurrentUser((current) => ({ ...current, verificationStatus: 'approved' }))
                  setShowVerificationModal(false)
                }}
                onClick={(event) => event.stopPropagation()}
              >
                <h2 id="verify-email-title">Verify your email</h2>
                <p>Enter your email address to continue verification.</p>
                <label htmlFor="verification-email">Email address</label>
                <input
                  id="verification-email"
                  type="email"
                  value={verificationEmail}
                  onChange={(event) => setVerificationEmail(event.target.value)}
                  required
                />
                <label htmlFor="verification-code">Verification code</label>
                <input
                  id="verification-code"
                  type="text"
                  value={verificationCode}
                  onChange={(event) => setVerificationCode(event.target.value)}
                />
                <div className="portal-verification-actions">
                  <button type="submit" className="portal-verify-submit">Verify email</button>
                  <button type="button" onClick={() => setShowVerificationModal(false)} className="portal-verify-cancel">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {currentUser?.role === "Admin" && (
          <section className="portal-card access-card">
            <h2 className="text-xl font-semibold text-black">Access Control</h2>
            <p className="mt-2 text-sm text-black">Admin can switch the portal role instantly.</p>
            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-[220px]">
                <label htmlFor="admin-role" className="block text-sm font-medium text-black">
                  Selected role
                </label>
                <select
                  id="admin-role"
                  value={adminSelectedRole}
                  onChange={(event) => setAdminSelectedRole(event.target.value)}
                  className="portal-control"
                >
                  <option value="Admin">Admin</option>
                  <option value="Employer">Employer</option>
                  <option value="Applicant">Applicant</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveRole(adminSelectedRole)
                  const nextItems = navigationByRole[adminSelectedRole] || []
                  setActiveView(nextItems[0]?.id || "dashboard")
                }}
                className="portal-primary-button"
              >
                Apply Role
              </button>
            </div>
            <p className="mt-4 text-sm text-black">Current portal role: {activeRole}</p>
          </section>
          )}

          <main className="space-y-6">
          {appMessage && (
            <div
              role="status"
              className={`flex items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-sm ${
                appMessage.type === 'error'
                  ? 'border-rose-400/40 bg-rose-950/40 text-rose-200'
                  : 'border-cyan-400/40 bg-cyan-950/40 text-cyan-200'
              }`}
            >
              <p>{appMessage.text}</p>
              <button
                type="button"
                onClick={() => setAppMessage(null)}
                className="rounded-full border border-current px-3 py-1 text-xs font-semibold"
              >
                Dismiss
              </button>
            </div>
          )}
          {activeView === "home" && (
            <section className="portal-card rounded-2xl border border-slate-300 bg-white p-8 text-black">
              <p className="text-sm font-semibold uppercase tracking-wide text-cyan-600">
                PESO Job Portal
              </p>
              <h2 className="mt-2 text-3xl font-bold text-black">
                {activeRole === 'Employer'
                  ? `Welcome back, ${profileData.companyName || currentUser?.companyName || 'Employer'}`
                  : `Welcome back, ${profileData.name || currentUser?.email || 'Applicant'}`}
              </h2>
              <p className="mt-3 max-w-2xl text-slate-600">
                {activeRole === 'Employer'
                  ? 'Post job openings, track admin approvals, and connect with qualified applicants in Albay.'
                  : 'Browse approved job openings from verified employers and track your applications in one place.'}
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                {activeRole === 'Employer' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setActiveView('employer')}
                      className="rounded-2xl bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-slate-950"
                    >
                      Manage Job Postings
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveView('notify')}
                      className="rounded-2xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-black"
                    >
                      View Notifications
                    </button>
                  </>
                ) : (
                  <>
                    {applicantApproved ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setActiveView('jobs')}
                          className="rounded-2xl bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-slate-950"
                        >
                          Browse Jobs
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveView('profile')}
                          className="rounded-2xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-black"
                        >
                          Update My Profile
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingProfile(true)
                          setActiveView('profile')
                        }}
                        className="rounded-2xl bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-slate-950"
                      >
                        Complete NSRP Verification
                      </button>
                    )}
                  </>
                )}
              </div>

              {activeRole === 'Applicant' && !applicantApproved && (
                <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5">
                  <h3 className="text-lg font-semibold text-black">NSRP verification required</h3>
                  <p className="mt-2 text-sm text-slate-700">
                    Your account is pending verification. Submit your NSRP registration form from your Profile page.
                    Once an admin approves it, you'll be able to browse jobs and apply.
                  </p>
                  <p className="mt-2 text-sm font-medium text-amber-700">
                    Status: {(currentUser?.verificationStatus || 'under_review').replace('_', ' ')}
                  </p>
                  {currentUser?.verificationStatus === 'declined' && currentUser?.verificationReason && (
                    <p className="mt-2 rounded-lg border border-rose-300 bg-rose-50 p-2 text-sm text-rose-700">
                      {currentUser.verificationReason}
                    </p>
                  )}
                </div>
              )}

              <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
                {activeRole === 'Employer' ? (
                  <>
                    <div className="rounded-2xl border border-slate-300 bg-slate-50 p-5">
                      <p className="text-sm text-slate-600">My job requests</p>
                      <p className="mt-2 text-3xl font-bold text-black">{myJobs.length}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-300 bg-slate-50 p-5">
                      <p className="text-sm text-slate-600">Approved postings</p>
                      <p className="mt-2 text-3xl font-bold text-black">{myJobs.filter((job) => job.status === 'approved').length}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-300 bg-slate-50 p-5">
                      <p className="text-sm text-slate-600">Total applicants</p>
                      <p className="mt-2 text-3xl font-bold text-black">{myJobs.reduce((acc, j) => acc + (j.applicants ? j.applicants.length : 0), 0)}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-2xl border border-slate-300 bg-slate-50 p-5">
                      <p className="text-sm text-slate-600">Open jobs</p>
                      <p className="mt-2 text-3xl font-bold text-black">{availableJobs.length}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-300 bg-slate-50 p-5">
                      <p className="text-sm text-slate-600">My applications</p>
                      <p className="mt-2 text-3xl font-bold text-black">{appliedJobs.length}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-300 bg-slate-50 p-5">
                      <p className="text-sm text-slate-600">Notifications</p>
                      <p className="mt-2 text-3xl font-bold text-black">{notifications.length}</p>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <h3 className="text-lg font-semibold text-black">Getting started</h3>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
                  {activeRole === 'Employer' ? (
                    <>
                      <li>Complete your employer profile and submit your NSRP form for verification.</li>
                      <li>Create a job posting request and wait for admin approval.</li>
                      <li>Review applicants and send referrals from the Job Postings tab.</li>
                    </>
                  ) : (
                    <>
                      <li>Fill out your profile and upload your resume so employers can find you.</li>
                      <li>Browse open jobs and apply with your NSRP registration.</li>
                      <li>Watch your notifications for application updates and referrals.</li>
                    </>
                  )}
                </ul>
              </div>
            </section>
          )}
          {activeView === "dashboard" && (
            <section className="admin-requests-card portal-card rounded-2xl border border-slate-300 bg-white p-6 text-black">
              <h2 className="text-xl font-semibold text-black">Dashboard</h2>
              {activeRole === 'Employer' && !employerApproved ? (
                <div className="mt-4 rounded-2xl border border-amber-300 bg-white p-5">
                  <h3 className="text-lg font-semibold text-black">Employer verification</h3>
                  <p className="mt-2 text-sm text-black">
                    Your account is active, but employer tools stay locked until the admin approves your NSRP registration form.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <a
                      href="/MSRP_testFile.pdf"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-black"
                    >
                      View MSRP form
                    </a>
                    <a
                      href="/MSRP_testFile.pdf"
                      download="MSRP_testFile.pdf"
                      className="inline-flex rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-black"
                    >
                      Download MSRP form
                    </a>
                  </div>
                  <p className="mt-3 text-sm text-amber-300">Status: {currentUser.verificationStatus.replace('_', ' ')}</p>
                  {currentUser.verificationStatus === 'declined' && (
                    <div className="mt-3 rounded-xl border border-rose-400/40 bg-rose-950/30 p-3">
                      <p className="text-sm font-semibold text-rose-300">Admin review message</p>
                      <p className="mt-1 text-sm text-slate-200">{currentUser.verificationReason || 'Please submit a corrected NSRP registration form for another review.'}</p>
                    </div>
                  )}
                  {currentUser.requirementsFile && (
                    <div className="mt-5 rounded-xl border border-slate-300 bg-slate-50 p-3">
                      <p className="text-sm font-semibold text-black">Submitted PDF</p>
                      <p className="mt-1 text-xs text-black">{currentUser.requirementsFile.originalName}</p>
                      <button
                        type="button"
                        onClick={handleViewOwnRequirements}
                        className="mt-3 rounded-2xl bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950"
                      >
                        View submitted PDF
                      </button>
                    </div>
                  )}
                  {currentUser.verificationStatus === 'under_review' ? (
                    <p className="mt-5 text-sm text-amber-300">Your PDF is waiting for admin review. You cannot submit another file until this review is complete.</p>
                  ) : (
                    <form className="mt-5 space-y-3" onSubmit={handleSubmitEmployerRequirements}>
                      <label htmlFor="requirements-pdf" className="block text-sm font-medium text-black">
                        {currentUser.verificationStatus === 'declined' ? 'Submit a corrected NSRP registration form (PDF, max 10 MB)' : 'NSRP registration form (PDF, max 10 MB)'}
                      </label>
                      <input
                        id="requirements-pdf"
                        type="file"
                        accept="application/pdf,.pdf"
                        onChange={(event) => setRequirementsFile(event.target.files?.[0] || null)}
                        className="block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-black"
                      />
                      <button type="submit" className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950">
                        Submit for review
                      </button>
                    </form>
                  )}
                </div>
              ) : activeRole === 'Employer' ? (
                <>
                  <p className="mt-3 text-black">Employer dashboard \u2022 quick overview of your postings.</p>
                  <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="rounded-2xl border border-slate-300 bg-white p-4">
                      <p className="text-sm text-black">My job requests</p>
                      <p className="mt-2 text-2xl font-semibold text-black">{myJobs.length}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-300 bg-white p-4">
                      <p className="text-sm text-black">Pending approvals</p>
                      <p className="mt-2 text-2xl font-semibold text-black">{pendingJobs.length}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-300 bg-white p-4">
                      <p className="text-sm text-black">Total applicants</p>
                      <p className="mt-2 text-2xl font-semibold text-black">{myJobs.reduce((acc, j) => acc + (j.applicants ? j.applicants.length : 0), 0)}</p>
                    </div>
                  </div>

                  <div className="employer-dashboard-postings">
                    <div className="employer-dashboard-postings-heading">
                      <div>
                        <h3>Approved Job Postings</h3>
                        <p>All approved vacancies currently visible to applicants.</p>
                      </div>
                      <span>{myJobs.filter((job) => job.status === 'approved').length} approved</span>
                    </div>
                    {myJobs.filter((job) => job.status === 'approved').length === 0 ? (
                      <p className="employer-dashboard-empty">No approved job postings yet.</p>
                    ) : (
                      <div className="employer-dashboard-posting-list">
                        {myJobs.filter((job) => job.status === 'approved').map((job) => (
                          <article
                            key={job._id}
                            className="employer-dashboard-posting cursor-pointer"
                            role="button"
                            tabIndex={0}
                            onClick={() => openEditJob(job, false)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                openEditJob(job, false)
                              }
                            }}
                          >
                            <div>
                              <h4>{job.title}</h4>
                              <p>{job.company} \u2022 {job.location || 'Remote'}</p>
                              <p>Salary: {job.salary || 'Not specified'}</p>
                              <p>Skills: {Array.isArray(job.skills) ? job.skills.join(', ') : job.skills || 'None specified'}</p>
                            </div>
                            <span>{job.applicants?.length || 0} applicant{job.applicants?.length === 1 ? '' : 's'}</span>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-6 flex gap-3">
                    <button
                      type="button"
                      onClick={() => setActiveView('employer')}
                      className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
                    >
                      Manage Postings
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveView('jobs')}
                      className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-black"
                    >
                      Job Request
                    </button>
                  </div>
                </>
              ) : (
                <p className="mt-3 text-slate-400">Welcome to the portal dashboard.</p>
              )}


            </section>
          )}

                {["employers", "applicants"].includes(activeView) && activeRole === "Admin" && (
                  <section className="portal-card directory-card">
                    <h2 className="text-xl font-semibold text-white">{activeView === "employers" ? "Employers" : "Applicants"}</h2>
                    <p className="mt-2 text-sm text-slate-400">Review employer approval status and applicant contact information.</p>

                    {activeView === 'employers' && (
                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
                        <input
                          type="search"
                          value={adminEmployerSearchTerm}
                          onChange={(event) => setAdminEmployerSearchTerm(event.target.value)}
                          placeholder="Search company, email, contact, phone, or status"
                          aria-label="Search employers"
                          className="portal-control w-full"
                        />
                        <select
                          value={adminEmployerStatusFilter}
                          onChange={(event) => setAdminEmployerStatusFilter(event.target.value)}
                          aria-label="Filter employers by status"
                          className="portal-control w-full"
                        >
                          <option value="all">All statuses</option>
                          <option value="pending">Pending</option>
                          <option value="under_review">Under review</option>
                          <option value="approved">Approved</option>
                          <option value="declined">Declined</option>
                        </select>
                      </div>
                    )}

                    <div className="portal-directory-wrap">
                      {[
                        { role: 'Employer', title: 'Employers', view: 'employers' },
                        { role: 'Applicant', title: 'Applicants', view: 'applicants' },
                      ].filter((directory) => directory.view === activeView).map((directory) => {
                        const normalizedEmployerSearch = adminEmployerSearchTerm.trim().toLowerCase()
                        const users = adminUsers
                          .filter((user) => user.role === directory.role)
                          .filter((user) => {
                            if (directory.role !== 'Employer' || !normalizedEmployerSearch) return true
                            return [user.companyName, user.email, user.contactName, user.phone, user.approvalStatus]
                              .filter((value) => typeof value === 'string')
                              .some((value) => value.toLowerCase().includes(normalizedEmployerSearch))
                          })
                              .filter((user) => directory.role !== 'Employer' || adminEmployerStatusFilter === 'all' || user.approvalStatus === adminEmployerStatusFilter)
                          .sort((userA, userB) => {
                            if (directory.role !== 'Employer') return 0
                            const pendingA = ['pending', 'under_review'].includes(userA.approvalStatus)
                            const pendingB = ['pending', 'under_review'].includes(userB.approvalStatus)
                            return Number(pendingB) - Number(pendingA)
                          })
                        return (
                          <div key={directory.role}>
                            <h3 className="portal-section-title">{directory.title}</h3>
                            {users.length === 0 ? (
                              <p className="portal-empty">No {directory.title.toLowerCase()} found.</p>
                            ) : (
                              <div className="portal-table-scroll">
                                <table className={`portal-table ${directory.role === 'Employer' ? 'portal-employers-table' : ''}`}>
                                  <thead>
                                    <tr>
                                      <th>{directory.role === 'Employer' ? 'Company' : 'Name'}</th>
                                      <th>Email</th>
                                      <th>{directory.role === 'Employer' ? 'Contact' : 'Location'}</th>
                                      <th>{directory.role === 'Employer' ? 'Phone' : 'Skills'}</th>
                                      <th>Status</th>
                                      <th>Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {users.map((user) => {
                                      const isExpanded = expandedDirectoryUserId === user.id
                                      const detailColSpan = 6
                                      return (
                                        <Fragment key={user.id}>
                                          <tr>
                                            <td><strong>{directory.role === 'Employer' ? user.companyName || 'Unnamed employer' : user.profile?.name || 'Unnamed applicant'}</strong></td>
                                            <td>{user.email}</td>
                                            <td>{directory.role === 'Employer' ? user.contactName || 'N/A' : user.profile?.location || 'N/A'}</td>
                                            <td>{directory.role === 'Employer' ? user.phone || 'N/A' : Array.isArray(user.profile?.skills) ? user.profile.skills.join(', ') : user.profile?.skills || 'N/A'}</td>
                                            <td><span className={`portal-status status-${(directory.role === 'Employer' ? user.approvalStatus : user.verificationStatus) || 'approved'}`}>{(directory.role === 'Employer' ? user.approvalStatus : user.verificationStatus) || 'approved'}</span></td>
                                            <td>
                                              <button
                                                type="button"
                                                className="portal-table-action"
                                                aria-expanded={isExpanded}
                                                onClick={() => setExpandedDirectoryUserId(isExpanded ? null : user.id)}
                                              >
                                                {isExpanded ? 'Hide' : 'View'}
                                              </button>
                                            </td>
                                          </tr>
                                          {isExpanded && (
                                            <tr className="portal-details-row">
                                              <td colSpan={detailColSpan}>
                                                <div className="admin-modal-details space-y-2 rounded-2xl border border-slate-800 bg-slate-950/80 p-4 text-sm text-slate-300">
                                                  {directory.role === 'Employer' ? (
                                                    <>
                                                      <p><span className="font-semibold text-white">Company:</span> {user.companyName || 'N/A'}</p>
                                                      <p><span className="font-semibold text-white">Contact:</span> {user.contactName || 'N/A'}</p>
                                                      <p><span className="font-semibold text-white">Phone:</span> {user.phone || 'N/A'}</p>
                                                      <p><span className="font-semibold text-white">Location:</span> {user.profile?.location || 'N/A'}</p>
                                                      <p><span className="font-semibold text-white">About me:</span> {user.profile?.summary || 'N/A'}</p>
                                                      <p><span className="font-semibold text-white">Status:</span> {user.approvalStatus || 'approved'}</p>
                                                      {user.requestId && ['pending', 'under_review'].includes(user.approvalStatus) && (
                                                        <div className="mt-3 flex flex-wrap gap-2">
                                                          <button
                                                            type="button"
                                                            onClick={() => handleReviewEmployerRequest(user.requestId, 'approved')}
                                                            className="rounded-2xl bg-green-500 px-3 py-2 text-sm font-semibold text-white"
                                                          >
                                                            Approve
                                                          </button>
                                                          <button
                                                            type="button"
                                                            onClick={() => setDeclineRequestTarget({ id: user.requestId, companyName: user.companyName })}
                                                            className="rounded-2xl bg-red-500 px-3 py-2 text-sm font-semibold text-white"
                                                          >
                                                            Decline
                                                          </button>
                                                        </div>
                                                      )}
                                                    </>
                                                  ) : (
                                                    <>
                                                      <p><span className="font-semibold text-white">Name:</span> {user.profile?.name || 'N/A'}</p>
                                                      <p><span className="font-semibold text-white">Location:</span> {user.profile?.location || 'N/A'}</p>
                                                      <p><span className="font-semibold text-white">Phone:</span> {user.phone || user.profile?.phone || 'N/A'}</p>
                                                      <p><span className="font-semibold text-white">Skills:</span> {Array.isArray(user.profile?.skills) ? user.profile.skills.join(', ') : user.profile?.skills || 'N/A'}</p>
                                                      <p><span className="font-semibold text-white">Traits:</span> {user.profile?.traits || 'N/A'}</p>
                                                      <p><span className="font-semibold text-white">About me:</span> {user.profile?.summary || 'N/A'}</p>
                                                      <p><span className="font-semibold text-white">NSRP / Resume:</span> {user.hasResume ? 'Submitted' : 'Not submitted'}</p>
                                                      <p><span className="font-semibold text-white">NSRP Verification Doc:</span> {user.hasNsrpVerification ? 'Submitted' : 'Not submitted'}</p>
                                                      <div className="mt-3 flex flex-wrap items-center gap-2">
                                                        {user.hasNsrpVerification && (
                                                          <button
                                                            type="button"
                                                            onClick={async () => {
                                                              const token = getToken()
                                                              if (!token) return alert('Not authenticated')
                                                              const preview = window.open('', '_blank')
                                                              try {
                                                                const response = await fetch(`${API_URL}/api/applicants/${user.id}/nsrp-verification`, { headers: { Authorization: `Bearer ${token}` } })
                                                                if (!response.ok) { preview?.close(); return alert('NSRP document could not be opened') }
                                                                const blob = await response.blob()
                                                                const url = URL.createObjectURL(blob)
                                                                if (preview) preview.location.href = url
                                                                else window.open(url, '_blank')
                                                                setTimeout(() => URL.revokeObjectURL(url), 60_000)
                                                              } catch (err) { preview?.close(); alert('NSRP document could not be opened') }
                                                            }}
                                                            className="rounded-2xl bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950"
                                                          >
                                                            View NSRP Verification
                                                          </button>
                                                        )}
                                                        {user.hasResume && (
                                                          <button
                                                            type="button"
                                                            onClick={() => handleViewApplicantResumeAdmin(user.id)}
                                                            className="rounded-2xl bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950"
                                                          >
                                                            View NSRP PDF
                                                          </button>
                                                        )}
                                                        {user.verificationStatus === 'approved' ? (
                                                          <button
                                                            type="button"
                                                            onClick={() => handleReviewApplicantVerification(user.id, 'restricted')}
                                                            className="rounded-2xl bg-slate-700 px-3 py-2 text-sm font-semibold text-white"
                                                          >
                                                            Restrict
                                                          </button>
                                                        ) : (
                                                          <>
                                                            <button
                                                              type="button"
                                                              onClick={() => handleReviewApplicantVerification(user.id, 'approved')}
                                                              className="rounded-2xl bg-green-500 px-3 py-2 text-sm font-semibold text-white"
                                                            >
                                                              Approve
                                                            </button>
                                                            <button
                                                              type="button"
                                                              onClick={() => handleReviewApplicantVerification(user.id, 'declined')}
                                                              className="rounded-2xl bg-red-500 px-3 py-2 text-sm font-semibold text-white"
                                                            >
                                                              Decline
                                                            </button>
                                                          </>
                                                        )}
                                                      </div>
                                                    </>
                                                  )}
                                                </div>

                                                {directory.role === 'Employer' && user.requirementsFile && (
                                                  <div className="mt-4 rounded-2xl border border-slate-300 bg-slate-50 p-4 text-sm text-black">
                                                    <p className="font-semibold">Submitted MSRP file</p>
                                                    <p className="mt-1">File: {user.requirementsFile.originalName || 'MSRP form.pdf'}</p>
                                                    <p className="mt-1">Size: {user.requirementsFile.size ? `${Math.ceil(user.requirementsFile.size / 1024)} KB` : 'N/A'}</p>
                                                    <p className="mt-1">Submitted: {user.requirementsFile.submittedAt ? new Date(user.requirementsFile.submittedAt).toLocaleString() : 'N/A'}</p>
                                                    <div className="mt-3 flex flex-wrap gap-2">
                                                      <button
                                                        type="button"
                                                        onClick={() => handleViewRequirements(user.requirementsFile.requestId)}
                                                        className="rounded-2xl bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950"
                                                      >
                                                        View MSRP PDF
                                                      </button>
                                                      <button
                                                        type="button"
                                                        onClick={() => handleDownloadRequirements(user.requirementsFile.requestId, user.requirementsFile.originalName)}
                                                        className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-black"
                                                      >
                                                        Download MSRP PDF
                                                      </button>
                                                    </div>
                                                  </div>
                                                )}
                                              </td>
                                            </tr>
                                          )}
                                        </Fragment>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )}

          {activeView === "profile" && (
            <section className={`${activeRole === 'Employer' ? 'employer-profile-card portal-card' : activeRole === 'Applicant' ? 'applicant-profile-card portal-card' : ''} rounded-2xl border border-slate-800 bg-slate-900/70 p-6`}>
              {activeRole === 'Applicant' ? (
                <>
                  <h2 className="text-xl font-semibold text-white">Applicant Profile</h2>
                  <p className="mt-3 text-slate-400">Update your traits and personal information.</p>

                  {/* Banner and profile image preview */}
                  <div className="mt-6 overflow-hidden rounded-2xl border border-slate-700">
                    <div
                      className="employer-banner h-36 w-full bg-slate-800 bg-cover bg-center"
                      style={profileData.bannerImage ? { backgroundImage: `url(${profileData.bannerImage})` } : undefined}
                    />
                    <div className="flex items-end gap-4 bg-slate-900/60 px-5 pb-4">
                      <div className="applicant-profile-avatar -mt-10 flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border-4 border-slate-900 bg-cyan-500 text-2xl font-bold text-slate-950">
                        {profileData.profileImage ? (
                          <img src={profileData.profileImage} alt="Profile" className="h-full w-full object-cover" />
                        ) : (
                          applicantProfileInitials
                        )}
                      </div>
                      <p className="pb-1 text-lg font-semibold text-white">{profileData.name || 'Your name'}</p>
                    </div>
                  </div>

                  {isEditingProfile && (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="applicantProfileImageUpload" className="block text-sm font-medium text-slate-300">Profile Image</label>
                        <input
                          id="applicantProfileImageUpload"
                          type="file"
                          accept="image/*"
                          onChange={(event) => handleImageFile(event.target.files?.[0], 'profileImage')}
                          className="mt-2 block w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white file:mr-3 file:rounded-xl file:border-0 file:bg-cyan-500 file:px-3 file:py-2 file:font-semibold file:text-slate-950"
                        />
                      </div>
                      <div>
                        <label htmlFor="applicantBannerImageUpload" className="block text-sm font-medium text-slate-300">Banner Image</label>
                        <input
                          id="applicantBannerImageUpload"
                          type="file"
                          accept="image/*"
                          onChange={(event) => handleImageFile(event.target.files?.[0], 'bannerImage')}
                          className="mt-2 block w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white file:mr-3 file:rounded-xl file:border-0 file:bg-cyan-500 file:px-3 file:py-2 file:font-semibold file:text-slate-950"
                        />
                      </div>
                    </div>
                  )}

                  <div className="applicant-profile-summary mt-6 rounded-2xl border border-slate-700 bg-slate-950/80 p-4">
                    <div className="flex items-center gap-4">
                      <div className="applicant-profile-avatar flex h-16 w-16 items-center justify-center rounded-full bg-cyan-500 text-lg font-bold text-slate-950">
                        {applicantProfileInitials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xl font-semibold text-white">{profileData.name || 'Your name'}</p>
                        <p className="text-sm text-slate-400">{profileData.location || 'Add your location'}</p>
                        <p className="mt-1 text-sm text-cyan-300">{profileData.traits || 'Add a few key traits'}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {profileData.skills.length > 0 ? (
                        profileData.skills.map((skill) => (
                          <span key={skill} className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-200">
                            {skill}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-slate-400">Choose your skills to show on your profile.</span>
                      )}
                    </div>
                  </div>

                  <form className="mt-6 space-y-4" onSubmit={(event) => event.preventDefault()}>
                    <div>
                      <label htmlFor="name" className="block text-sm font-medium text-slate-300">
                        Full Name
                      </label>
                      <input
                        id="name"
                        type="text"
                        value={profileData.name}
                        disabled={!isEditingProfile}
                        onChange={(event) => setProfileData({ ...profileData, name: event.target.value })}
                        className={`mt-2 w-full rounded-2xl border px-3 py-2 text-sm ${isEditingProfile ? 'border-slate-700 bg-slate-800 text-white' : 'cursor-not-allowed border-slate-700 bg-slate-900 text-slate-400'}`}
                      />
                    </div>
                    <div>
                      <label htmlFor="summary" className="block text-sm font-medium text-slate-300">
                        About me
                      </label>
                      <textarea
                        id="summary"
                        rows="4"
                        value={profileData.summary}
                        disabled={!isEditingProfile}
                        onChange={(event) => setProfileData({ ...profileData, summary: event.target.value })}
                        className={`mt-2 w-full rounded-2xl border px-3 py-2 text-sm ${isEditingProfile ? 'border-slate-700 bg-slate-800 text-white' : 'cursor-not-allowed border-slate-700 bg-slate-900 text-slate-400'}`}
                        placeholder="Write a brief profile summary."
                      />
                    </div>
                    <div>
                      <label htmlFor="location" className="block text-sm font-medium text-slate-300">
                        Location
                      </label>
                      <input
                        id="location"
                        type="text"
                        value={profileData.location}
                        disabled={!isEditingProfile}
                        onChange={(event) => setProfileData({ ...profileData, location: event.target.value })}
                        className={`mt-2 w-full rounded-2xl border px-3 py-2 text-sm ${isEditingProfile ? 'border-slate-700 bg-slate-800 text-white' : 'cursor-not-allowed border-slate-700 bg-slate-900 text-slate-400'}`}
                      />
                    </div>
                    <div>
                      <label htmlFor="traits" className="block text-sm font-medium text-slate-300">
                        Key Traits
                      </label>
                      <input
                        id="traits"
                        type="text"
                        value={profileData.traits}
                        disabled={!isEditingProfile}
                        onChange={(event) => setProfileData({ ...profileData, traits: event.target.value })}
                        className={`mt-2 w-full rounded-2xl border px-3 py-2 text-sm ${isEditingProfile ? 'border-slate-700 bg-slate-800 text-white' : 'cursor-not-allowed border-slate-700 bg-slate-900 text-slate-400'}`}
                        placeholder="e.g. reliable, detail-oriented, team player"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300">Skills</label>
                      <SkillTagPicker
                        selected={profileData.skills}
                        disabled={!isEditingProfile}
                        onChange={(next) => setProfileData({ ...profileData, skills: next })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300">Resume (PDF)</label>
                      <div className="mt-2 rounded-2xl border border-slate-700 bg-slate-900 p-3">
                        {resumeInfo?.originalName ? (
                          <p className="text-sm text-slate-300">Current: {resumeInfo.originalName}{resumeInfo.uploadedAt ? ` • uploaded ${new Date(resumeInfo.uploadedAt).toLocaleDateString()}` : ''}</p>
                        ) : (
                          <p className="text-sm text-slate-400">No resume uploaded yet.</p>
                        )}
                        {resumeInfo?.originalName && (
                          <button
                            type="button"
                            onClick={handleViewResume}
                            className="mt-3 rounded-2xl border border-cyan-500 bg-transparent px-4 py-2 text-sm font-semibold text-cyan-300"
                          >
                            View Resume
                          </button>
                        )}
                        {(isEditingProfile || (activeRole === 'Applicant' && !applicantApproved)) && (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <input
                              type="file"
                              accept="application/pdf,.pdf"
                              onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
                              className="text-sm text-slate-300 file:mr-3 file:rounded-xl file:border-0 file:bg-slate-700 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
                            />
                            <button
                              type="button"
                              disabled={!resumeFile || resumeUploading}
                              onClick={async () => {
                                if (!resumeFile) return
                                const token = getToken()
                                if (!token) return alert('Not authenticated')
                                setResumeUploading(true)
                                try {
                                  const formData = new FormData()
                                  formData.append('resume', resumeFile)
                                  const response = await fetch('${API_URL}/api/profile/resume', {
                                    method: 'POST',
                                    headers: { Authorization: `Bearer ${token}` },
                                    body: formData,
                                  })
                                  const data = await response.json().catch(() => null)
                                  if (!response.ok || data?.error) throw new Error(data?.error || 'Upload failed')
                                  setResumeInfo(data.resumeFile)
                                  setResumeFile(null)
                                  alert('Resume uploaded!')
                                } catch (err) {
                                  console.error(err)
                                  alert(err?.message || 'Failed to upload resume')
                                } finally {
                                  setResumeUploading(false)
                                }
                              }}
                              className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {resumeUploading ? 'Uploading…' : 'Upload Resume'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300">NSRP Verification Document (PDF)</label>
                      <div className="mt-2 rounded-2xl border border-slate-700 bg-slate-900 p-3">
                        {nsrpVerificationInfo?.originalName ? (
                          <p className="text-sm text-slate-300">Current: {nsrpVerificationInfo.originalName}{nsrpVerificationInfo.uploadedAt ? ` • uploaded ${new Date(nsrpVerificationInfo.uploadedAt).toLocaleDateString()}` : ''}</p>
                        ) : (
                          <p className="text-sm text-slate-400">No NSRP verification document uploaded yet.</p>
                        )}
                        {nsrpVerificationInfo?.originalName && (
                          <button
                            type="button"
                            onClick={async () => {
                              const token = getToken()
                              const applicantId = currentUser?.id || currentUser?._id
                              if (!token || !applicantId) return alert('Not authenticated')
                              const preview = window.open('', '_blank')
                              try {
                                const response = await fetch(`${API_URL}/api/applicants/${applicantId}/nsrp-verification`, { headers: { Authorization: `Bearer ${token}` } })
                                if (!response.ok) { preview?.close(); return alert('NSRP document could not be opened') }
                                const blob = await response.blob()
                                const url = URL.createObjectURL(blob)
                                if (preview) preview.location.href = url
                                else window.open(url, '_blank')
                                setTimeout(() => URL.revokeObjectURL(url), 60_000)
                              } catch (err) { preview?.close(); alert('NSRP document could not be opened') }
                            }}
                            className="mt-3 rounded-2xl border border-cyan-500 bg-transparent px-4 py-2 text-sm font-semibold text-cyan-300"
                          >
                            View NSRP Document
                          </button>
                        )}
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <input
                            type="file"
                            accept="application/pdf,.pdf"
                            onChange={(e) => setNsrpVerificationFile(e.target.files?.[0] || null)}
                            className="text-sm text-slate-300 file:mr-3 file:rounded-xl file:border-0 file:bg-slate-700 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
                          />
                          <button
                            type="button"
                            disabled={!nsrpVerificationFile || nsrpVerificationUploading}
                            onClick={async () => {
                              if (!nsrpVerificationFile) return
                              const token = getToken()
                              if (!token) return alert('Not authenticated')
                              setNsrpVerificationUploading(true)
                              try {
                                const formData = new FormData()
                                formData.append('nsrpVerification', nsrpVerificationFile)
                                const response = await fetch('${API_URL}/api/profile/nsrp-verification', {
                                  method: 'POST',
                                  headers: { Authorization: `Bearer ${token}` },
                                  body: formData,
                                })
                                const data = await response.json().catch(() => null)
                                if (!response.ok || data?.error) throw new Error(data?.error || 'Upload failed')
                                setNsrpVerificationInfo(data.nsrpVerificationFile)
                                setNsrpVerificationFile(null)
                                alert('NSRP verification document submitted for admin review.')
                              } catch (err) {
                                console.error(err)
                                alert(err?.message || 'Failed to upload NSRP document')
                              } finally {
                                setNsrpVerificationUploading(false)
                              }
                            }}
                            className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {nsrpVerificationUploading ? 'Uploading…' : 'Submit NSRP for Approval'}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      {!isEditingProfile ? (
                        <button
                          type="button"
                          onClick={() => setIsEditingProfile(true)}
                          className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
                        >
                          Edit Profile
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              saveProfile(profileData).then((result) => {
                                if (result.ok) {
                                  setIsEditingProfile(false)
                                  alert('Profile saved!')
                                }
                              })
                            }}
                            className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
                          >
                            Save Profile
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setProfileData(normalizeProfile(currentUser, currentUser?.role))
                              setIsEditingProfile(false)
                            }}
                            className="rounded-2xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                  </form>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-semibold text-white">Employer Profile</h2>
                  <p className="mt-3 text-slate-400">Update your company details and contact information.</p>

                  {/* Banner and profile image preview */}
                  <div className="mt-6 overflow-hidden rounded-2xl border border-slate-700">
                    <div
                      className="h-36 w-full bg-slate-800 bg-cover bg-center"
                      style={profileData.bannerImage ? { backgroundImage: `url(${profileData.bannerImage})` } : undefined}
                    />
                    <div className="flex items-end gap-4 bg-slate-900/60 px-5 pb-4">
                      <div className="-mt-10 flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border-4 border-slate-900 bg-slate-800 text-2xl font-bold text-cyan-300">
                        {profileData.profileImage ? (
                          <img src={profileData.profileImage} alt="Company profile" className="h-full w-full object-cover" />
                        ) : (
                          (profileData.companyName || 'C').trim().charAt(0).toUpperCase()
                        )}
                      </div>
                      <p className="pb-1 text-lg font-semibold text-white">{profileData.companyName || 'Your company'}</p>
                    </div>
                  </div>

                  {isEditingProfile && (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="profileImageUpload" className="block text-sm font-medium text-slate-300">Profile Image</label>
                        <input
                          id="profileImageUpload"
                          type="file"
                          accept="image/*"
                          onChange={(event) => {
                            const file = event.target.files?.[0]
                            if (!file) return
                            if (file.size > 2 * 1024 * 1024) return alert('Image must be under 2 MB')
                            const reader = new FileReader()
                            reader.onload = () => setProfileData((current) => ({ ...current, profileImage: reader.result }))
                            reader.readAsDataURL(file)
                          }}
                          className="mt-2 block w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white file:mr-3 file:rounded-xl file:border-0 file:bg-cyan-500 file:px-3 file:py-2 file:font-semibold file:text-slate-950"
                        />
                      </div>
                      <div>
                        <label htmlFor="bannerImageUpload" className="block text-sm font-medium text-slate-300">Banner Image</label>
                        <input
                          id="bannerImageUpload"
                          type="file"
                          accept="image/*"
                          onChange={(event) => {
                            const file = event.target.files?.[0]
                            if (!file) return
                            if (file.size > 2 * 1024 * 1024) return alert('Image must be under 2 MB')
                            const reader = new FileReader()
                            reader.onload = () => setProfileData((current) => ({ ...current, bannerImage: reader.result }))
                            reader.readAsDataURL(file)
                          }}
                          className="mt-2 block w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white file:mr-3 file:rounded-xl file:border-0 file:bg-cyan-500 file:px-3 file:py-2 file:font-semibold file:text-slate-950"
                        />
                      </div>
                    </div>
                  )}

                  <form className="mt-6 space-y-4" onSubmit={(event) => event.preventDefault()}>
                    <div>
                      <label htmlFor="companyName" className="block text-sm font-medium text-slate-300">Company Name</label>
                      <input
                        id="companyName"
                        type="text"
                        value={profileData.companyName}
                        disabled={!isEditingProfile}
                        onChange={(e) => setProfileData({ ...profileData, companyName: e.target.value })}
                        className={`mt-2 w-full rounded-2xl border px-3 py-2 text-sm ${isEditingProfile ? 'border-slate-700 bg-slate-800 text-white' : 'cursor-not-allowed border-slate-700 bg-slate-900 text-slate-400'}`}
                      />
                    </div>
                    <div>
                      <label htmlFor="contactName" className="block text-sm font-medium text-slate-300">Contact Name</label>
                      <input
                        id="contactName"
                        type="text"
                        value={profileData.contactName}
                        disabled={!isEditingProfile}
                        onChange={(e) => setProfileData({ ...profileData, contactName: e.target.value })}
                        className={`mt-2 w-full rounded-2xl border px-3 py-2 text-sm ${isEditingProfile ? 'border-slate-700 bg-slate-800 text-white' : 'cursor-not-allowed border-slate-700 bg-slate-900 text-slate-400'}`}
                      />
                    </div>
                    <div>
                      <label htmlFor="location" className="block text-sm font-medium text-slate-300">Location</label>
                      <input
                        id="location"
                        type="text"
                        value={profileData.location}
                        disabled={!isEditingProfile}
                        onChange={(e) => setProfileData({ ...profileData, location: e.target.value })}
                        className={`mt-2 w-full rounded-2xl border px-3 py-2 text-sm ${isEditingProfile ? 'border-slate-700 bg-slate-800 text-white' : 'cursor-not-allowed border-slate-700 bg-slate-900 text-slate-400'}`}
                      />
                    </div>
                    <div>
                      <label htmlFor="phone" className="block text-sm font-medium text-slate-300">Phone</label>
                      <input
                        id="phone"
                        type="tel"
                        value={profileData.phone}
                        disabled={!isEditingProfile}
                        onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                        className={`mt-2 w-full rounded-2xl border px-3 py-2 text-sm ${isEditingProfile ? 'border-slate-700 bg-slate-800 text-white' : 'cursor-not-allowed border-slate-700 bg-slate-900 text-slate-400'}`}
                      />
                    </div>
                    <div>
                      <label htmlFor="website" className="block text-sm font-medium text-slate-300">Website</label>
                      <input
                        id="website"
                        type="text"
                        value={profileData.website}
                        disabled={!isEditingProfile}
                        onChange={(e) => setProfileData({ ...profileData, website: e.target.value })}
                        className={`mt-2 w-full rounded-2xl border px-3 py-2 text-sm ${isEditingProfile ? 'border-slate-700 bg-slate-800 text-white' : 'cursor-not-allowed border-slate-700 bg-slate-900 text-slate-400'}`}
                      />
                    </div>
                    <div>
                      <label htmlFor="summary" className="block text-sm font-medium text-slate-300">Company Summary</label>
                      <textarea
                        id="summary"
                        rows="4"
                        value={profileData.summary}
                        disabled={!isEditingProfile}
                        onChange={(event) => setProfileData({ ...profileData, summary: event.target.value })}
                        className={`mt-2 w-full rounded-2xl border px-3 py-2 text-sm ${isEditingProfile ? 'border-slate-700 bg-slate-800 text-white' : 'cursor-not-allowed border-slate-700 bg-slate-900 text-slate-400'}`}
                        placeholder="Brief description of company or services"
                      />
                    </div>
                    <div className="flex gap-3">
                      {!isEditingProfile ? (
                        <button
                          type="button"
                          onClick={() => setIsEditingProfile(true)}
                          className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
                        >
                          Edit Profile
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              const token = currentUser?.token || localStorage.getItem('peso-token')
                              if (!token) return alert('Not authenticated. Please log in again.')
                              // Preserve existing profile fields and update the editable ones, including top-level employer fields.
                              const editableProfile = { ...(currentUser?.profile || {}), location: profileData.location, website: profileData.website, summary: profileData.summary, profileImage: profileData.profileImage || '', bannerImage: profileData.bannerImage || '' }
                              fetch('${API_URL}/api/profile', {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                body: JSON.stringify({ profile: editableProfile, companyName: profileData.companyName, contactName: profileData.contactName, phone: profileData.phone, website: profileData.website }),
                              })
                                .then((r) => r.json())
                                .then((data) => {
                                  if (data.error) return alert(data.error)
                                  setIsEditingProfile(false)
                                  alert('Profile saved!')
                                })
                                .catch((err) => {
                                  console.error(err)
                                  alert('Save failed')
                                })
                            }}
                            className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
                          >
                            Save Profile
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setProfileData(normalizeProfile(currentUser, currentUser?.role))
                              setIsEditingProfile(false)
                            }}
                            className="rounded-2xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                  </form>
                </>
              )}
            </section>
          )}

          {activeView === "employer" && (
            <section className="employer-module-card portal-card rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
              <h2 className="text-xl font-semibold text-white">Employer Module</h2>
              <p className="mt-3 text-slate-400">Submit job requests and track their review status.</p>

              <button
                type="button"
                onClick={() => {
                  setJobForm({
                    title: '',
                    company: profileData.companyName || '',
                    location: profileData.location || '',
                    description: '',
                    requirements: '',
                    salary: '',
                    locationType: '',
                    employmentType: '',
                    skills: [],
                  })
                  setShowCreateJobPosting(true)
                }}
                className="mt-6 rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
              >
                Create Job Posting
              </button>

              {showCreateJobPosting && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="create-job-posting-title"
                  onClick={() => setShowCreateJobPosting(false)}
                >
                  <div
                    className="employer-form-panel max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-300 bg-white p-5 shadow-2xl"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <h3 id="create-job-posting-title" className="text-lg font-semibold text-black">Request a Job Posting</h3>
                      <button
                        type="button"
                        onClick={() => setShowCreateJobPosting(false)}
                        className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm font-semibold text-black"
                      >
                        Close
                      </button>
                    </div>
                <form className="space-y-4 mt-4" onSubmit={handleCreateJob}>
                  <div>
                    <label htmlFor="job-title" className="block text-sm font-medium text-slate-200">
                      Job title
                    </label>
                    <input
                      id="job-title"
                      value={jobForm.title}
                      onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })}
                      className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                      placeholder="e.g. Customer Service Specialist"
                    />
                  </div>
                  <div>
                    <label htmlFor="job-description" className="block text-sm font-medium text-slate-200">
                      Description
                    </label>
                    <textarea
                      id="job-description"
                      rows="3"
                      value={jobForm.description}
                      onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })}
                      className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                      placeholder="Describe the responsibilities and role."
                    />
                  </div>
                  <div>
                    <label htmlFor="job-requirements" className="block text-sm font-medium text-slate-200">
                      Requirements
                    </label>
                    <textarea
                      id="job-requirements"
                      rows="2"
                      value={jobForm.requirements}
                      onChange={(e) => setJobForm({ ...jobForm, requirements: e.target.value })}
                      className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                      placeholder="Describe the qualifications and expectations."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-200">Required Skills</label>
                    <SkillTagPicker
                      theme="light"
                      selected={jobForm.skills}
                      onChange={(next) => setJobForm({ ...jobForm, skills: next })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor="job-location-type" className="block text-sm font-medium text-slate-200">
                        Location Type
                      </label>
                      <select
                        id="job-location-type"
                        value={jobForm.locationType}
                        onChange={(e) => setJobForm({ ...jobForm, locationType: e.target.value })}
                        className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                      >
                        <option value="">Select location type</option>
                        <option value="On-site">On-site</option>
                        <option value="Hybrid">Hybrid</option>
                        <option value="Remote">Remote</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="job-employment-type" className="block text-sm font-medium text-slate-200">
                        Employment Type
                      </label>
                      <select
                        id="job-employment-type"
                        value={jobForm.employmentType}
                        onChange={(e) => setJobForm({ ...jobForm, employmentType: e.target.value })}
                        className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                      >
                        <option value="">Select employment type</option>
                        <option value="Full-time">Full-time</option>
                        <option value="Part-time">Part-time</option>
                        <option value="Contract">Contract</option>
                        <option value="Internship">Internship</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="job-salary" className="block text-sm font-medium text-slate-200">
                      Salary
                    </label>
                    <input
                      id="job-salary"
                      value={jobForm.salary}
                      inputMode="numeric"
                      onChange={(e) => setJobForm({ ...jobForm, salary: formatPesoSalary(e.target.value) })}
                      className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                      placeholder="e.g. \u20B125,000"
                    />
                  </div>
                  <button
                    type="submit"
                    className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
                  >
                    Submit Job Request
                  </button>
                </form>
              </div>
                </div>
              )}

              <div className="employer-pending-panel mt-6 rounded-2xl border border-slate-800 bg-slate-950/80 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-white">My Job Requests</h3>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: 'all', label: 'All', activeClass: 'bg-slate-200 text-slate-950', count: myJobs.length },
                      { id: 'pending', label: 'Pending', activeClass: 'bg-yellow-400 text-slate-950', count: employerPendingJobs.length },
                      { id: 'approved', label: 'Approved', activeClass: 'bg-green-500 text-white', count: employerApprovedJobs.length },
                      { id: 'declined', label: 'Declined', activeClass: 'bg-red-500 text-white', count: employerDeclinedJobs.length },
                    ].map((filter) => (
                      <button
                        key={filter.id}
                        type="button"
                        onClick={() => setEmployerJobStatusFilter(filter.id)}
                        className={`rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] transition ${
                          employerJobStatusFilter === filter.id
                            ? filter.activeClass
                            : 'border border-slate-600 bg-slate-900 text-slate-300 hover:border-slate-400'
                        }`}
                      >
                        {filter.label} ({filter.count})
                      </button>
                    ))}
                  </div>
                </div>
                {filteredMyJobs.length === 0 ? (
                  <p className="mt-3 text-slate-400">{myJobs.length === 0 ? 'No job requests submitted yet.' : `No ${employerJobStatusFilter} job requests.`}</p>
                ) : (
                  <div className="mt-4 space-y-4">
                    {filteredMyJobs.map((job) => (
                      <div key={job._id} className="employer-pending-item rounded-2xl border border-slate-700 bg-slate-900 p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-lg font-semibold text-white">{job.title}</p>
                            <p className="text-sm text-slate-400">{job.company} \u2022 {job.location || 'Remote'}</p>
                          </div>
                          <span className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.2em] ${job.status === 'approved' ? 'bg-cyan-500 text-slate-950' : job.status === 'declined' ? 'bg-rose-400 text-slate-950' : 'bg-amber-400 text-slate-950'}`}>
                            {job.status || 'pending'}
                          </span>
                        </div>
                        <p className="mt-3 text-sm text-slate-300">{job.description}</p>
                        {job.status === 'declined' && (
                          <p className="mt-2 text-sm text-rose-300">Reason: {job.reviewReason || 'No reason provided.'}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {(employerPendingJobs.length > 0 || employerApprovedJobs.length > 0 || employerDeclinedJobs.length > 0) && (
                <p className="mt-4 text-xs uppercase tracking-[0.2em] text-slate-400">
                  Pending: {employerPendingJobs.length} \u2022 Approved: {employerApprovedJobs.length} \u2022 Declined: {employerDeclinedJobs.length}
                </p>
              )}
            </section>
          )}

          {activeView === "jobs" && (
            <JobsView
              activeRole={activeRole}
              jobLoading={jobLoading}
              jobSearchTerm={jobSearchTerm}
              setJobSearchTerm={setJobSearchTerm}
              jobSkillFilter={jobSkillFilter}
              setJobSkillFilter={setJobSkillFilter}
              availableSkills={availableSkills}
              jobLocationFilter={jobLocationFilter}
              setJobLocationFilter={setJobLocationFilter}
              jobLocationTypeFilter={jobLocationTypeFilter}
              setJobLocationTypeFilter={setJobLocationTypeFilter}
              jobEmploymentTypeFilter={jobEmploymentTypeFilter}
              setJobEmploymentTypeFilter={setJobEmploymentTypeFilter}
              locationFilterOptions={locationFilterOptions}
              filteredApplicantJobs={filteredApplicantJobs}
              appliedJobs={appliedJobs}
              appliedJobIds={appliedJobIds}
              currentUser={currentUser}
              selectedJob={selectedJob}
              setSelectedJob={setSelectedJob}
              handleApplyJob={handleApplyJob}
              adminJobSearchTerm={adminJobSearchTerm}
              setAdminJobSearchTerm={setAdminJobSearchTerm}
              adminJobStatusFilter={adminJobStatusFilter}
              setAdminJobStatusFilter={setAdminJobStatusFilter}
              filteredPendingJobs={filteredPendingJobs}
              handleReviewJob={handleReviewJob}
              handleBulkReviewJobs={handleBulkReviewJobs}
              showPendingAdminSection={showPendingAdminSection}
              showApprovedAdminSection={showApprovedAdminSection}
              filteredApprovedJobs={filteredApprovedJobs}
              showDeclinedAdminSection={showDeclinedAdminSection}
              filteredDeclinedJobs={filteredDeclinedJobs}
              adminUsers={adminUsers}
              referredApplicantIdsByJob={referredApplicantIdsByJob}
              handleReferApplicantFromJob={handleReferApplicantFromJob}
              handleBulkReferApplicants={handleBulkReferApplicants}
              token={getToken()}
              handleEditPendingJob={openEditJob}
            />
          )}

          {activeView === "referrals" && activeRole === "Employer" && (
            <ReferralList
              token={getToken()}
              employerId={currentUser?._id || currentUser?.id || currentUser?.employerId}
            />
          )}

          {activeView === "notify" && (
            <section className="notifications-module employer-notifications-card portal-card rounded-2xl border border-slate-300 bg-white p-6 text-black">
              <h2 className="text-xl font-semibold text-black">Notifications</h2>
              <p className="mt-3 text-black">Updates about your job posting approvals and other account activity.</p>

              {notifications.length === 0 ? (
                <p className="mt-6 text-black">You have no notifications yet.</p>
              ) : (
                <>
                  <p className="mt-6 text-sm text-black">Click a notification to enlarge and view full details.</p>
                  <div className="mt-3 space-y-3">
                    {notifications.map((notification) => (
                      <button
                        key={notification._id}
                        type="button"
                        onClick={() => handleNotificationClick(notification)}
                        className={`${activeRole === 'Employer' ? 'employer-notification-item' : ''} w-full rounded-2xl border bg-white p-4 text-left ${isNewApplicationNotification(notification) && !notification.read ? 'border-cyan-500/50' : 'border-slate-300'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-base font-semibold text-black">{notification.title}</p>
                            <p className="mt-2 line-clamp-2 text-sm text-black">{notification.message}</p>
                            {activeRole === 'Admin' && isNewApplicationNotification(notification) && (
                              <>
                                <p className="mt-2 text-sm text-black">Applicant: {notification.applicantName || 'Unknown applicant'}</p>
                                <p className="mt-1 text-sm text-black">Job: {notification.jobTitle || 'Unknown job'} \u2022 Employer: {notification.employerName || 'Unknown employer'}</p>
                              </>
                            )}
                            {activeRole === 'Admin' && ((notification.actionable && notification.status === 'pending') || String(notification._id || '').startsWith('job-pending-')) && (
                              <p className="mt-2 text-xs uppercase tracking-[0.2em] text-cyan-300">Action available</p>
                            )}
                            {activeRole === 'Admin' && isNewApplicationNotification(notification) && !notification.read && (
                              <p className="mt-2 text-xs uppercase tracking-[0.2em] text-cyan-300">Unread application alert</p>
                            )}
                          </div>
                          <span className="text-xs uppercase tracking-[0.2em] text-black">
                            {notification.createdAt ? new Date(notification.createdAt).toLocaleString() : 'Just now'}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>

                </>
              )}
            </section>
          )}

          {showSkillPrompt && activeRole === 'Applicant' && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="skill-prompt-title"
              onClick={() => setShowSkillPrompt(false)}
            >
              <div
                className="applicant-skill-modal w-full max-w-xl rounded-2xl border border-slate-300 bg-white p-6 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 id="skill-prompt-title" className="text-xl font-semibold text-slate-900">Tell us about your skills</h3>
                    <p className="mt-2 text-sm text-slate-600">Choose the skills that match your experience so employers can see them on your profile.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSkillPrompt(false)}
                    className="rounded-2xl border border-slate-300 bg-slate-100 px-3 py-1 text-sm text-slate-700"
                  >
                    Close
                  </button>
                </div>

                <div className="mt-5">
                  <SkillTagPicker
                    theme="light"
                    selected={profileData.skills}
                    onChange={(next) => setProfileData({ ...profileData, skills: next })}
                  />
                </div>

                <div className="mt-6 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setShowSkillPrompt(false)
                      saveProfile(profileData).then((result) => {
                        if (result.ok) setActiveView('profile')
                      })
                    }}
                    className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
                  >
                    Continue
                  </button>
                </div>
              </div>
            </div>
          )}

          {editingJob && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-job-title"
              onClick={() => setEditingJob(null)}
            >
              <form
                className="w-full max-w-2xl rounded-2xl border border-slate-300 bg-white p-6 shadow-2xl"
                onSubmit={handleSaveEditedJob}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 id="edit-job-title" className="text-lg font-semibold text-black">{editingJobCanSave ? 'Edit Job Posting' : 'Job Posting Details'}</h2>
                    <p className="mt-1 text-sm text-black">{editingJobCanSave ? 'Update your pending job request before admin review.' : 'Approved postings are read-only.'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingJob(null)}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm font-semibold text-black"
                  >
                    Cancel
                  </button>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {[
                    ['edit-job-title-input', 'Job title', 'title'],
                    ['edit-job-company', 'Company', 'company'],
                    ['edit-job-location', 'Location', 'location'],
                    ['edit-job-salary', 'Salary', 'salary'],
                  ].map(([id, label, field]) => (
                    <label key={id} htmlFor={id} className="text-sm font-medium text-black">
                      {label}
                      <input
                        id={id}
                        value={editingJobForm[field]}
                        disabled={!editingJobCanSave}
                        inputMode={field === 'salary' ? 'numeric' : undefined}
                        onChange={(event) => setEditingJobForm({ ...editingJobForm, [field]: field === 'salary' ? formatPesoSalary(event.target.value) : event.target.value })}
                        className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-black"
                      />
                    </label>
                  ))}
                  <label htmlFor="edit-job-location-type" className="text-sm font-medium text-black">
                    Location Type
                    <select
                      id="edit-job-location-type"
                      value={editingJobForm.locationType}
                      disabled={!editingJobCanSave}
                      onChange={(event) => setEditingJobForm({ ...editingJobForm, locationType: event.target.value })}
                      className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-black"
                    >
                      <option value="">Select location type</option>
                      <option value="On-site">On-site</option>
                      <option value="Hybrid">Hybrid</option>
                      <option value="Remote">Remote</option>
                    </select>
                  </label>
                  <label htmlFor="edit-job-employment-type" className="text-sm font-medium text-black">
                    Employment Type
                    <select
                      id="edit-job-employment-type"
                      value={editingJobForm.employmentType}
                      disabled={!editingJobCanSave}
                      onChange={(event) => setEditingJobForm({ ...editingJobForm, employmentType: event.target.value })}
                      className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-black"
                    >
                      <option value="">Select employment type</option>
                      <option value="Full-time">Full-time</option>
                      <option value="Part-time">Part-time</option>
                      <option value="Contract">Contract</option>
                      <option value="Internship">Internship</option>
                    </select>
                  </label>
                  <label htmlFor="edit-job-description" className="text-sm font-medium text-black sm:col-span-2">
                    Description
                    <textarea
                      id="edit-job-description"
                      rows="3"
                      value={editingJobForm.description}
                      disabled={!editingJobCanSave}
                      onChange={(event) => setEditingJobForm({ ...editingJobForm, description: event.target.value })}
                      className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-black"
                    />
                  </label>
                  <label htmlFor="edit-job-requirements" className="text-sm font-medium text-black sm:col-span-2">
                    Requirements
                    <textarea
                      id="edit-job-requirements"
                      rows="2"
                      value={editingJobForm.requirements}
                      disabled={!editingJobCanSave}
                      onChange={(event) => setEditingJobForm({ ...editingJobForm, requirements: event.target.value })}
                      className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-black"
                    />
                  </label>
                </div>

                <fieldset className="mt-4">
                  <legend className="text-sm font-medium text-black">Skills</legend>
                  <SkillTagPicker
                    theme="light"
                    selected={editingJobForm.skills}
                    disabled={!editingJobCanSave}
                    onChange={(next) => setEditingJobForm({ ...editingJobForm, skills: next })}
                  />
                </fieldset>

                {editingJobCanSave && (
                  <div className="mt-5 flex justify-end gap-2">
                    <button
                      type="submit"
                      className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
                    >
                      Save Changes
                    </button>
                  </div>
                )}
              </form>
            </div>
          )}

          {approveRequestTarget && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="approve-request-title"
              onClick={() => setApproveRequestTarget(null)}
            >
              <div
                className="w-full max-w-md rounded-2xl border border-cyan-500/40 bg-slate-900 p-6 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 id="approve-request-title" className="text-lg font-semibold text-white">Approve employer request</h2>
                    <p className="mt-2 text-sm text-slate-400">{approveRequestTarget.companyName}</p>
                  </div>
                </div>
                <p className="mt-5 text-sm text-slate-300">Approve this employer? They will gain access to employer features.</p>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setApproveRequestTarget(null)}
                    className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const requestId = approveRequestTarget._id
                      setApproveRequestTarget(null)
                      handleReviewEmployerRequest(requestId, 'approved')
                    }}
                    className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
                  >
                    Confirm approval
                  </button>
                </div>
              </div>
            </div>
          )}

          {declineRequestTarget && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="decline-request-title"
              onClick={() => setDeclineRequestTarget(null)}
            >
              <form
                className="w-full max-w-md rounded-2xl border border-cyan-500/40 bg-slate-900 p-6 shadow-2xl"
                onSubmit={(event) => {
                  event.preventDefault()
                  const requestId = declineRequestTarget._id || declineRequestTarget.id
                  setDeclineRequestTarget(null)
                  setDeclineReason('')
                  handleReviewEmployerRequest(requestId, 'declined')
                }}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 id="decline-request-title" className="text-lg font-semibold text-white">Decline employer request</h2>
                    <p className="mt-2 text-sm text-slate-400">{declineRequestTarget.companyName}</p>
                  </div>
                </div>
                <label htmlFor="decline-reason" className="mt-5 block text-sm font-medium text-slate-200">
                  Reason for declining
                </label>
                <textarea
                  id="decline-reason"
                  value={declineReason}
                  onChange={(event) => setDeclineReason(event.target.value)}
                  rows="4"
                  required
                  placeholder="Explain what the employer needs to correct before resubmitting."
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                />
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDeclineRequestTarget(null)}
                    className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-2xl bg-rose-400 px-4 py-2 text-sm font-semibold text-slate-950"
                  >
                    Confirm decline
                  </button>
                </div>
              </form>
            </div>
          )}

          {declineJobTarget && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="decline-job-title"
              onClick={() => setDeclineJobTarget(null)}
            >
              <form
                className="w-full max-w-md rounded-2xl border border-cyan-500/40 bg-slate-900 p-6 shadow-2xl"
                onSubmit={(event) => {
                  event.preventDefault()
                  const jobId = declineJobTarget._id
                  handleReviewJob(jobId, 'declined', { reason: declineJobReason })
                }}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 id="decline-job-title" className="text-lg font-semibold text-white">Decline job posting</h2>
                    <p className="mt-2 text-sm text-slate-400">{declineJobTarget.title || 'Selected posting'}</p>
                  </div>
                </div>
                <label htmlFor="decline-job-reason" className="mt-5 block text-sm font-medium text-slate-200">
                  Reason for declining (optional)
                </label>
                <textarea
                  id="decline-job-reason"
                  value={declineJobReason}
                  onChange={(event) => setDeclineJobReason(event.target.value)}
                  rows="4"
                  placeholder="Explain why this posting was declined."
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                />
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDeclineJobTarget(null)
                      setDeclineJobReason('')
                    }}
                    className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-2xl bg-rose-400 px-4 py-2 text-sm font-semibold text-slate-950"
                  >
                    Confirm decline
                  </button>
                </div>
              </form>
            </div>
          )}

          {selectedNotification && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
              role="dialog"
              aria-modal="true"
              onClick={() => setSelectedNotification(null)}
            >
              <div
                className="w-full max-w-2xl rounded-2xl border border-slate-300 bg-white p-6 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-black">Notification details</h3>
                    <p className="mt-2 text-sm font-semibold text-black">{selectedNotification.title}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedNotification(null)}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm font-semibold text-black"
                  >
                    Close
                  </button>
                </div>

                <p className="mt-4 text-sm text-black">{selectedNotification.message}</p>
                <p className="mt-2 text-sm text-black">
                  Time: {selectedNotification.createdAt ? new Date(selectedNotification.createdAt).toLocaleString() : 'Just now'}
                </p>

                {selectedNotification.company && (
                  <p className="mt-2 text-sm text-black">Company: {selectedNotification.company}</p>
                )}
                {selectedNotification.location && (
                  <p className="mt-1 text-sm text-black">Location: {selectedNotification.location}</p>
                )}
                {selectedNotification.salary && (
                  <p className="mt-1 text-sm text-black">Salary: {selectedNotification.salary}</p>
                )}
                {selectedNotification.requirements && (
                  <p className="mt-1 text-sm text-black">Requirements: {selectedNotification.requirements}</p>
                )}
                {selectedNotification.description && (
                  <p className="mt-1 text-sm text-black">Description: {selectedNotification.description}</p>
                )}

                {activeRole === 'Admin' && selectedNotificationJobId && selectedNotificationIsPending && (
                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleReviewJob(selectedNotificationJobId, 'approved')}
                      className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
                    >
                      Approve here
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReviewJob(selectedNotificationJobId, 'declined')}
                      className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-black"
                    >
                      Decline here
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeView === "requests" && activeRole === "Admin" && (
            <section className="admin-requests-card rounded-2xl border border-slate-300 bg-white p-6 text-black">
              <h2 className="text-xl font-semibold text-black">Employer Requests</h2>
              <p className="mt-3 text-black">Review pending employer account requests.</p>

              {employerRequests.length === 0 ? (
                <p className="mt-4 text-black">No pending employer requests.</p>
              ) : (
                <div className="mt-6 space-y-4">
                  {employerRequests.map((request) => (
                    <div key={request._id} className="admin-request-item rounded-2xl border border-slate-700 bg-slate-950/80 p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-lg font-semibold text-white">{request.companyName}</p>
                          <p className="text-sm text-slate-400">Contact: {request.contactName}</p>
                          <p className="text-sm text-slate-400">Email: {request.email}</p>
                          <p className="text-sm text-slate-400">Location: {request.location || 'N/A'}</p>
                          <p className="text-sm text-slate-400">Phone: {request.phone || 'N/A'}</p>
                          <p className="mt-2 text-sm text-slate-300">{request.message || 'No additional message provided.'}</p>
                          <p className="mt-2 text-sm text-amber-300">Status: {request.status.replace('_', ' ')}</p>
                          {request.reviewReason && <p className="mt-1 text-sm text-rose-300">Previous review note: {request.reviewReason}</p>}
                          {request.requirementsFile && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => handleViewRequirements(request._id)}
                                className="rounded-2xl bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950"
                              >
                                View NSRP PDF
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDownloadRequirements(request._id, request.requirementsFile.originalName)}
                                className="rounded-2xl border border-cyan-500/50 bg-slate-800 px-3 py-2 text-sm font-semibold text-cyan-300"
                              >
                                Download PDF
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setApproveRequestTarget(request)}
                            className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeclineRequestTarget(request)
                              setDeclineReason('')
                            }}
                            className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {activeView === "peso-referrals" && activeRole === "Admin" && (
            <PesoReferralPanel
              token={getToken()}
              adminUsers={adminUsers}
              onLoadApplicants={fetchAdminUsers}
              initialJobId={referralPrefill.jobId}
              initialApplicantIds={referralPrefill.applicantIds}
            />
          )}
          </main>
        </div>
      </div>
    </div>
  )
}

export default App
