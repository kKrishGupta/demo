import { SAMPLE_PEOPLE } from '../../data/samplePeople.js';
import { SAMPLE_PROJECTS } from '../../data/sampleProjects.js';

export const REGRESSION_PEOPLE = [
  ...SAMPLE_PEOPLE,
  {
    id: 'p_mohan',
    name: 'Mohan Das',
    email: 'mohan.das@example.com',
    department: 'Operations',
    role: 'Kitchen Lead',
    avatar: 'MD',
    aliases: ['mohan', 'mohan das', 'मोहन']
  },
  {
    id: 'p_neha',
    name: 'Neha Kapoor',
    email: 'neha.kapoor@example.com',
    department: 'Operations',
    role: 'Inventory Lead',
    avatar: 'NK',
    aliases: ['neha', 'neha kapoor', 'नेहा']
  },
  {
    id: 'p_suresh',
    name: 'Suresh Patel',
    email: 'suresh.patel@example.com',
    department: 'Operations',
    role: 'Site Logistics',
    avatar: 'SP',
    aliases: ['suresh', 'suresh patel', 'सुरेश']
  },
  {
    id: 'p_amit',
    name: 'Amit Kumar',
    email: 'amit.kumar@example.com',
    department: 'Operations',
    role: 'Operations Executive',
    avatar: 'AK',
    aliases: ['amit', 'amit kumar', 'अमित']
  },
  {
    id: 'p_vikram',
    name: 'Vikram Rao',
    email: 'vikram.rao@example.com',
    department: 'Operations',
    role: 'Maintenance Specialist',
    avatar: 'VR',
    aliases: ['vikram', 'vikram rao', 'विक्रम']
  },
  {
    id: 'p_pooja',
    name: 'Pooja Nair',
    email: 'pooja.nair@example.com',
    department: 'Operations',
    role: 'Event Coordinator',
    avatar: 'PN',
    aliases: ['pooja', 'pooja nair', 'पूजा']
  },
  {
    id: 'p_rohit',
    name: 'Rohit Sharma',
    email: 'rohit.sharma@example.com',
    department: 'Operations',
    role: 'Plant Operator',
    avatar: 'RS',
    aliases: ['rohit', 'rohit sharma', 'रोहित']
  },
  {
    id: 'p_rohan',
    name: 'Rohan Mehra',
    email: 'rohan.mehra@example.com',
    department: 'Operations',
    role: 'Facility Attendant',
    avatar: 'RM',
    aliases: ['rohan', 'rohan mehra', 'रोहन']
  },
  // Functional Role Entities
  {
    id: 'p_maint_team',
    name: 'Maintenance Team',
    email: 'maintenance.team@example.com',
    department: 'Operations',
    role: 'Maintenance Team',
    avatar: 'MT',
    aliases: ['maintenance team']
  },
  {
    id: 'p_housekeeping',
    name: 'Housekeeping',
    email: 'housekeeping@example.com',
    department: 'Operations',
    role: 'Housekeeping',
    avatar: 'HK',
    aliases: ['housekeeping']
  },
  {
    id: 'p_wh_supervisor',
    name: 'Warehouse Supervisor',
    email: 'warehouse.supervisor@example.com',
    department: 'Operations',
    role: 'Warehouse Supervisor',
    avatar: 'WS',
    aliases: ['warehouse supervisor']
  },
  {
    id: 'p_driver',
    name: 'Driver',
    email: 'driver@example.com',
    department: 'Operations',
    role: 'Driver',
    avatar: 'DR',
    aliases: ['driver']
  },
  {
    id: 'p_technician',
    name: 'Technician',
    email: 'technician@example.com',
    department: 'Operations',
    role: 'Technician',
    avatar: 'TC',
    aliases: ['technician']
  },
  {
    id: 'p_biomedical',
    name: 'Biomedical Team',
    email: 'biomedical.team@example.com',
    department: 'Engineering',
    role: 'Biomedical Team',
    avatar: 'BM',
    aliases: ['biomedical team']
  },
  {
    id: 'p_quality_team',
    name: 'Quality Team',
    email: 'quality.team@example.com',
    department: 'Engineering',
    role: 'Quality Team',
    avatar: 'QT',
    aliases: ['quality team']
  },
  {
    id: 'p_storekeeper',
    name: 'Storekeeper',
    email: 'storekeeper@example.com',
    department: 'Operations',
    role: 'Storekeeper',
    avatar: 'SK',
    aliases: ['storekeeper']
  },
  {
    id: 'p_farm_worker',
    name: 'Farm Worker',
    email: 'farm.worker@example.com',
    department: 'Operations',
    role: 'Farm Worker',
    avatar: 'FW',
    aliases: ['farm worker']
  },
  {
    id: 'p_lab_assistant',
    name: 'Lab Assistant',
    email: 'lab.assistant@example.com',
    department: 'Engineering',
    role: 'Lab Assistant',
    avatar: 'LA',
    aliases: ['lab assistant']
  },
  {
    id: 'p_temple_team',
    name: 'Temple Team',
    email: 'temple.team@example.com',
    department: 'Operations',
    role: 'Temple Team',
    avatar: 'TT',
    aliases: ['temple team']
  },
  {
    id: 'p_finance_mgr',
    name: 'Finance Manager',
    email: 'finance.manager@example.com',
    department: 'Operations',
    role: 'Finance Manager',
    avatar: 'FM',
    aliases: ['finance manager', 'finance team']
  }
];

export const REGRESSION_PROJECTS = [
  ...SAMPLE_PROJECTS,
  {
    id: 'proj_ko',
    name: 'Kitchen Operations',
    code: 'KO-12',
    department: 'Operations',
    description: 'Daily kitchen and pantry operations',
    aliases: ['kitchen operations']
  }
];
