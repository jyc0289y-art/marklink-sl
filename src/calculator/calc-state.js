// OfficeLink SL — Calculator State (shared mutable state for all calculator modules)

/**
 * Shared mutable state object for the calculator.
 * All module-level `let` variables are collected here so that
 * sub-modules can read/write them via `CS.varName`.
 */
const CS = {
  // Core calculator state
  expression: '',
  result: '0',
  history: [],
  memory: 0,
  isDeg: true,
  lastAnswer: 0,

  // Cleanup registry for destroyCalculator()
  _calcCleanups: [],

  // Graph state
  GRAPH_COLORS: ['#0071e3', '#e74c3c', '#2ecc71', '#9b59b6', '#f39c12', '#1abc9c'],
  graphFunctions: [],
  graphRange: { xmin: -10, xmax: 10, ymin: -10, ymax: 10 },
  graphMode: 'cartesian',
  graphShowGrid: true,
  graphTraceEnabled: false,
  graphSnapEnabled: false,
  graphDragStart: null,
  graphDragRange: null,

  // 3D Surface state
  surface3dRotX: -0.6,
  surface3dRotY: 0.4,
  surface3dZoom: 1,
  surface3dDrag: null,

  // Programmer calc state
  progValue: 0n,
  progPendingOp: null,
  progPendingVal: null,
  progInput: '',

  // Physics calc state
  physicsSelectedCat: 'kinematics',
  physicsSelectedFormula: 0,

  // Saved formulas storage key
  SAVED_KEY: 'officelink-calc-saved',

  // Unit conversion data
  UNIT_DATA: {
    'Length': {
      'm': 1, 'km': 1000, 'cm': 0.01, 'mm': 0.001, '\u03BCm': 1e-6, 'nm': 1e-9,
      'mi': 1609.344, 'yd': 0.9144, 'ft': 0.3048, 'in': 0.0254,
      'nmi': 1852, 'ly': 9.461e15, 'AU': 1.496e11,
    },
    'Mass': {
      'kg': 1, 'g': 0.001, 'mg': 1e-6, '\u03BCg': 1e-9, 't': 1000,
      'lb': 0.453592, 'oz': 0.0283495, 'st': 6.35029,
      'ct': 0.0002, 'grain': 6.47989e-5,
    },
    'Temperature': { '\u00B0C': 'C', '\u00B0F': 'F', 'K': 'K' },
    'Speed': {
      'm/s': 1, 'km/h': 0.277778, 'mi/h': 0.44704,
      'ft/s': 0.3048, 'kn': 0.514444, 'c': 299792458,
    },
    'Area': {
      'mm\u00B2': 1e-6, 'm\u00B2': 1, 'cm\u00B2': 1e-4, 'km\u00B2': 1e6, 'ha': 10000,
      'acre': 4046.86, 'in\u00B2': 6.4516e-4, 'ft\u00B2': 0.092903, 'mi\u00B2': 2.59e6,
    },
    'Volume': {
      'L': 1, 'mL': 0.001, 'm\u00B3': 1000, 'cm\u00B3': 0.001,
      'gal(US)': 3.78541, 'qt': 0.946353, 'pt': 0.473176,
      'cup': 0.236588, 'fl oz': 0.0295735, 'tbsp': 0.0147868, 'tsp': 0.00492892,
    },
    'Time': {
      's': 1, 'ms': 0.001, '\u03BCs': 1e-6, 'ns': 1e-9,
      'min': 60, 'hr': 3600, 'day': 86400, 'week': 604800,
      'month': 2629746, 'year': 31556952,
    },
    'Energy': {
      'J': 1, 'kJ': 1000, 'cal': 4.184, 'kcal': 4184,
      'Wh': 3600, 'kWh': 3.6e6, 'eV': 1.602e-19,
      'BTU': 1055.06, 'ft\u00B7lbf': 1.35582,
    },
    'Pressure': {
      'Pa': 1, 'kPa': 1000, 'MPa': 1e6, 'bar': 1e5,
      'atm': 101325, 'psi': 6894.76, 'mmHg': 133.322, 'Torr': 133.322,
    },
    'Data': {
      'B': 1, 'KB': 1024, 'MB': 1048576, 'GB': 1073741824,
      'TB': 1.0995e12, 'PB': 1.1259e15,
      'bit': 0.125, 'Kbit': 128, 'Mbit': 131072,
    },
    'Angle': {
      'deg': 1, 'rad': 57.2958, 'grad': 0.9, 'arcmin': 1/60, 'arcsec': 1/3600, 'rev': 360,
    },
    'Force': {
      'N': 1, 'kN': 1000, 'dyn': 1e-5, 'lbf': 4.44822, 'kgf': 9.80665,
    },
    'Power': {
      'W': 1, 'kW': 1000, 'MW': 1e6, 'hp': 745.7, 'BTU/h': 0.29307,
    },
  },

  // Constants library data
  CONSTANTS_DATA: [
    // Mathematical
    { name: 'Pi', symbol: '\u03C0', value: '3.14159265358979', num: Math.PI, category: 'Mathematical', tags: 'pi circle ratio circumference' },
    { name: "Euler's number", symbol: 'e', value: '2.71828182845905', num: Math.E, category: 'Mathematical', tags: 'euler natural logarithm exponential' },
    { name: 'Golden Ratio', symbol: '\u03C6', value: '1.61803398874989', num: (1 + Math.sqrt(5)) / 2, category: 'Mathematical', tags: 'golden ratio phi fibonacci' },
    { name: 'Square Root of 2', symbol: '\u221A2', value: '1.41421356237310', num: Math.SQRT2, category: 'Mathematical', tags: 'sqrt root diagonal' },
    { name: 'Square Root of 3', symbol: '\u221A3', value: '1.73205080756888', num: Math.sqrt(3), category: 'Mathematical', tags: 'sqrt root' },
    { name: 'Natural Log of 2', symbol: 'ln(2)', value: '0.693147180559945', num: Math.LN2, category: 'Mathematical', tags: 'log natural' },
    { name: 'Natural Log of 10', symbol: 'ln(10)', value: '2.30258509299405', num: Math.LN10, category: 'Mathematical', tags: 'log natural' },
    { name: 'Euler-Mascheroni', symbol: '\u03B3', value: '0.577215664901532', num: 0.5772156649015329, category: 'Mathematical', tags: 'euler mascheroni gamma' },
    { name: 'Tau (2\u03C0)', symbol: '\u03C4', value: '6.28318530717959', num: 2 * Math.PI, category: 'Mathematical', tags: 'tau circle full turn' },
    // Physics
    { name: 'Speed of Light', symbol: 'c', value: '2.998 \u00D7 10\u2078 m/s', num: 299792458, category: 'Physics', tags: 'speed light vacuum electromagnetic' },
    { name: 'Gravitational Constant', symbol: 'G', value: '6.674 \u00D7 10\u207B\u00B9\u00B9 m\u00B3/(kg\u00B7s\u00B2)', num: 6.6743e-11, category: 'Physics', tags: 'gravity gravitational newton' },
    { name: 'Planck Constant', symbol: 'h', value: '6.626 \u00D7 10\u207B\u00B3\u2074 J\u00B7s', num: 6.62607e-34, category: 'Physics', tags: 'planck quantum energy' },
    { name: 'Reduced Planck', symbol: '\u0127', value: '1.055 \u00D7 10\u207B\u00B3\u2074 J\u00B7s', num: 1.05457e-34, category: 'Physics', tags: 'planck reduced hbar quantum' },
    { name: 'Boltzmann Constant', symbol: 'k_B', value: '1.381 \u00D7 10\u207B\u00B2\u00B3 J/K', num: 1.38065e-23, category: 'Physics', tags: 'boltzmann temperature thermodynamics entropy' },
    { name: 'Avogadro Number', symbol: 'N_A', value: '6.022 \u00D7 10\u00B2\u00B3 mol\u207B\u00B9', num: 6.02214e23, category: 'Physics', tags: 'avogadro mole number atoms molecules' },
    { name: 'Gas Constant', symbol: 'R', value: '8.314 J/(mol\u00B7K)', num: 8.31446, category: 'Physics', tags: 'gas ideal universal molar' },
    { name: 'Stefan-Boltzmann', symbol: '\u03C3', value: '5.670 \u00D7 10\u207B\u2078 W/(m\u00B2\u00B7K\u2074)', num: 5.67037e-8, category: 'Physics', tags: 'stefan boltzmann radiation blackbody' },
    { name: 'Vacuum Permittivity', symbol: '\u03B5\u2080', value: '8.854 \u00D7 10\u207B\u00B9\u00B2 F/m', num: 8.85419e-12, category: 'Physics', tags: 'permittivity vacuum electric' },
    { name: 'Vacuum Permeability', symbol: '\u03BC\u2080', value: '1.257 \u00D7 10\u207B\u2076 H/m', num: 1.25664e-6, category: 'Physics', tags: 'permeability vacuum magnetic' },
    { name: 'Coulomb Constant', symbol: 'k_e', value: '8.988 \u00D7 10\u2079 N\u00B7m\u00B2/C\u00B2', num: 8.98755e9, category: 'Physics', tags: 'coulomb electric force charge' },
    { name: 'Standard Gravity', symbol: 'g', value: '9.80665 m/s\u00B2', num: 9.80665, category: 'Physics', tags: 'gravity acceleration earth standard' },
    { name: 'Standard Atmosphere', symbol: 'atm', value: '101325 Pa', num: 101325, category: 'Physics', tags: 'atmosphere pressure standard' },
    // Atomic
    { name: 'Elementary Charge', symbol: 'e', value: '1.602 \u00D7 10\u207B\u00B9\u2079 C', num: 1.60218e-19, category: 'Atomic', tags: 'electron charge elementary proton' },
    { name: 'Electron Mass', symbol: 'm_e', value: '9.109 \u00D7 10\u207B\u00B3\u00B9 kg', num: 9.10938e-31, category: 'Atomic', tags: 'electron mass particle' },
    { name: 'Proton Mass', symbol: 'm_p', value: '1.673 \u00D7 10\u207B\u00B2\u2077 kg', num: 1.67262e-27, category: 'Atomic', tags: 'proton mass particle nucleon' },
    { name: 'Neutron Mass', symbol: 'm_n', value: '1.675 \u00D7 10\u207B\u00B2\u2077 kg', num: 1.67493e-27, category: 'Atomic', tags: 'neutron mass particle nucleon' },
    { name: 'Atomic Mass Unit', symbol: 'u', value: '1.661 \u00D7 10\u207B\u00B2\u2077 kg', num: 1.66054e-27, category: 'Atomic', tags: 'atomic mass unit dalton amu' },
    { name: 'Bohr Radius', symbol: 'a\u2080', value: '5.292 \u00D7 10\u207B\u00B9\u00B9 m', num: 5.29177e-11, category: 'Atomic', tags: 'bohr radius hydrogen atom orbital' },
    { name: 'Fine Structure Constant', symbol: '\u03B1', value: '7.297 \u00D7 10\u207B\u00B3', num: 7.29735e-3, category: 'Atomic', tags: 'fine structure alpha electromagnetic coupling' },
    { name: 'Rydberg Constant', symbol: 'R\u221E', value: '1.097 \u00D7 10\u2077 m\u207B\u00B9', num: 1.09737e7, category: 'Atomic', tags: 'rydberg spectral lines hydrogen' },
    { name: 'Faraday Constant', symbol: 'F', value: '96485.3 C/mol', num: 96485.3, category: 'Atomic', tags: 'faraday electrochemistry charge mole' },
    // Astronomical
    { name: 'Astronomical Unit', symbol: 'AU', value: '1.496 \u00D7 10\u00B9\u00B9 m', num: 1.49598e11, category: 'Astronomical', tags: 'astronomical unit earth sun distance' },
    { name: 'Light Year', symbol: 'ly', value: '9.461 \u00D7 10\u00B9\u2075 m', num: 9.46073e15, category: 'Astronomical', tags: 'light year distance star' },
    { name: 'Parsec', symbol: 'pc', value: '3.086 \u00D7 10\u00B9\u2076 m', num: 3.08568e16, category: 'Astronomical', tags: 'parsec distance parallax' },
    { name: 'Solar Mass', symbol: 'M\u2609', value: '1.989 \u00D7 10\u00B3\u2070 kg', num: 1.98892e30, category: 'Astronomical', tags: 'solar mass sun star' },
    { name: 'Earth Mass', symbol: 'M\u2295', value: '5.972 \u00D7 10\u00B2\u2074 kg', num: 5.97237e24, category: 'Astronomical', tags: 'earth mass planet' },
    { name: 'Earth Radius (mean)', symbol: 'R\u2295', value: '6.371 \u00D7 10\u2076 m', num: 6.37101e6, category: 'Astronomical', tags: 'earth radius planet' },
    { name: 'Solar Luminosity', symbol: 'L\u2609', value: '3.828 \u00D7 10\u00B2\u2076 W', num: 3.828e26, category: 'Astronomical', tags: 'solar luminosity sun brightness power' },
  ],

  // Physics formulas
  PHYSICS_FORMULAS: {
    kinematics: [
      { name: 'Velocity', formula: 'v = v0 + a*t', inputs: ['v0|Initial velocity (m/s)', 'a|Acceleration (m/s\u00B2)', 't|Time (s)'], calc: (v) => ({ result: v.v0 + v.a * v.t, label: 'Final velocity', unit: 'm/s' }) },
      { name: 'Displacement', formula: 's = v0*t + \u00BDa*t\u00B2', inputs: ['v0|Initial velocity (m/s)', 'a|Acceleration (m/s\u00B2)', 't|Time (s)'], calc: (v) => ({ result: v.v0 * v.t + 0.5 * v.a * v.t * v.t, label: 'Displacement', unit: 'm' }) },
      { name: 'v\u00B2 = v0\u00B2 + 2as', formula: 'v\u00B2 = v0\u00B2 + 2as', inputs: ['v0|Initial velocity (m/s)', 'a|Acceleration (m/s\u00B2)', 's|Displacement (m)'], calc: (v) => ({ result: Math.sqrt(v.v0 * v.v0 + 2 * v.a * v.s), label: 'Final velocity', unit: 'm/s' }) },
      { name: 'Free Fall', formula: 'h = \u00BDg*t\u00B2 (g=9.81)', inputs: ['t|Time (s)'], calc: (v) => ({ result: 0.5 * 9.81 * v.t * v.t, label: 'Height fallen', unit: 'm' }) },
      { name: 'Projectile Range', formula: 'R = v\u00B2sin(2\u03B8)/g', inputs: ['v|Launch speed (m/s)', 'theta|Angle (\u00B0)'], calc: (v) => ({ result: (v.v * v.v * Math.sin(2 * v.theta * Math.PI / 180)) / 9.81, label: 'Range', unit: 'm' }) },
    ],
    forces: [
      { name: "Newton's 2nd Law", formula: 'F = m*a', inputs: ['m|Mass (kg)', 'a|Acceleration (m/s\u00B2)'], calc: (v) => ({ result: v.m * v.a, label: 'Force', unit: 'N' }) },
      { name: 'Weight', formula: 'W = m*g', inputs: ['m|Mass (kg)'], calc: (v) => ({ result: v.m * 9.81, label: 'Weight', unit: 'N' }) },
      { name: 'Friction', formula: 'f = \u03BC*N', inputs: ['mu|Coeff. of friction', 'N|Normal force (N)'], calc: (v) => ({ result: v.mu * v.N, label: 'Friction force', unit: 'N' }) },
      { name: 'Centripetal Force', formula: 'F = mv\u00B2/r', inputs: ['m|Mass (kg)', 'v|Velocity (m/s)', 'r|Radius (m)'], calc: (v) => ({ result: v.m * v.v * v.v / v.r, label: 'Centripetal force', unit: 'N' }) },
      { name: 'Gravitational Force', formula: 'F = G*m1*m2/r\u00B2', inputs: ['m1|Mass 1 (kg)', 'm2|Mass 2 (kg)', 'r|Distance (m)'], calc: (v) => ({ result: 6.674e-11 * v.m1 * v.m2 / (v.r * v.r), label: 'Gravitational force', unit: 'N' }) },
    ],
    electricity: [
      { name: "Ohm's Law (V)", formula: 'V = I*R', inputs: ['I|Current (A)', 'R|Resistance (\u03A9)'], calc: (v) => ({ result: v.I * v.R, label: 'Voltage', unit: 'V' }) },
      { name: "Ohm's Law (I)", formula: 'I = V/R', inputs: ['V|Voltage (V)', 'R|Resistance (\u03A9)'], calc: (v) => ({ result: v.V / v.R, label: 'Current', unit: 'A' }) },
      { name: 'Power', formula: 'P = V*I', inputs: ['V|Voltage (V)', 'I|Current (A)'], calc: (v) => ({ result: v.V * v.I, label: 'Power', unit: 'W' }) },
      { name: 'Power (R)', formula: 'P = I\u00B2R', inputs: ['I|Current (A)', 'R|Resistance (\u03A9)'], calc: (v) => ({ result: v.I * v.I * v.R, label: 'Power', unit: 'W' }) },
      { name: "Coulomb's Law", formula: 'F = k*q1*q2/r\u00B2', inputs: ['q1|Charge 1 (C)', 'q2|Charge 2 (C)', 'r|Distance (m)'], calc: (v) => ({ result: 8.9875e9 * v.q1 * v.q2 / (v.r * v.r), label: 'Force', unit: 'N' }) },
      { name: 'Capacitance Energy', formula: 'E = \u00BDCV\u00B2', inputs: ['C|Capacitance (F)', 'V|Voltage (V)'], calc: (v) => ({ result: 0.5 * v.C * v.V * v.V, label: 'Energy', unit: 'J' }) },
    ],
    energy: [
      { name: 'Kinetic Energy', formula: 'KE = \u00BDmv\u00B2', inputs: ['m|Mass (kg)', 'v|Velocity (m/s)'], calc: (v) => ({ result: 0.5 * v.m * v.v * v.v, label: 'Kinetic energy', unit: 'J' }) },
      { name: 'Potential Energy', formula: 'PE = mgh', inputs: ['m|Mass (kg)', 'h|Height (m)'], calc: (v) => ({ result: v.m * 9.81 * v.h, label: 'Potential energy', unit: 'J' }) },
      { name: 'Work', formula: 'W = F*d*cos(\u03B8)', inputs: ['F|Force (N)', 'd|Distance (m)', 'theta|Angle (\u00B0)'], calc: (v) => ({ result: v.F * v.d * Math.cos(v.theta * Math.PI / 180), label: 'Work done', unit: 'J' }) },
      { name: 'Power (energy)', formula: 'P = W/t', inputs: ['W|Work/Energy (J)', 't|Time (s)'], calc: (v) => ({ result: v.W / v.t, label: 'Power', unit: 'W' }) },
      { name: 'E = mc\u00B2', formula: 'E = mc\u00B2', inputs: ['m|Mass (kg)'], calc: (v) => ({ result: v.m * 299792458 * 299792458, label: 'Energy', unit: 'J' }) },
    ],
    waves: [
      { name: 'Wave Speed', formula: 'v = f*\u03BB', inputs: ['f|Frequency (Hz)', 'lambda|Wavelength (m)'], calc: (v) => ({ result: v.f * v.lambda, label: 'Wave speed', unit: 'm/s' }) },
      { name: 'Period', formula: 'T = 1/f', inputs: ['f|Frequency (Hz)'], calc: (v) => ({ result: 1 / v.f, label: 'Period', unit: 's' }) },
      { name: 'Photon Energy', formula: 'E = h*f', inputs: ['f|Frequency (Hz)'], calc: (v) => ({ result: 6.626e-34 * v.f, label: 'Energy', unit: 'J' }) },
      { name: 'dB Level', formula: 'dB = 10*log10(P/P0)', inputs: ['P|Power (W)', 'P0|Reference Power (W)'], calc: (v) => ({ result: 10 * Math.log10(v.P / v.P0), label: 'Level', unit: 'dB' }) },
      { name: 'Doppler (approaching)', formula: "f' = f*(v+vo)/(v-vs)", inputs: ['f|Source freq (Hz)', 'vs|Source speed (m/s)', 'vo|Observer speed (m/s)'], calc: (v) => ({ result: v.f * (343 + v.vo) / (343 - v.vs), label: 'Observed freq', unit: 'Hz' }) },
    ],
  },
};

export default CS;
